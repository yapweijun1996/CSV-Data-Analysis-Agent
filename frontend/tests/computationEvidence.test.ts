// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import {newQuickJSWASMModuleFromVariant} from 'quickjs-emscripten-core';
import {executeQuickJsGuest} from '../services/sandbox/quickJsGuest';
import {resolveGuestLimits} from '../services/sandbox/javascriptGuestProtocol';
import {qualifyEvidenceAdmission} from '../services/agent/execution/evidenceAdmissionQualification';
import {referencePearson,computationMismatchFields,type RequestedComputationScope} from '../services/agent/execution/computationEvidence';

const scope:RequestedComputationScope={method:'pearson_correlation',x:'X',y:'Y',missingPolicy:'pairwise_complete',seed:'none'};
const guestFactory:NonNullable<Parameters<typeof qualifyEvidenceAdmission>[2]>=()=>({run:(code,inputJson,options)=>
    executeQuickJsGuest({generation:1,code,inputJson,limits:resolveGuestLimits(options.limits)},
        ()=>newQuickJSWASMModuleFromVariant(variant),options.onStarted),cancel(){},dispose(){}});
describe('independent computation evidence',()=>{
    it('diagnoses incorrect count shape and scope accounting without returning reference values',()=>{
        const expected={method:'lower_weighted_median' as const,methodVersion:1 as const,seed:'none' as const,scopedRows:7,n:7,excluded:0,zeroWeightRows:0,totalWeight:19,median:1199,unit:'SGD'};
        const fields=computationMismatchFields({...expected,scopedRows:[],excluded:4},expected,0);
        expect(fields).toEqual(['scopedRows','excluded']);expect(JSON.stringify(fields)).not.toMatch(/1199|19|SGD/);
        expect(computationMismatchFields({...expected,median:999},expected,0)).toEqual(['median']);
    });
    it('keeps exact field membership and the existing Pearson numeric tolerance',()=>{
        const expected={method:'pearson_correlation' as const,methodVersion:1 as const,seed:'none' as const,scopedRows:3,n:3,excluded:0,coefficient:0.5};
        expect(computationMismatchFields({...expected,coefficient:0.5+1e-11},expected,1e-10)).toEqual([]);
        expect(computationMismatchFields({...expected,coefficient:0.51},expected,1e-10)).toEqual(['coefficient']);
        expect(computationMismatchFields({...expected,extra:true},expected,1e-10)).toEqual(['unexpected_fields']);
        expect(computationMismatchFields(null,expected,1e-10)).toEqual(['output_object_required']);
    });
    it('cancels fixture preparation before starting Pi or a guest',async()=>{
        const controller=new AbortController(),reason=new Error('Stop during preparation'),run=vi.fn();
        await expect(qualifyEvidenceAdmission(controller.signal,undefined,()=>{
            controller.abort(reason);return {run,cancel(){},dispose(){}};
        })).rejects.toBe(reason);
        expect(run).not.toHaveBeenCalled();
    });
    it('checks symmetry, affine sign, nontrivial reference and missing pairs independently',()=>{
        const rows=[{X:1,Y:1},{X:2,Y:4},{X:3,Y:2},{X:null,Y:99}];
        const r=referencePearson(rows,scope);
        expect(r.n).toBe(3);expect(r.excluded).toBe(1);
        // Hand oracle: centered cross product 1, X sum of squares 2, Y sum of squares 14/3.
        expect(r.coefficient).toBeCloseTo(Math.sqrt(3/28),12);
        expect(referencePearson(rows,{...scope,x:'Y',y:'X'}).coefficient).toBeCloseTo(r.coefficient!,12);
        expect(referencePearson(rows.map(p=>({...p,X:p.X===null?null:-2*p.X+100})),scope).coefficient).toBeCloseTo(-r.coefficient!,12);
        expect(referencePearson([{X:1e300,Y:1e300},{X:2e300,Y:2e300},{X:3e300,Y:3e300}],scope).coefficient).toBeCloseTo(1,12);
    });
    it.each([[],[{X:1,Y:2}],[{X:1,Y:2},{X:1,Y:3}]].map(rows=>[rows]))('represents an undefined coefficient explicitly',rows=>{
        expect(referencePearson(rows,scope).coefficient).toBeNull();
    });
    it.each(['1','NaN',true,Number.POSITIVE_INFINITY])('refuses untyped or nonfinite numerical input %s',X=>{
        expect(()=>referencePearson([{X,Y:1},{X:2,Y:2}],scope)).toThrow('typed_numeric_input_required');
    });
});
