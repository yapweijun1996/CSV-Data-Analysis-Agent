import type {CsvCellValue,CsvRow,DatasetColumnSchema,DatasetTableRole} from '../../types';
import type {CandidateCellOrigin,CandidateRowOrigin,CandidateOutput,CandidateRelationship} from './candidateContract';
import type {UnitProvenance,UnitSource} from './unitMeaning';

export interface ValidationMetric {column:string;scale:number;toleranceMinor:number;unit:string;provenance?:UnitProvenance;source?:UnitSource;currencyColumn?:string;allowedCurrencies?:string[];unitColumn?:string;allowedUnits?:string[]}
export interface ValidationCell {column:string;origin:CandidateCellOrigin;conversion:'identity'|'trim'|'decimal'|'iso_date'|'decimal_or_null';scale?:number}
export interface ValidationTable {name:string;role:DatasetTableRole;schema:readonly DatasetColumnSchema[];grain:string[];groupBy:string[];metrics:ValidationMetric[];mutableColumns:string[];rows:Array<{cells:ValidationCell[]}>}
export interface ValidationExclusion {origin:CandidateRowOrigin;role:'header'|'group_header'|'note'|'subtotal'|'grand_total'|'duplicate';duplicateOf?:CandidateRowOrigin;checks:Array<{column:string|number;table:string;detailRows:number[];metric:string;scope?:Array<{field:string;origin:CandidateCellOrigin}>}>}
/** Host-only resolved meaning. Never populated from guest assertions or candidate values. */
export interface CandidateValidationContract {version:1;ambiguities:string[];tables:ValidationTable[];relationships:Array<CandidateRelationship & {maxAmplification:number;requireCoverage:boolean}>;exclusions:ValidationExclusion[];completeSourceCells?:boolean}
export interface ValidationInputs {tables:Record<string,CsvRow[]>;sources:Record<string,string[][]>;sourceIdentities?:Record<string,string>}
export interface CandidateSemanticVerdict {decision:'validated'|'blocked'|'clarification';reasonCodes:string[];checks:string[];groups:Array<{table:string;group:string;metric:string;expectedMinor:string;actualMinor:string}>}
const key=(v:unknown)=>JSON.stringify(v);
const rowKey=(o:CandidateRowOrigin)=>key([o.kind,o.name,o.row]);
const cellKey=(o:CandidateCellOrigin)=>key([o.kind,o.name,o.row,o.column]);
const read=(inputs:ValidationInputs,o:CandidateCellOrigin):CsvCellValue=>{
    const row=o.kind==='table'?inputs.tables[o.name]?.[o.row]:inputs.sources[o.name]?.[o.row];
    if(!row||!Object.hasOwn(row,o.column))throw new Error('validation_source_mapping_invalid');
    return (row as Record<string,CsvCellValue>)[o.column];
};
/** Exact decimal/minor-unit arithmetic; no permissive currency stripping or float-sum oracle. */
const minor=(v:CsvCellValue,scale:number):bigint=>{
    if(!Number.isInteger(scale)||scale<0||scale>6||v===null||typeof v==='boolean')throw new Error('validation_numeric_invalid');
    const text=String(v);if(!/^-?\d+(\.\d+)?$/.test(text))throw new Error('validation_numeric_invalid');
    const negative=text.startsWith('-'),[whole,fraction='']=text.replace(/^-/,'').split('.');
    if(fraction.length>scale&&/[1-9]/.test(fraction.slice(scale)))throw new Error('validation_decimal_precision');
    return (negative?-1n:1n)*BigInt(whole+fraction.slice(0,scale).padEnd(scale,'0'));
};
export const convertValidationCell=(value:CsvCellValue,c:ValidationCell):CsvCellValue=>{
    if(c.conversion==='identity')return value;
    if(c.conversion==='trim'){if(typeof value!=='string')throw new Error('validation_type_mismatch');return value.trim();}
    if(c.conversion==='decimal_or_null'&&(value===null||value===''))return null;
    if(c.conversion==='decimal'||c.conversion==='decimal_or_null'){
        const scale=c.scale??0,n=minor(value,scale),result=Number(n)/10**scale;
        if(!Number.isSafeInteger(Number(n)))throw new Error('validation_numeric_invalid');
        if(minor(result,scale)!==n)throw new Error('validation_decimal_precision');return result;
    }
    if(c.conversion==='iso_date'&&typeof value==='string'&&validDate(value))return value;
    throw new Error('validation_date_ambiguous');
};
const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const validType=(v:CsvCellValue,s:DatasetColumnSchema)=>v===null?s.nullable:s.dataType==='unknown'?false:s.dataType==='date'?typeof v==='string'&&validDate(v):typeof v===s.dataType&&(typeof v!=='number'||Number.isFinite(v));
const abs=(n:bigint)=>n<0n?-n:n;
export const validateCandidateSemantics=(candidate:CandidateOutput,contract:CandidateValidationContract|undefined,inputs:ValidationInputs):CandidateSemanticVerdict=>{
    const accountingKey=(o:CandidateRowOrigin)=>rowKey(o.kind==='source'?{...o,name:inputs.sourceIdentities?.[o.name]??o.name}:o);
    const reasons=new Set<string>(),checks:string[]=[],groups:CandidateSemanticVerdict['groups']=[];
    const result=(decision:CandidateSemanticVerdict['decision']):CandidateSemanticVerdict=>({decision,reasonCodes:[...reasons],checks,groups});
    if(!contract){reasons.add('validation_host_contract_required');return result('clarification');}
    if(contract.ambiguities?.length){reasons.add('validation_meaning_ambiguous');return result('clarification');}
    try{
        if(contract.version!==1||!contract.tables.length||contract.tables.length>20||new Set(contract.tables.map(t=>t.name)).size!==contract.tables.length)throw new Error('validation_contract_invalid');
        if(contract.tables.some(t=>t.role==='unknown'||!t.grain.length||t.schema.some(s=>s.dataType==='unknown'))){reasons.add('validation_grain_or_type_unresolved');return result('clarification');}
        const expected=new Map<string,CsvRow[]>(),accounted=new Set<string>(),excluded=new Set<string>();
        const canonicalCell=(o:CandidateCellOrigin)=>cellKey(o.kind==='source'?{...o,name:inputs.sourceIdentities?.[o.name]??o.name}:o);
        const mappedCells=new Set<string>(),metricOwners=new Set<string>(),metricRows=new Set<string>();
        if(key(candidate.tables.map(t=>t.name).sort())!==key(contract.tables.map(t=>t.name).sort()))reasons.add('validation_table_set_mismatch');
        for(const t of contract.tables){
            const columns=t.schema.map(s=>s.name);
            if(t.schema.some(s=>s.dataType==='number'&&!t.grain.includes(s.name)&&!t.groupBy.includes(s.name)&&!t.metrics.some(m=>m.column===s.name))
                ||t.metrics.some(m=>typeof m.unit!=='string'||!m.unit.trim())){reasons.add('validation_metric_or_unit_unresolved');return result('clarification');}
            if(!columns.length||new Set(columns).size!==columns.length||[...t.grain,...t.groupBy,...t.mutableColumns,...t.metrics.map(m=>m.column)].some(c=>!columns.includes(c))
                ||new Set(t.grain).size!==t.grain.length||new Set(t.metrics.map(m=>m.column)).size!==t.metrics.length)throw new Error('validation_contract_invalid');
            for(const m of t.metrics)if(!m.unit||!Number.isInteger(m.scale)||m.scale<0||m.scale>6||!Number.isSafeInteger(m.toleranceMinor)||m.toleranceMinor<0
                ||t.schema.find(s=>s.name===m.column)?.dataType!=='number'||[m.currencyColumn,m.unitColumn].some(c=>c!==undefined&&t.schema.find(s=>s.name===c)?.dataType!=='string')
                ||m.currencyColumn&&(!t.groupBy.includes(m.currencyColumn)||!m.allowedCurrencies?.length)
                ||m.unitColumn&&(!t.groupBy.includes(m.unitColumn)||!m.allowedUnits?.length))throw new Error('validation_contract_invalid');
            const rows=t.rows.map(r=>{
                if(key(r.cells.map(c=>c.column).sort())!==key([...columns].sort()))throw new Error('validation_contract_invalid');
                const row:CsvRow={};
                for(const c of r.cells){
                    if(c.conversion!=='identity'&&!t.mutableColumns.includes(c.column))throw new Error('validation_scope_invalid');
                    row[c.column]=convertValidationCell(read(inputs,c.origin),c);accounted.add(accountingKey(c.origin));
                    mappedCells.add(canonicalCell(c.origin));
                    if(contract.completeSourceCells&&t.metrics.some(m=>m.column===c.column)){
                        const id=canonicalCell(c.origin);
                        if(metricOwners.has(id))throw new Error('validation_additive_source_ownership_overlap');
                        metricOwners.add(id);metricRows.add(accountingKey(c.origin));
                    }
                }
                return row;
            });expected.set(t.name,rows);
            const actual=candidate.tables.find(c=>c.name===t.name);if(!actual)continue;
            const schemaKey=(ss:readonly DatasetColumnSchema[])=>key(ss.map(s=>[s.name,s.dataType,s.nullable]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
            if(actual.role!==t.role||schemaKey(actual.schema)!==schemaKey(t.schema))reasons.add('validation_schema_mismatch');
            if(actual.rowCount!==rows.length||actual.rows.length!==rows.length)reasons.add('validation_row_set_mismatch');
            const expectedByGrain=new Map(rows.map((r,i)=>[key(t.grain.map(c=>r[c])),i]));
            const lineageByCell=new Map(actual.lineage.map(l=>[key([l.row,l.column]),l]));
            for(const [i,r] of actual.rows.entries()){
                const expectedIndex=expectedByGrain.get(key(t.grain.map(c=>r[c]))),reference=expectedIndex===undefined?undefined:rows[expectedIndex];
                if(key(Object.keys(r).sort())!==key([...columns].sort()))reasons.add('validation_schema_mismatch');
                for(const s of t.schema){
                    if(!validType(r[s.name],s))reasons.add('validation_type_or_null_mismatch');
                    const metric=t.metrics.find(m=>m.column===s.name);
                    const rule=expectedIndex===undefined?undefined:t.rows[expectedIndex]?.cells.find(c=>c.column===s.name),lineage=lineageByCell.get(key([i,s.name]));
                    // Column permission does not authorize changing identity cells outside the selected repair region.
                    const mutable=Boolean(rule&&rule.conversion!=='identity'&&t.mutableColumns.includes(s.name));
                    const same=r[s.name]===reference?.[s.name]||Boolean(mutable&&metric&&reference&&typeof r[s.name]==='number'&&typeof reference[s.name]==='number'&&abs(minor(r[s.name],metric.scale)-minor(reference[s.name],metric.scale))<=BigInt(metric.toleranceMinor));
                    if(!same)reasons.add(mutable?'validation_transformed_value_mismatch':'validation_unchanged_region_mismatch');
                    if(!rule||!lineage||lineage.origins.length!==1||cellKey(lineage.origins[0])!==cellKey(rule.origin))reasons.add('validation_source_mapping_mismatch');
                }
            }
            const uniqueness=(rr:CsvRow[])=>{const seen=new Set<string>();for(const r of rr){if(t.grain.some(c=>r[c]===null||r[c]===''))return false;const id=key(t.grain.map(c=>r[c]));if(seen.has(id))return false;seen.add(id);}return true;};
            if(!uniqueness(rows))throw new Error('validation_grain_ambiguous');
            if(!uniqueness(actual.rows))reasons.add('validation_grain_duplicate');
            for(const m of t.metrics){
                const sum=(rr:CsvRow[])=>{const totals=new Map<string,bigint>();for(const r of rr){
                    if(m.currencyColumn&&!m.allowedCurrencies!.includes(String(r[m.currencyColumn])))reasons.add('validation_currency_mismatch');
                    if(m.unitColumn&&!m.allowedUnits!.includes(String(r[m.unitColumn])))reasons.add('validation_unit_mismatch');
                    const group=key(t.groupBy.map(c=>r[c]));totals.set(group,(totals.get(group)??0n)+(r[m.column]===null?0n:minor(r[m.column],m.scale)));
                }return totals;};
                const before=sum(rows),after=sum(actual.rows);
                if(key([...before.keys()].sort())!==key([...after.keys()].sort()))reasons.add('validation_group_set_mismatch');
                for(const [group,total] of before){const value=after.get(group)??0n;if(abs(total-value)>BigInt(m.toleranceMinor))reasons.add('validation_group_reconciliation_failed');
                    if(groups.length<100)groups.push({table:t.name,group,metric:m.column,expectedMinor:String(total),actualMinor:String(value)});}
            }
        }
        checks.push('schema-type-null','source-cell-mapping','fact-grain','scope-unchanged-regions','unit-currency','group-reconciliation');
        if(key(candidate.excludedRows.map(e=>rowKey(e.origin)).sort())!==key(contract.exclusions.map(e=>rowKey(e.origin)).sort()))reasons.add('validation_exclusion_set_mismatch');
        for(const e of contract.exclusions){
            if(contract.completeSourceCells&&candidate.excludedRows.find(row=>rowKey(row.origin)===rowKey(e.origin))?.reason!==e.role)reasons.add('validation_exclusion_reason_mismatch');
            const id=accountingKey(e.origin);
            const headerEvidence=contract.completeSourceCells&&['header','group_header'].includes(e.role)&&!metricRows.has(id);
            if(excluded.has(id)||accounted.has(id)&&!headerEvidence)throw new Error('validation_contract_accounting_invalid');excluded.add(id);
            const inputRow=e.origin.kind==='table'?inputs.tables[e.origin.name]?.[e.origin.row]:inputs.sources[e.origin.name]?.[e.origin.row];
            if(!inputRow)throw new Error('validation_source_mapping_invalid');
            if(!['header','group_header','note','subtotal','grand_total','duplicate'].includes(e.role))throw new Error('validation_meaning_ambiguous');
            if(e.role==='duplicate'){
                if(!e.duplicateOf||!accounted.has(accountingKey(e.duplicateOf)))throw new Error('validation_contract_invalid');
                const other=e.duplicateOf.kind==='table'?inputs.tables[e.duplicateOf.name]?.[e.duplicateOf.row]:inputs.sources[e.duplicateOf.name]?.[e.duplicateOf.row];
                if(key(inputRow)!==key(other))reasons.add('validation_duplicate_exclusion_invalid');
            }
            if(['subtotal','grand_total'].includes(e.role)&&!e.checks.length)throw new Error('validation_summary_scope_unresolved');
            for(const c of e.checks){
                const table=contract.tables.find(t=>t.name===c.table),metric=table?.metrics.find(m=>m.column===c.metric),rows=expected.get(c.table);
                if(!metric||!rows||!c.detailRows.length||new Set(c.detailRows).size!==c.detailRows.length||c.detailRows.some(i=>!Number.isSafeInteger(i)||i<0||i>=rows.length))throw new Error('validation_contract_invalid');
                const detail=c.detailRows.map(i=>rows[i]);
                const required=e.role==='subtotal'?table!.groupBy:[metric.currencyColumn,metric.unitColumn].filter((s):s is string=>Boolean(s));
                if(required.some(field=>!c.scope?.some(s=>s.field===field))||new Set(c.scope?.map(s=>s.field)).size!==(c.scope?.length??0))throw new Error('validation_summary_scope_unresolved');
                for(const s of c.scope??[]){if(!table!.groupBy.includes(s.field))throw new Error('validation_contract_invalid');const value=read(inputs,s.origin);
                    if(detail.some(row=>row[s.field]!==value))reasons.add('validation_summary_group_mismatch');}
                if([metric.currencyColumn,metric.unitColumn].some(column=>column&&new Set(detail.map(r=>r[column])).size>1))throw new Error('validation_summary_scope_unresolved');
                if(e.role==='subtotal'&&new Set(detail.map(r=>key(table!.groupBy.map(k=>r[k])))).size!==1)throw new Error('validation_summary_scope_unresolved');
                const total=detail.reduce((sum,r)=>sum+(r[c.metric]===null?0n:minor(r[c.metric],metric.scale)),0n),observed=minor(read(inputs,{...e.origin,column:c.column}),metric.scale);
                if(abs(total-observed)>BigInt(metric.toleranceMinor))reasons.add('validation_summary_reconciliation_failed');
            }
        }
        for(const [kind,collection] of [['table',inputs.tables],['source',inputs.sources]] as const)for(const [name,rows] of Object.entries(collection))for(let row=0;row<rows.length;row++){
            const id=accountingKey({kind,name,row});if(!accounted.has(id)&&!excluded.has(id))reasons.add('validation_input_coverage_incomplete');
            if(contract.completeSourceCells&&kind==='source'&&!excluded.has(id))for(let column=0;column<(rows[row] as string[]).length;column++){
                if(!mappedCells.has(canonicalCell({kind,name,row,column})))reasons.add('validation_input_cell_coverage_incomplete');
            }
        }
        checks.push('complete-input-accounting','summary-exclusion-reconciliation');
        const relation=(r:CandidateRelationship)=>key([r.fromTable,r.toTable,r.fromKeys,r.toKeys,r.cardinality]);
        if(key(candidate.relationships.map(relation).sort())!==key(contract.relationships.map(relation).sort()))reasons.add('validation_relationship_set_mismatch');
        for(const r of contract.relationships){
            if(!Number.isFinite(r.maxAmplification)||r.maxAmplification<0||r.maxAmplification>1||!['one_to_one','many_to_one','one_to_many'].includes(r.cardinality))throw new Error('validation_relationship_ambiguous');
            const from=candidate.tables.find(t=>t.name===r.fromTable),to=candidate.tables.find(t=>t.name===r.toTable);
            if(!from||!to||!r.fromKeys.length||r.fromKeys.length!==r.toKeys.length||r.fromKeys.some(k=>!from.schema.some(s=>s.name===k))||r.toKeys.some(k=>!to.schema.some(s=>s.name===k)))throw new Error('validation_contract_invalid');
            const counts=(rows:CsvRow[],keys:string[])=>{const map=new Map<string,number>();for(const row of rows){if(keys.some(k=>row[k]===null||row[k]===''))reasons.add('validation_relationship_key_null');const id=key(keys.map(k=>row[k]));map.set(id,(map.get(id)??0)+1);}return map;};
            const left=counts(from.rows,r.fromKeys),right=counts(to.rows,r.toKeys);
            if(r.cardinality!=='many_to_one'&&[...left.values()].some(n=>n>1)||r.cardinality!=='one_to_many'&&[...right.values()].some(n=>n>1))reasons.add('validation_relationship_cardinality_failed');
            // Measure in the fact direction, including reverse dimension-to-fact declarations.
            const reverse=r.cardinality==='one_to_many',facts=reverse?right:left,dimensions=reverse?left:right;
            for(const id of facts.keys()){const matches=dimensions.get(id)??0;if(matches>r.maxAmplification)reasons.add('validation_relationship_amplification');if(r.requireCoverage&&matches===0)reasons.add('validation_relationship_coverage_failed');}
        }
        checks.push('relationship-coverage-cardinality-amplification');
    }catch(error){const code=error instanceof Error?error.message:'validation_contract_invalid';reasons.add(code.startsWith('validation_')?code:'validation_contract_invalid');
        if(['validation_meaning_ambiguous','validation_grain_ambiguous','validation_date_ambiguous','validation_summary_scope_unresolved','validation_relationship_ambiguous'].includes(code))return result('clarification');}
    return result(reasons.size?'blocked':'validated');
};
