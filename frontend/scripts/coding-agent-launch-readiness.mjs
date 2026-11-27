import path from 'node:path';
import {readFile,lstat} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readManifest} from '../../scripts/site-manifest.mjs';
import {atomicWrite,json,sha256,assertFixtureRuntime} from './coding-agent-evaluation/fixtureKit.mjs';
import {inspectQualification,DEPLOYMENT_DIRECTORY} from './coding-agent-evaluation/qualificationPreflight.mjs';
import {captureBrowserConfiguration,validateRuntimeCapture} from './coding-agent-evaluation/runtimeCapture.mjs';
import {assessLiveReadiness,summarizeGatewayReply,readinessExitCode} from './coding-agent-evaluation/launchReadiness.mjs';

// A separate diagnostic: never a campaign adapter, model-quality sample, or authorization input.
const repository=fileURLToPath(new URL('../../',import.meta.url)),args=process.argv.slice(2);
let output,browser,context,report,preflight,manifest,siteManifestSha256,capture,browserVersion,emptyStorageBefore;
const probe={mode:args[0]==='--demo-probe'?'demo_probe':'offline',requests:[],replies:[],
  responseStatuses:[],requestFailures:[],
  outcome:'not_started',clientLimits:{sessions:1,providerCalls:1,requestBytes:4096,responseBytes:2097152,timeoutMs:45000},
  billingBoundsQualified:false};
const fail=code=>{throw new Error(code);};
try{
  assertFixtureRuntime();
  if(args.length!==9||!['--offline','--demo-probe'].includes(args[0])
    ||['--suite','--manifest','--output','--browser'].some((key,i)=>args[i*2+1]!==key))fail('readiness_options_invalid');
  const suite=path.resolve(args[2]),target=path.resolve(args[4]),destination=path.resolve(args[6]);
  if(destination===suite||destination.startsWith(suite+path.sep)||destination===target)fail('readiness_destination_invalid');
  try{await lstat(destination);fail('readiness_report_exists');}catch(error){if(error.code!=='ENOENT')throw error;}
  const stat=await lstat(target);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2097152)fail('readiness_manifest_invalid');
  manifest=JSON.parse(await readFile(target,'utf8'));preflight=await inspectQualification(repository,suite,manifest);
  if(preflight.status!=='preflight_complete')fail('readiness_preflight_invalid');
  const deploymentRoot=path.join(repository,DEPLOYMENT_DIRECTORY);
  siteManifestSha256=sha256(await readFile(path.join(deploymentRoot,'SHA256SUMS.txt')));
  const pins=await readManifest(deploymentRoot),snapshot=new Map();
  for(const [file,digest]of pins){const bytes=await readFile(path.join(deploymentRoot,file));if(sha256(bytes)!==digest)fail('readiness_build_drift');snapshot.set(file,bytes);}
  const index=[...pins.keys()].find(p=>/^assets\/csv_data_analysis_index-.*\.js$/.test(p));
  if(!index)fail('readiness_bundle_missing');
  output=destination;
  const persistPending=()=>atomicWrite(output,json({schemaVersion:1,ticket:'CA-173',status:'running',launchReady:false,
    liveRunAuthorized:false,qualificationSha256:preflight.qualificationSha256,siteManifestSha256,probe,
    accountingStatus:'uncertain_until_final_report; do_not_replay'}));
  await persistPending();
  const require=createRequire(import.meta.url),{chromium}=require('playwright-core');
  browser=await chromium.launch({executablePath:args[8],headless:true,args:['--disable-background-networking']});
  browserVersion=browser.version();context=await browser.newContext({serviceWorkers:'block'});
  const storage=await context.storageState();emptyStorageBefore=storage.cookies.length===0&&storage.origins.length===0;
  const page=await context.newPage(),appOrigin='https://yapweijun1996.github.io',prefix='/CSV-Data-Analysis-Agent/',gateway='https://gpt.yapweijun1996.com';
  const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml'};
  let denied=0,pageErrors=0,consoleErrors=0;
  page.on('pageerror',()=>pageErrors++);page.on('console',m=>{if(m.type()==='error')consoleErrors++;});
  page.on('response',response=>{
    const url=new URL(response.url());
    if(url.origin===gateway&&['/demo/session','/demo/v1/responses'].includes(url.pathname))
      probe.responseStatuses.push({kind:url.pathname==='/demo/session'?'session':'provider',status:response.status()});
  });
  page.on('requestfailed',request=>{
    const url=new URL(request.url());
    if(url.origin===gateway&&['/demo/session','/demo/v1/responses'].includes(url.pathname)){
      const text=request.failure()?.errorText??'';
      probe.requestFailures.push({kind:url.pathname==='/demo/session'?'session':'provider',
        reason:/^net::ERR_[A-Z_]+$/.test(text)?text:'gateway_transport_failed'});
    }
  });
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin===appOrigin&&url.pathname.startsWith(prefix)){
      const file=decodeURIComponent(url.pathname.slice(prefix.length))||'index.html',bytes=snapshot.get(file);
      return bytes?route.fulfill({status:200,contentType:types[path.extname(file)]??'application/octet-stream',body:bytes}):route.fulfill({status:404,body:''});
    }
    if(probe.mode==='demo_probe'&&url.origin===gateway&&['/demo/session','/demo/v1/responses'].includes(url.pathname)
      &&!url.search&&!url.hash&&!url.username&&!url.password&&req.method()==='POST'){
      const kind=url.pathname==='/demo/session'?'session':'provider',body=req.postData()??'';
      const expectedKind=probe.requests.length===0?'session':probe.requests.length===1?'provider':null;
      let parsed;try{parsed=JSON.parse(body);}catch{return route.abort();}
      const forbidden=Object.hasOwn(parsed,'max_output_tokens'),fault=/scheduleSha256|evaluationFault/.test(body);
      if(kind!==expectedKind||Buffer.byteLength(body)>4096||forbidden||fault||!validateRuntimeCapture(capture,manifest.candidate))return route.abort();
      probe.requests.push({kind,bodySha256:sha256(body),bodyBytes:Buffer.byteLength(body),maxOutputTokensPresent:forbidden,faultMetadataPresent:fault});
      // Persist each physical attempt before releasing it, including an unknown-usage crash.
      await persistPending();return route.continue();
    }
    denied++;return route.abort();
  });
  await page.goto(appOrigin+prefix);await page.waitForFunction(()=>document.body.innerText.includes('Select a file'));
  capture=await captureBrowserConfiguration(page,appOrigin+prefix+index);
  if(!emptyStorageBefore||!validateRuntimeCapture(capture,manifest.candidate))fail('readiness_runtime_mismatch');
  if(probe.mode==='demo_probe'){
    await page.exposeFunction('recordGatewayProbeReply',async record=>{
      probe.replies.push(summarizeGatewayReply(record.kind,record.status,record.payload));await persistPending();
    });
    const outcome=await page.evaluate(async()=>{
      const origin='https://gpt.yapweijun1996.com',signal=AbortSignal.timeout(45000);
      const read=async response=>{
        if(response.redirected||!response.body)throw new Error('probe_response_invalid');
        const reader=response.body.getReader(),parts=[];let size=0;
        for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;
          if(size>2097152){await reader.cancel();throw new Error('probe_response_limit');}parts.push(value);}
        const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
        return JSON.parse(new TextDecoder().decode(bytes));
      };
      let stage='session';
      try{
      const sessionResponse=await fetch(origin+'/demo/session',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({project_id:'github-pages'}),signal,redirect:'error'});
      const session=await read(sessionResponse),project=value=>({model:value.model,
        resolved_provider:Boolean(value.resolved_provider),resolved_model:Boolean(value.resolved_model),
        pricing:Boolean(value.pricing),limits:Boolean(value.limits)});
      await globalThis.recordGatewayProbeReply({kind:'session',status:sessionResponse.status,payload:project(session)});
      if(!sessionResponse.ok||typeof session.token!=='string'||!session.token||typeof session.model!=='string')
        return {failure:'probe_session_invalid',stage};
      stage='provider';
      const response=await fetch(origin+'/demo/v1/responses',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},
        body:JSON.stringify({model:session.model,input:[{role:'user',content:'Reply with OK.'}],stream:false,store:false,reasoning:{effort:'medium'}}),signal,redirect:'error'});
      const payload=await read(response);await globalThis.recordGatewayProbeReply({kind:'provider',status:response.status,
        payload:{...project(payload),status:payload.status,usage:payload.usage?{
          input_tokens:payload.usage.input_tokens,output_tokens:payload.usage.output_tokens,total_tokens:payload.usage.total_tokens}:null}});
      return {failure:null,stage};
      }catch(error){return {stage,failure:['AbortError','TimeoutError','TypeError','SyntaxError'].includes(error?.name)
        ?'probe_'+error.name.toLowerCase():['probe_response_invalid','probe_response_limit'].includes(error?.message)
          ?error.message:'probe_transport_unavailable'};}
    });
    probe.failure=outcome.failure;probe.failureStage=outcome.failure?outcome.stage:null;
    probe.outcome=probe.replies.length===2&&probe.replies[1].usageStatus==='observed'?'observed':'incomplete';
  }else probe.outcome='not_requested';
  const after=await captureBrowserConfiguration(page,appOrigin+prefix+index);
  if(after.sha256!==capture.sha256)fail('readiness_runtime_changed');
  probe.browserDiagnostics={deniedExternalRequests:denied,pageErrors,consoleErrors,
    optionalVectorDownloads:'blocked; their initialization errors are recorded, not model or page exceptions'};
  if(pageErrors)fail('readiness_page_error');
  // A slow probe cannot bless pins which changed while it was in flight.
  preflight=await inspectQualification(repository,suite,manifest);
  report=assessLiveReadiness({manifest,preflight,capture,probe,siteManifestSha256,browserVersion,emptyStorageBefore});
}catch(error){
  const reason=/^[a-z_]+$/.test(error?.message??'')?error.message:'readiness_execution_unavailable';
  report={schemaVersion:1,ticket:'CA-173',status:'invalid',launchReady:false,liveRunAuthorized:false,reasons:[reason],probe,
    qualificationSha256:preflight?.qualificationSha256??null,siteManifestSha256:siteManifestSha256??null,
    runtimeCapture:validateRuntimeCapture(capture,manifest?.candidate)?capture:null,
    accountingStatus:probe.requests.length?'usage_may_be_unknown; do_not_replay':'no_remote_dispatch'};
}finally{await context?.close().catch(()=>{});await browser?.close().catch(()=>{});}
if(output)try{await atomicWrite(output,json(report));}catch{report={status:'invalid',launchReady:false,liveRunAuthorized:false,reasons:['readiness_report_publication_failed']};}
process.stdout.write(json({status:report.status,launchReady:report.launchReady,liveRunAuthorized:report.liveRunAuthorized,
  gates:report.gates,launchBlockers:report.launchBlockers,reasons:report.reasons,accounting:report.accounting}));
process.exitCode=readinessExitCode(report);
