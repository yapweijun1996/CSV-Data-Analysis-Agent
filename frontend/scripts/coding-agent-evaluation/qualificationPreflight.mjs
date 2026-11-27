import { readFile, lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { inspectFixtureSuite, readFixtureArtifact } from './preflight.mjs';
import { FAMILIES, sha256, json, assertFixtureRuntime } from './fixtureKit.mjs';
import { readManifest, hashFile } from '../../../scripts/site-manifest.mjs';
import { QUALIFICATION_THRESHOLDS } from './qualificationContract.mjs';

const HASH = /^[a-f0-9]{64}$/;
const sourceDirectories = ['components', 'config', 'hooks', 'icons', 'services', 'store', 'types', 'utils'];
const sourceFiles = ['App.tsx', 'index.tsx', 'index.html', 'index.css', 'types.ts', 'package.json', 'package-lock.json',
  'vite.config.ts', 'tsconfig.json', 'postcss.config.cjs', 'tailwind.config.cjs', 'metadata.json', 'storageService.ts', '.nvmrc'];
const evaluatorFiles = ['frontend/scripts/coding-agent-evaluation/fixtureKit.mjs',
  'frontend/scripts/coding-agent-evaluation/preflight.mjs',
  'frontend/scripts/coding-agent-evaluation/qualificationPreflight.mjs',
  'frontend/scripts/coding-agent-qualification-preflight.mjs',
  'frontend/tests/fixtures/coding-agent-suite.lock.json',
  'frontend/scripts/coding-agent-evaluation/qualificationContract.mjs',
  'frontend/scripts/coding-agent-evaluation/campaign.mjs','frontend/scripts/coding-agent-evaluation/scoring.mjs',
  'frontend/scripts/coding-agent-evaluation/runner.mjs','frontend/scripts/coding-agent-evaluation/browserAdapter.mjs',
  'frontend/scripts/coding-agent-campaign.mjs',
  'frontend/scripts/coding-agent-evaluation/weighted-median-demo.mjs',
  'frontend/scripts/coding-agent-evaluation/s8-2-demo.mjs',
  'frontend/scripts/coding-agent-evaluation/scopeRepairMock.mjs',
  'frontend/scripts/coding-agent-evaluation/runtimeCapture.mjs',
  'frontend/scripts/coding-agent-evaluation/launchReadiness.mjs',
  'frontend/scripts/coding-agent-launch-readiness.mjs',
  'frontend/scripts/coding-agent-evaluation/liveHttpAdapter.mjs',
  'frontend/scripts/coding-agent-evaluation/faultSchedule.mjs',
  'frontend/scripts/coding-agent-evaluation/live-adapter-mock.mjs'];

export const LIVE_LAUNCH_BLOCKERS = Object.freeze(['resolved_provider_model_missing',
  'isolated_runtime_configuration_not_captured', 'paid_authorization_missing',
  'live_transport_usage_bounds_not_qualified', 'holdout_fault_recovery_not_live_qualified']);

const fail = code => { throw new Error(code); };
const relativePath = value => typeof value === 'string' && value.length <= 240
  && !value.includes('\\') && !path.posix.isAbsolute(value) && path.posix.normalize(value) === value
  && value.split('/').every(part => part && part !== '.' && part !== '..');
export const DEPLOYMENT_DIRECTORY = 'frontend/dist';
const regularRoot = async root => {
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('repository_root_invalid');
};
const regularFile = async (root, relative, maxBytes = 256 * 1024 * 1024) => {
  if (!relativePath(relative)) fail('pin_path_invalid');
  let target = root;
  for (const part of relative.split('/')) {
    target = path.join(target, part);
    if ((await lstat(target)).isSymbolicLink()) fail('pin_symlink_denied');
  }
  const stat = await lstat(target);
  if (!stat.isFile() || stat.size > maxBytes) fail('pin_size_or_type_invalid');
  return target;
};
const read = async (root, relative) => readFile(await regularFile(root, relative, 4 * 1024 * 1024), 'utf8');
const pin = async (root, relative) => ({ path: relative, sha256: await hashFile(await regularFile(root, relative)) });
const walk = async (root, relative, depth = 0) => {
  if (depth > 12) fail('pin_directory_depth_invalid');
  const stat = await lstat(path.join(root, relative));
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('pin_directory_invalid');
  const files = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) fail('pin_symlink_denied');
    const file = `${relative}/${entry.name}`;
    if (!relativePath(file)) fail('pin_path_invalid');
    if (entry.isDirectory()) files.push(...await walk(root, file, depth + 1));
    else if (entry.isFile()) files.push(file);
    else fail('pin_size_or_type_invalid');
    if (files.length > 4096) fail('pin_count_invalid');
  }
  return files.sort();
};

// Only declared app source and checksum-managed deployment files are read. No operator settings or credentials.
const repositoryPins = async root => {
  await regularRoot(root);
  const sources = sourceFiles.map(file => `frontend/${file}`);
  for (const directory of sourceDirectories) sources.push(...await walk(root, `frontend/${directory}`));
  if (new Set(sources).size !== sources.length || sources.length > 4096) fail('pin_count_invalid');
  const source = await Promise.all(sources.sort().map(file => pin(root, file)));
  const evaluators = await Promise.all(evaluatorFiles.map(file => pin(root, file)));
  // The deployment is the CI-style production build (`npm run build`); it is no longer checked in at the repository root.
  await regularFile(root, `${DEPLOYMENT_DIRECTORY}/SHA256SUMS.txt`, 1024 * 1024);
  const checksum = await readManifest(path.join(root, DEPLOYMENT_DIRECTORY));
  if (checksum.size < 1 || checksum.size > 512 || !checksum.has('index.html')) fail('deployment_manifest_invalid');
  const deployment = [];
  for (const [file, expected] of [...checksum].sort(([a], [b]) => a.localeCompare(b))) {
    const actual = await pin(root, `${DEPLOYMENT_DIRECTORY}/${file}`);
    if (actual.sha256 !== expected) fail('deployment_hash_mismatch');
    deployment.push(actual);
  }
  return { source, evaluator: evaluators, deployment, deploymentManifest: await pin(root, `${DEPLOYMENT_DIRECTORY}/SHA256SUMS.txt`) };
};
const literal = (source, regex) => {
  const value = source.match(regex)?.[1];
  if (!value) fail('source_default_unresolved');
  return value;
};
const dependencyPins = async root => {
  const lock = JSON.parse(await read(root, 'frontend/package-lock.json'));
  return Object.fromEntries(['@earendil-works/pi-agent-core', '@earendil-works/pi-ai',
    'quickjs-emscripten-core', '@jitl/quickjs-wasmfile-release-sync', '@duckdb/duckdb-wasm',
    'apache-arrow', '@modelcontextprotocol/client'].map(name => {
    const version = lock.packages?.[`node_modules/${name}`]?.version;
    if (typeof version !== 'string' || !/^[0-9][a-zA-Z0-9.+-]{0,79}$/.test(version)) fail('dependency_pin_missing');
    return [name, version];
  }));
};
const candidateConfiguration = async root => {
  const gateway = await read(root, 'frontend/config/defaultGatewayConfig.ts');
  const defaults = await read(root, 'frontend/services/storage/settings.ts');
  const budget = await read(root, 'frontend/services/agent/runtime/pi/piTaskBudget.ts');
  const context = await read(root, 'frontend/config/agentDefaults.ts');
  // The source declares each limit as a number, minutes (`N * 60_000`) or the
  // explicit unbounded constant. Record what the runtime really uses.
  const unbounded = /UNBOUNDED_TASK_LIMIT = Number\.MAX_SAFE_INTEGER;/.test(budget);
  const limits = Object.fromEntries(['toolCalls', 'skillReads', 'providerTurns', 'transformationAttempts', 'activeMs'].map(key => {
    const declared = literal(budget, new RegExp(`${key}: (UNBOUNDED_TASK_LIMIT|[0-9]+ \\* 60_000|[0-9]+)`));
    if (declared === 'UNBOUNDED_TASK_LIMIT') return [key, unbounded ? Number.MAX_SAFE_INTEGER : NaN];
    return [key, declared.split(' * ').reduce((total, factor) => total * Number(factor.replaceAll('_', '')), 1)];
  }));
  if (Object.values(limits).some(value => !Number.isSafeInteger(value) || value <= 0)) fail('task_limits_invalid');
  const contextCap = Number(literal(context, /PROVIDER_CONTEXT_WINDOW_CAP = ([0-9_]+)/).replaceAll('_', ''));
  const compaction = Number(literal(context, /PI_CONTEXT_COMPACTION_TRIGGER_RATIO = ([0-9.]+)/));
  if (contextCap !== 200000 || compaction !== 0.8) fail('context_policy_changed');
  const skills = (await walk(root, 'frontend/services/agent/skills/builtin')).filter(file => file.endsWith('/SKILL.md'));
  if (skills.length < 1 || skills.length > 100) fail('skills_empty_or_unbounded');
  const entries = [];
  for (const file of skills) {
    const markdown = await read(root, file);
    const name = literal(markdown, /^name: (.+)$/m).trim();
    const rawManifest = markdown.match(/^manifest: (.+)$/m)?.[1];
    const manifest = rawManifest ? JSON.parse(rawManifest) : null;
    entries.push({ name, path: file, sha256: sha256(markdown), version: manifest?.version ?? 'legacy', enabled: true });
  }
  if (new Set(entries.map(item => item.name)).size !== entries.length) fail('skill_identity_duplicate');
  return { pairId: 'default-browser-javascript-candidate', profile: 'browser-javascript', localSql: true,
    provider: 'default', logicalModel: literal(gateway, /DEFAULT_GATEWAY_MODEL = '([^']+)'/),
    resolvedProviderModel: null, settings: { origin: 'source_defaults_candidate', runtimeCaptured: false,
      reasoningEffort: literal(defaults, /reasoningEffort: '([^']+)'/), language: 'English',
      contextCap, compactionTrigger: compaction, taskLimits: limits,
      overridePolicy: 'fresh_storage_no_user_or_workspace_skills_no_external_connectors',
      modelFallback: null, providerWireContract: 'default_gateway_omits_max_output_tokens' },
    skills: entries, runtime: { preflightNode: process.versions.node, dependencies: await dependencyPins(root) },
    paidAuthorization: null, proposedCeilings: { spendUsd: null, providerCalls: null, inputTokens: null, outputTokens: null },
    usageBoundary: 'all_requests_including_health_intent_planning_compaction_retries_and_resumes',
    launchBlockers: [...LIVE_LAUNCH_BLOCKERS] };
};

/** A deterministic review packet for the current local candidate; never an authority to call a model. */
export const freezeQualification = async (repository, suite) => {
  assertFixtureRuntime();
  const fixture = await inspectFixtureSuite(suite);
  if (fixture.status !== 'fixture_ready') fail('fixture_integrity_invalid');
  const rawManifest = await readFixtureArtifact(suite, 'manifest.json');
  const cases = JSON.parse(rawManifest.toString('utf8'));
  const configuration = await candidateConfiguration(repository);
  const revision = execFileSync('git', ['rev-parse', '--verify', 'HEAD'],
    { cwd: repository, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (!/^[a-f0-9]{40}$/.test(revision)) fail('source_revision_invalid');
  const faults = [];
  for (const item of cases.cases) {
    const oracle = JSON.parse((await readFixtureArtifact(suite, `evaluator/${item.id}/oracle.json`)).toString('utf8'));
    if (oracle.faultSchedule.length) faults.push({ caseId: item.id, scheduleSha256: sha256(json(oracle.faultSchedule)) });
  }
  if (!faults.length) fail('failure_recovery_coverage_missing');
  return { schemaVersion: 1, ticket: 'CA-173', mode: 'zero_call_candidate', syntheticOnly: true,
    sourceIdentity: { head: revision, authority: 'captured_working_tree_hashes_not_head_alone' },
    suite: { id: cases.suiteId, manifestSha256: fixture.manifestSha256, counts: fixture.counts,
      replicateSeeds: cases.replicateSeeds, familyRuns: FAMILIES.map(family => ({ family,
        runs: QUALIFICATION_THRESHOLDS.familyRuns, minimumCorrect: QUALIFICATION_THRESHOLDS.familyMinimumCorrect })),
      failureRecovery: faults }, candidate: configuration, pins: await repositoryPins(repository),
    evaluation: { oracleCustody: 'evaluator_only', agentInput: 'only_declared_agent_files',
      freshSessionPerRun: true, noModelOrProfilePooling: true, approval: 'exact_host_approval_required',
      firstAttemptAndAfterRevisionSeparate: true, recordAllAttemptsAndNonSuccess: true,
      thresholds: { ...QUALIFICATION_THRESHOLDS }, criticalFailures: ['unauthorized_mutation', 'source_loss', 'credential_disclosure',
        'session_contamination', 'fabricated_receipt', 'false_completed', 'silent_destructive_assumption'],
      requiredAccounting: ['attempts', 'blocked', 'cancelled', 'failed', 'tool_calls', 'retries', 'input_tokens',
        'output_tokens', 'spend', 'median_latency', 'p95_latency', 'stop_acknowledgement', 'local_termination'],
      liveRunner: 'production_runtime_mock_adapter', liveTransport: 'not_qualified' },
    schedule: cases.cases.flatMap(item => cases.replicateSeeds.map(seed => ({
      id: `${configuration.pairId}/${item.id}/${seed}`, pairId: configuration.pairId, caseId: item.id, seed,
      agentFiles: item.agentFiles, evaluatorFiles: item.evaluatorFiles }))) };
};

// Reject extra fields and semantic changes as well as byte/hash drift; property order is immaterial.
const canonical = value => {
  const normalize = (item, depth = 0) => {
    if (depth > 20) fail('qualification_value_invalid');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (Array.isArray(item)) return item.map(value => normalize(value, depth + 1));
    if (item && typeof item === 'object' && Object.getPrototypeOf(item) === Object.prototype)
      return Object.fromEntries(Object.keys(item).sort().map(key => [key, normalize(item[key], depth + 1)]));
    fail('qualification_value_invalid');
  };
  return JSON.stringify(normalize(value));
};
export const inspectQualification = async (repository, suite, manifest) => {
  const base = { schemaVersion: 1, mode: 'zero_call', providerCalls: 0, evaluatedRuns: 0, paidSpendUsd: 0,
    liveRunAuthorized: false, launchReady: false, capabilityAcceptance: 'pending' };
  try {
    const expected = await freezeQualification(repository, suite);
    if (canonical(manifest) !== canonical(expected)) fail('qualification_manifest_drift');
    if (!HASH.test(expected.suite.manifestSha256)) fail('fixture_integrity_invalid');
    return { ...base, status: 'preflight_complete', reasons: [], launchBlockers: [...LIVE_LAUNCH_BLOCKERS],
      qualificationSha256: sha256(json(manifest)), suiteManifestSha256: expected.suite.manifestSha256,
      pins: { sourceFiles: expected.pins.source.length, evaluatorFiles: expected.pins.evaluator.length,
        deploymentFiles: expected.pins.deployment.length, skills: expected.candidate.skills.length },
      counts: expected.suite.counts, failureRecoveryCases: expected.suite.failureRecovery.length,
      pairId: expected.candidate.pairId, denominators: { solvable: 120, family: 15, ambiguous: 30, adversarial: 30 },
      thresholds: expected.evaluation.thresholds };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return { ...base, status: 'invalid', reasons: [/^[a-z_]+$/.test(message) ? message : 'qualification_input_invalid'],
      launchBlockers: ['preflight_invalid', ...LIVE_LAUNCH_BLOCKERS] };
  }
};

/** Future transport must use this projection, never the qualification packet or suite/evaluator manifest. */
export const loadFrozenAgentInput = async (suite, caseId) => {
  if (typeof caseId !== 'string' || !/^(S[1-8]-[1-5]|[AX]-(?:[1-9]|10))$/.test(caseId)) fail('case_identity_invalid');
  const result = await inspectFixtureSuite(suite);
  if (result.status !== 'fixture_ready') fail('fixture_integrity_invalid');
  const manifest = JSON.parse((await readFixtureArtifact(suite, 'manifest.json')).toString('utf8'));
  const item = manifest.cases.find(item => item.id === caseId);
  if (!item) fail('case_identity_invalid');
  const files = [];
  for (const artifact of item.agentFiles) {
    const bytes = await readFixtureArtifact(suite, artifact.path);
    if (sha256(bytes) !== artifact.sha256) fail('agent_artifact_hash_mismatch');
    files.push({ name: path.posix.basename(artifact.path), bytes });
  }
  return files;
};

/** Campaign-scoped immutable custody avoids re-reading the whole corpus for each trial. */
export const captureFrozenAgentInputs=async suite=>{
  if((await inspectFixtureSuite(suite)).status!=='fixture_ready')fail('fixture_integrity_invalid');
  const manifest=JSON.parse((await readFixtureArtifact(suite,'manifest.json')).toString());
  const captured=new Map();
  for(const item of manifest.cases){
    const files=[];
    for(const artifact of item.agentFiles){const bytes=await readFixtureArtifact(suite,artifact.path);
      if(sha256(bytes)!==artifact.sha256)fail('agent_artifact_hash_mismatch');
      files.push({name:path.posix.basename(artifact.path),bytes});}
    captured.set(item.id,files);
  }
  return caseId=>{const files=captured.get(caseId);if(!files)fail('case_identity_invalid');return files.map(f=>({name:f.name,bytes:Buffer.from(f.bytes)}));};
};
