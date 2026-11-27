// @vitest-environment node
//
// A numeric column that is read two independent ways which disagree must never
// produce a Verified card. The guard compares, per column, the sum and median the
// query engine computes over the loaded dataset (what cards use) with the same
// column parsed from the original imported text. These tests use a real
// in-process DuckDB behind the production query path.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnalysisPlan, CsvData, NumericParseCheck, QueryTraceEntry } from '../types';
import { parseCsvTextWithDetection } from '../services/data/csvDialectDetector';
import { buildCsvDataFromIntakeIr, buildReportIntakeIr } from '../services/data/reportCsvIntake';
import { profileData } from '../services/data/dataProfiler';
import { buildDeterministicNormalizationPlan } from '../services/ai/deterministicNormalizer';
import { applyDataOperations } from '../services/agent/execution/dataOperationRunner';
import { applyPreparationPlanToCanonicalDataset } from '../services/agent/orchestration/canonicalPreparation';
import { runNumericParseCheck } from '../services/data/numericParseGuard';
import { buildAnalysisArtifactProvenance } from '../services/agent/artifactProvenance';
import { resolveCardTrustDecision } from '../services/agent/cardTrustDecision';
import { resolveCardPresentationPlan, isTableOnlyPresentation } from '../utils/analysisCardPresentationPolicy';
import { buildSemanticDatasetVersion } from '../services/agent/datasetSemantics';
import { getTranslation } from '../utils/localization';
import { tableToRows } from '../services/workers/duckDbRows';

const duck = vi.hoisted(() => ({ db: null as any, conn: null as any }));

vi.mock('../services/workers/duckDbWorkerClient', () => ({
    duckDbWorkerClient: {
        initDuckDb: async () => ({ initialized: true }),
        loadCleanDataset: async (payload: { csvText: string; csvFileName: string; loadVersion: string; tableName: string }) => {
            const table = `"${payload.tableName.replace(/"/g, '""')}"`;
            await duck.db.registerFileText(payload.csvFileName, payload.csvText);
            duck.conn.query(`DROP TABLE IF EXISTS ${table}`);
            duck.conn.query(`CREATE TABLE ${table} AS SELECT * FROM read_csv_auto('${payload.csvFileName.replace(/'/g, "''")}', header=true, all_varchar=true)`);
            return { loaded: true, tableName: payload.tableName, loadVersion: payload.loadVersion };
        },
        executeCompiledQuery: async (payload: { sql: string }) => {
            const rows = tableToRows(duck.conn.query(payload.sql));
            return { rows, totalMatchedRows: rows.length, returnedRows: rows.length };
        },
        executeRawQuery: async () => { throw new Error('not used'); },
        disposeDuckDbSession: async () => undefined,
    },
}));

const require = createRequire(import.meta.url);
const duckdb = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs');
const wasmBase = fileURLToPath(new URL('../node_modules/@duckdb/duckdb-wasm/dist/', import.meta.url));

beforeAll(async () => {
    duck.db = await duckdb.createDuckDB(
        { mvp: { mainModule: `${wasmBase}duckdb-mvp.wasm` }, eh: { mainModule: `${wasmBase}duckdb-eh.wasm` } },
        new duckdb.VoidLogger(),
        duckdb.NODE_RUNTIME,
    );
    await duck.db.instantiate();
    duck.db.open({ path: ':memory:', maximumThreads: 1 });
    duck.conn = duck.db.connect();
}, 30_000);
afterAll(() => duck.conn?.close());

const FIXTURE_DIR = path.resolve(fileURLToPath(new URL('./fixtures/weird-reports/', import.meta.url)));
const w4Text = readFileSync(path.join(FIXTURE_DIR, 'w4_european_semicolon.csv'), 'utf8');

const importText = (text: string, fileName: string): CsvData => {
    const { rawRows, detection } = parseCsvTextWithDetection(text);
    return buildCsvDataFromIntakeIr(buildReportIntakeIr(fileName, rawRows, detection));
};

/** What the fixed flow loads: the cleaned and the canonical dataset. */
const fixedFlow = (imported: CsvData, measures: string[]) => {
    const { profiles } = profileData(imported.data);
    const plan = {
        explanation: 'cast measures',
        operations: measures.map(column => ({ id: `cast_${column}`, type: 'cast_column' as const, reason: 'measure', column, targetType: 'number' as const })),
        outputColumns: profiles,
        planStatus: 'operations' as const,
        consistencyIssues: [],
    };
    const normalization = buildDeterministicNormalizationPlan(plan, profiles, imported.data);
    const cleaned: CsvData = {
        ...imported,
        data: applyDataOperations(imported.data, normalization.plan.operations, { allowEmptyResult: false }).data,
    };
    const canonical = applyPreparationPlanToCanonicalDataset(imported, { ...plan, operations: [], numericStringNormalizedColumns: measures })!;
    return { cleaned, canonical };
};

/** The old corrupting behaviour of canonical preparation: strip every comma, then parse. */
const oldStrippingCanonical = (imported: CsvData, columns: string[]): CsvData => ({
    ...imported,
    data: imported.data.map(row => {
        const next = { ...row };
        for (const column of columns) {
            const value = next[column];
            if (typeof value === 'string' && value.trim()) {
                const parsed = Number(value.replace(/[,$€£¥%\s]/g, ''));
                if (Number.isFinite(parsed)) next[column] = parsed;
            }
        }
        return next;
    }),
});

const runCheck = async (raw: CsvData, loaded: CsvData): Promise<NumericParseCheck> => {
    let stored: NumericParseCheck | null = null;
    const store = {
        getState: () => ({ rawCsvData: raw, columnRegistry: null, numericParseCheck: stored }),
        setState: (partial: { numericParseCheck: NumericParseCheck }) => { stored = partial.numericParseCheck; },
    };
    const check = await runNumericParseCheck(store, loaded);
    expect(check).not.toBeNull();
    expect(stored).toBe(check);
    return check!;
};

const cardPlan = (valueColumn: string): AnalysisPlan => ({
    chartType: 'bar',
    title: `Total ${valueColumn} by Kunde`,
    description: 'test',
    aggregation: 'sum',
    groupByColumn: 'Kunde',
    valueColumn,
});

const traceFor = (column: string): QueryTraceEntry => ({
    id: 'trace-1',
    engine: 'duckdb',
    loadVersion: 'v1',
    sqlPreview: 'SELECT 1',
    explanation: 'sum',
    plan: { groupBy: ['Kunde'], aggregates: [{ function: 'sum', column, as: 'total' }] },
} as unknown as QueryTraceEntry);

describe('numeric parse guard', () => {

    it('ignores a check made for another dataset version', async () => {
        const imported = importText(w4Text, 'w4_european_semicolon.csv');
        const corrupted = oldStrippingCanonical(imported, ['Betrag']);
        const check = await runCheck(imported, corrupted);
        const provenance = buildAnalysisArtifactProvenance(cardPlan('Betrag'), {
            canonicalCsvData: imported, csvData: imported, currentDatasetId: 'd1', dataPreparationPlan: null, numericParseCheck: check,
        }, { queryTrace: traceFor('Betrag') });
        expect(buildSemanticDatasetVersion(imported)).not.toBe(check.datasetVersion);
        expect(provenance.numericParseMismatch).toBeUndefined();
    }, 120_000);

    it('has a plain-language message in four languages', () => {
        for (const language of ['English', 'Mandarin', 'Japanese', 'Malay']) {
            const note = getTranslation('data_warnings_numeric_parse_mismatch', language, { columns: 'Betrag' });
            expect(note, language).toContain('Betrag');
            expect(note, language).not.toContain('{columns}');
            const reason = getTranslation('verdict_reason_numeric_parse_mismatch', language);
            expect(reason, language).not.toBe('verdict_reason_numeric_parse_mismatch');
        }
        expect(getTranslation('data_warnings_numeric_parse_mismatch', 'English', { columns: 'Betrag' }))
            .toBe('The numbers in column Betrag could not be read consistently, so results using it are not verified.');
    });

    it('does not fire for the w4 fixture through the fixed flow (cleaned and canonical)', async () => {
        const imported = importText(w4Text, 'w4_european_semicolon.csv');
        const { cleaned, canonical } = fixedFlow(imported, ['Menge', 'Preis', 'Betrag']);
        for (const loaded of [cleaned, canonical, imported]) {
            const check = await runCheck(imported, loaded);
            expect(check.findings).toEqual([]);
            expect(check.status).toBe('passed');
            expect(check.checkedColumns).toEqual(expect.arrayContaining(['Menge', 'Preis', 'Betrag']));
        }
    }, 120_000);

    it('does not fire for a US-format file', async () => {
        const rows = ['Region,Amount,Units'];
        for (let index = 1; index <= 40; index += 1) rows.push(`R${index % 4},"${(index * 1234.56).toLocaleString('en-US', { minimumFractionDigits: 2 })}",${index * 100}`);
        const imported = importText(rows.join('\n'), 'us.csv');
        const { cleaned, canonical } = fixedFlow(imported, ['Amount', 'Units']);
        for (const loaded of [cleaned, canonical, imported]) {
            const check = await runCheck(imported, loaded);
            expect(check.status).toBe('passed');
            expect(check.checkedColumns).toEqual(expect.arrayContaining(['Amount', 'Units']));
        }
    }, 120_000);

    it('does not raise a false positive when the loaded dataset drops summary rows', async () => {
        const lines = ['Item,Amount', ...Array.from({ length: 12 }, (_, index) => `Item ${index + 1},${(index + 1) * 10}`), 'Total,780'];
        const imported = importText(lines.join('\n'), 'with-total.csv');
        // Whatever the intake keeps in the original rows, the loaded dataset has only detail rows.
        const detailOnly: CsvData = { ...imported, data: imported.data.filter(row => String(row.Item).startsWith('Item ')) };
        const check = await runCheck(imported, detailOnly);
        expect(check.findings).toEqual([]);
        expect(check.status).not.toBe('mismatch');
        if (imported.data.length !== detailOnly.data.length) {
            expect(check.status).toBe('skipped');
            expect(check.note).toContain('Row counts differ');
        }
        // And when the original rows already exclude the total, the numbers reconcile.
        const reconciled = await runCheck(detailOnly, detailOnly);
        expect(reconciled.status).toBe('passed');
    }, 120_000);

    it('does not raise a false positive for a column with missing markers', async () => {
        const lines = ['Item,Amount'];
        for (let index = 1; index <= 30; index += 1) lines.push(`Item ${index},${index % 5 === 0 ? ['na', 'N/A', '-', ''][index % 4] : String(index * 10.5)}`);
        const imported = importText(lines.join('\n'), 'markers.csv');
        const { cleaned } = fixedFlow(imported, ['Amount']);
        for (const loaded of [imported, cleaned]) {
            const check = await runCheck(imported, loaded);
            expect(check.status).toBe('passed');
            expect(check.checkedColumns).toContain('Amount');
        }
    }, 120_000);

    it('reports a changed median when the total is unchanged', async () => {
        const raw: CsvData = { fileName: 'm.csv', data: [{ Item: 'a', V: '1' }, { Item: 'b', V: '5' }, { Item: 'c', V: '6' }] };
        const loaded: CsvData = { fileName: 'm.csv', data: [{ Item: 'a', V: '3' }, { Item: 'b', V: '3' }, { Item: 'c', V: '6' }] };
        const check = await runCheck(raw, loaded);
        expect(check.status).toBe('mismatch');
        expect(check.findings).toHaveLength(1);
        expect(check.findings[0]).toMatchObject({ column: 'V', kind: 'median', sourceMedian: 5, loadedMedian: 3 });
    }, 120_000);

    it('skips large preview datasets and datasets whose identifier columns look numeric', async () => {
        const raw: CsvData = { fileName: 'big.csv', data: [{ Phone: '+65 1234 5678', Amount: '10' }, { Phone: '+65 8765 4321', Amount: '20' }] };
        const preview: CsvData = { ...raw, backing: { mode: 'duckdb_file', loadVersion: 'x', datasetVersion: 'y', rowCount: 9_000_000, sampleRowCount: 2, byteSize: 83_000_000, readOnly: true, ephemeral: true } };
        const skipped = await runCheck(raw, preview);
        expect(skipped.status).toBe('skipped');
        const check = await runCheck(raw, raw);
        expect(check.status).toBe('passed');
        expect(check.checkedColumns).toEqual(['Amount']);
    }, 120_000);
});
