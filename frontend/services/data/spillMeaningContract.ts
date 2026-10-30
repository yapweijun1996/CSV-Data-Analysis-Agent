// Pure contract shared by tool discovery and the host compiler. Tool discovery must not load
// execution/storage/runtime services: the registry is also used while restoring app state.
import type { UnitProvenance, UnitSource } from './unitMeaning';

export interface SpillCandidateMeaning {
    version: 1; kind: 'ordered-source-records'; table: string; grain: 'source_record';
    columns: Array<{ name: string; sourceColumn: number; conversion: 'identity' | 'trim' | 'decimal'; scale?: number; unit?: string; provenance?: UnitProvenance; source?: UnitSource }>;
    headerRow: 0; summary: 'none' | 'last_record_sum';
}
const validName = (value: string) => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 240
    && !['__proto__', 'prototype', 'constructor'].includes(value);
export const assertSpillMeaning = (meaning: SpillCandidateMeaning) => {
    if (meaning.version !== 1 || meaning.kind !== 'ordered-source-records' || meaning.grain !== 'source_record' || meaning.headerRow !== 0
        || !validName(meaning.table) || !['none', 'last_record_sum'].includes(meaning.summary) || !Array.isArray(meaning.columns)
        || !meaning.columns.length || meaning.columns.length > 256 || new Set(meaning.columns.map(c => c.name)).size !== meaning.columns.length
        || new Set(meaning.columns.map(c => c.sourceColumn)).size !== meaning.columns.length
        || meaning.columns.some(c => !validName(c.name) || !Number.isSafeInteger(c.sourceColumn) || c.sourceColumn < 0 || c.sourceColumn >= meaning.columns.length
            || !['identity', 'trim', 'decimal'].includes(c.conversion) || c.conversion === 'decimal' && (!c.unit?.trim()
                || !Number.isInteger(c.scale) || c.scale! < 0 || c.scale! > 6)
                || (c.provenance !== undefined && !['confirmed', 'inferred'].includes(c.provenance))
                || (c.source !== undefined && !['header', 'unit_column', 'user'].includes(c.source))
                || (c.provenance === 'inferred' && (c.source ?? 'user') === 'user')
                || c.conversion !== 'decimal' && (c.scale !== undefined || c.unit !== undefined || c.provenance !== undefined || c.source !== undefined))
        || meaning.summary === 'last_record_sum' && !meaning.columns.some(c => c.conversion === 'decimal')) throw new Error('candidate_spill_meaning_invalid');
};
/** Untrusted model declaration. No verdict, values, executable transform or commit authority. */
export interface SpillMeaningProposal {
    input: { kind: 'source'; name: string };
    stream: { sourceId: string; sha256: string; dialect: { delimiter: string; quoteChar: string }; meaning: SpillCandidateMeaning };
    assumptions: string[];
}
const exact = (v: unknown, keys: string[]) => !!v && typeof v === 'object' && !Array.isArray(v)
    && Object.keys(v).sort().join('|') === [...keys].sort().join('|');
export const isSpillMeaningProposal = (value: unknown): value is SpillMeaningProposal => {
    try {
        const p = value as SpillMeaningProposal, s = p.stream, m = s.meaning;
        if (!exact(p, ['input', 'stream', 'assumptions']) || !exact(p.input, ['kind', 'name']) || p.input.kind !== 'source'
            || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(p.input.name) || !exact(s, ['sourceId', 'sha256', 'dialect', 'meaning'])
            || typeof s.sourceId !== 'string' || s.sourceId.length > 240 || !/^[a-f0-9]{64}$/.test(s.sha256) || !exact(s.dialect, ['delimiter', 'quoteChar'])
            || typeof s.dialect.delimiter !== 'string' || typeof s.dialect.quoteChar !== 'string'
            || !exact(m, ['version', 'kind', 'table', 'grain', 'columns', 'headerRow', 'summary'])
            || !Array.isArray(p.assumptions) || p.assumptions.length > 12 || p.assumptions.some(a => typeof a !== 'string' || a.length > 240)) return false;
        assertSpillMeaning(m);
        return m.columns.every(c => (c.unit === undefined || typeof c.unit === 'string' && c.unit.length <= 120) && exact(c, ['name', 'sourceColumn', 'conversion', ...(c.scale !== undefined ? ['scale'] : []), ...(c.unit !== undefined ? ['unit'] : [])]));
    } catch { return false; }
};
