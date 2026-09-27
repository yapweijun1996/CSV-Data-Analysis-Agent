import { describe, expect, it } from 'vitest';
import type { AppState, CsvData, Report } from '../types';
import {
    buildReportLineageBundle,
    normalizeLegacyReportLineage,
} from '../services/persistence/datasetLineage';
import {
    buildDatasetId,
    buildDatasetVersionId,
} from '../utils/datasetId';

const makeCsv = (fileName: string, values: number[]): CsvData => ({
    fileName,
    data: values.map((value, index) => ({ Row: index + 1, Value: value })),
    headerDepth: 1,
});

const makeReport = ({
    raw,
    current = raw,
    currentDatasetId = 'dataset-legacy-sampled-id',
    updatedAt = new Date('2026-07-25T01:00:00.000Z'),
}: {
    raw: CsvData;
    current?: CsvData;
    currentDatasetId?: string | null;
    updatedAt?: Date;
}): Report => ({
    id: 'report-session-1',
    filename: raw.fileName,
    createdAt: new Date('2026-07-25T00:00:00.000Z'),
    updatedAt,
    appState: {
        sessionId: 'report-session-1',
        rawCsvData: raw,
        csvData: current,
        currentDatasetId,
        runtimeRunHistory: [],
        activeTurn: null,
        cleaningRun: {
            runId: 'cleaning-run-1',
            status: 'completed',
            currentStep: 1,
            steps: [],
            lastModelResponse: null,
            startedAt: new Date('2026-07-25T00:10:00.000Z'),
            updatedAt,
            targetPath: '/workspace/dataset/clean.csv',
        },
        dataPreparationPlan: {
            explanation: 'Normalize values.',
            operations: [{
                id: 'trim-1',
                type: 'trim_whitespace',
                reason: 'Normalize labels.',
                columns: '*',
            }],
            outputColumns: [],
            planStatus: 'operations',
            consistencyIssues: [],
        },
    } as AppState,
});

describe('stable dataset and version identity', () => {
    it('hashes all rows instead of colliding when only rows after the old sample differ', () => {
        const first = makeCsv('report.csv', Array.from({ length: 25 }, (_, index) => index));
        const second = makeCsv('report.csv', [
            ...Array.from({ length: 24 }, (_, index) => index),
            999,
        ]);

        expect(buildDatasetId(first.fileName, first.data))
            .not.toBe(buildDatasetId(second.fileName, second.data));
    });

    it('is stable across object key insertion order while keeping dataset and version namespaces separate', () => {
        const left = [{ B: 2, A: 'x' }];
        const right = [{ A: 'x', B: 2 }];

        const datasetId = buildDatasetId('ordered.csv', left);
        const versionId = buildDatasetVersionId('ordered.csv', right);

        expect(datasetId.replace('dataset-', '')).toBe(versionId.replace('version-', ''));
        expect(datasetId).toMatch(/^dataset-[a-f0-9]{16}$/);
        expect(versionId).toMatch(/^version-[a-f0-9]{16}$/);
    });
});

describe('legacy report lineage migration', () => {
    it('loads a v8 saved report with a v1 manifest and recoverable original/current snapshots', () => {
        const raw = makeCsv('legacy.csv', [1, 2, 3]);
        const prepared = makeCsv('legacy.csv', [1, 2, 30]);
        const legacy = makeReport({ raw, current: prepared });

        const bundle = buildReportLineageBundle(legacy);
        const manifest = bundle.report.lineage;

        expect(manifest).toMatchObject({
            schemaVersion: 1,
            reportId: 'report-session-1',
            sessionId: 'report-session-1',
            datasetId: buildDatasetId(raw.fileName, raw.data),
            originalVersionId: buildDatasetVersionId(raw.fileName, raw.data),
            currentVersionId: buildDatasetVersionId(prepared.fileName, prepared.data),
            migratedFrom: 'legacy-report-v8',
        });
        expect(bundle.report.appState.currentDatasetId).toBe(manifest?.datasetId);
        expect(bundle.legacyDatasetId).toBe('dataset-legacy-sampled-id');
        expect(bundle.records.filter(record => record.recordKind === 'version')).toHaveLength(2);
        expect(bundle.records.find(record => record.recordKind === 'transformation')).toMatchObject({
            inputVersionId: manifest?.originalVersionId,
            outputVersionId: manifest?.currentVersionId,
            rollbackVersionId: manifest?.originalVersionId,
            status: 'committed',
        });
    });

    it('links a later material mutation from the previous current version', () => {
        const raw = makeCsv('lineage.csv', [1, 2, 3]);
        const prepared = makeCsv('lineage.csv', [1, 2, 30]);
        const derived = makeCsv('lineage.csv', [1, 20, 30]);
        const first = buildReportLineageBundle(makeReport({ raw, current: prepared })).report;
        const secondInput = makeReport({
            raw,
            current: derived,
            currentDatasetId: first.lineage?.datasetId,
            updatedAt: new Date('2026-07-25T02:00:00.000Z'),
        });

        const second = buildReportLineageBundle(secondInput, first);
        const transformation = second.records.find(record => record.recordKind === 'transformation');

        expect(transformation).toMatchObject({
            inputVersionId: first.lineage?.currentVersionId,
            outputVersionId: buildDatasetVersionId(derived.fileName, derived.data),
            rollbackVersionId: first.lineage?.currentVersionId,
        });
        expect(second.report.lineage?.versionIds).toEqual([
            first.lineage?.originalVersionId,
            first.lineage?.currentVersionId,
            buildDatasetVersionId(derived.fileName, derived.data),
        ]);
    });

    it('normalizes reads without requiring an eager IndexedDB rewrite', () => {
        const raw = makeCsv('read-migration.csv', [7, 8]);
        const legacy = makeReport({ raw });

        const normalized = normalizeLegacyReportLineage(legacy);

        expect(normalized.lineage?.currentVersionId).toBe(normalized.lineage?.originalVersionId);
        expect(normalized.appState.currentDatasetId).toBe(normalized.lineage?.datasetId);
    });

    it('does not label a new stable-ID report as a legacy migration', () => {
        const raw = makeCsv('new.csv', [1, 2]);
        const stableDatasetId = buildDatasetId(raw.fileName, raw.data);
        const fresh = makeReport({ raw, currentDatasetId: stableDatasetId });

        const normalized = buildReportLineageBundle(fresh).report;

        expect(normalized.lineage?.migratedFrom).toBeUndefined();
    });

    it('persists accepted derived metric validation and version evidence on transformation lineage', () => {
        const raw: CsvData = {
            fileName: 'margin.csv',
            data: [{ Revenue: 100, Profit: 20 }],
        };
        const derived: CsvData = {
            fileName: 'margin.csv',
            data: [{ Revenue: 100, Profit: 20, Margin: 0.2 }],
        };
        const inputVersionId = buildDatasetVersionId(raw.fileName, raw.data);
        const outputVersionId = buildDatasetVersionId(derived.fileName, derived.data);
        const accepted = makeReport({ raw, current: derived });
        accepted.appState.dataPreparationPlan = {
            explanation: 'Derive margin.',
            operations: [{
                id: 'derive-margin',
                type: 'derive_column',
                reason: 'Measure profit relative to revenue.',
                newColumn: 'Margin',
                expression: {
                    kind: 'ratio',
                    numerator: { kind: 'column', column: 'Profit' },
                    denominator: { kind: 'column', column: 'Revenue' },
                },
            }],
            outputColumns: [],
            planStatus: 'operations',
            consistencyIssues: [],
            derivedMetricValidations: [{
                artifactType: 'derived_metric_validation',
                operationId: 'derive-margin',
                declaration: {
                    metricName: 'Margin',
                    formula: 'Profit / Revenue',
                    operation: 'ratio',
                    sourceColumns: ['Profit', 'Revenue'],
                    grain: ['source row'],
                    units: 'ratio',
                    assumptions: ['Revenue is non-zero.'],
                    businessMeaning: 'Profit retained per unit of revenue.',
                },
                status: 'pass',
                requiresConfirmation: false,
                signals: [{
                    code: 'reconciliation',
                    status: 'pass',
                    message: '0 of 1 derived results failed deterministic reconciliation.',
                    measuredRate: 0,
                    passThreshold: 0.02,
                    warnThreshold: 0.05,
                }],
                evidenceReferences: [
                    { kind: 'dataset_version', id: inputVersionId, label: 'Input dataset version' },
                    { kind: 'operation', id: 'derive-margin', label: 'Profit / Revenue' },
                    { kind: 'dataset_version', id: outputVersionId, label: 'Output dataset version' },
                ],
            }],
        };

        const bundle = buildReportLineageBundle(accepted);
        const transformation = bundle.records.find(record => record.recordKind === 'transformation');
        const outputVersion = bundle.records.find(record =>
            record.recordKind === 'version' && record.versionId === outputVersionId);

        expect(outputVersion).toMatchObject({
            kind: 'derived',
            recoverable: true,
            parentVersionId: inputVersionId,
        });
        expect(transformation).toMatchObject({
            kind: 'derived_metric',
            verification: { status: 'passed' },
            evidenceReferences: expect.arrayContaining([
                { kind: 'dataset_version', id: inputVersionId, label: 'Input dataset version' },
                { kind: 'operation', id: 'derive-margin', label: 'Profit / Revenue' },
                { kind: 'dataset_version', id: outputVersionId, label: 'Output dataset version' },
            ]),
        });
    });
});
