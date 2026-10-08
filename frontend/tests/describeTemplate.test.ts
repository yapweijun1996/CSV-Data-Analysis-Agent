import { describe, expect, it } from 'vitest';
import { resolveDiagnosticTemplate } from '../services/duckdb/diagnosticTemplates';

const profiles = [
    { name: 'price', type: 'currency' },
    { name: 'SourceRowIndex', type: 'numerical' },
    { name: 'town', type: 'categorical' },
] as never;

const build = (allowedColumns: string[]) => resolveDiagnosticTemplate('describe')!.toCompiledQuery!(
    { columns: [] }, { tableName: 'session_clean_dataset', allowedColumns, columnProfiles: profiles },
);

describe('describe diagnostic template', () => {
    it('skips numeric profiles whose column is not in the table', () => {
        const query = build(['price', 'town']);
        expect(query.sql).toContain("'price' AS column_name");
        expect(query.sql).not.toContain('SourceRowIndex');
        expect(query.countSql).toBe('SELECT 1 AS total');
    });

    it('keeps every numeric profile when the table columns are unknown', () => {
        expect(build([]).sql).toContain("'SourceRowIndex' AS column_name");
    });
});
