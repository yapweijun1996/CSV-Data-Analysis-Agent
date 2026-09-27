import { describe, expect, it } from 'vitest';
import type { ReportMemoryScope, VectorStoreDocument } from '../types';
import {
    buildScopedMemoryDocumentId,
    filterDocumentsForMemoryScope,
    normalizeSavedReportMemoryDocuments,
    normalizeSavedAgentMemoryRun,
    resolveReportMemoryScope,
} from '../services/agent/memory/memoryScope';

const csvData = {
    fileName: 'sales.csv',
    data: [{ Region: 'East', Revenue: 100 }],
};

const makeScope = (
    reportId: string,
    datasetVersion = 'version-1',
): ReportMemoryScope => ({
    reportId,
    datasetId: 'dataset-sales',
    datasetVersion,
});

const makeDocument = (
    scope: ReportMemoryScope | undefined,
    sourceId: string,
): VectorStoreDocument => ({
    id: scope ? buildScopedMemoryDocumentId(scope, sourceId) : sourceId,
    text: `Memory ${sourceId}`,
    embedding: [0.1, 0.2],
    metadata: {
        kind: 'accepted_decision',
        memoryFormatVersion: 'ir-v1',
        ...(scope ? { scope } : {}),
    },
});

describe('report-scoped memory', () => {
    it('keeps the persisted report identity when a loaded report receives a new tab session', () => {
        const scope = resolveReportMemoryScope({
            sessionId: 'session-new-tab',
            currentDatasetId: 'dataset-sales',
            reportMemoryScope: makeScope('report-original'),
            rawCsvData: csvData,
            canonicalCsvData: null,
            csvData,
        });

        expect(scope).toEqual(expect.objectContaining({
            reportId: 'report-original',
            datasetId: 'dataset-sales',
        }));
        expect(scope?.datasetVersion).toMatch(/^version-/);
    });

    it('includes report, dataset, and version in every scoped memory key', () => {
        const id = buildScopedMemoryDocumentId(
            makeScope('report-a', 'version-a'),
            'accepted-decision-region',
        );

        expect(id).toBe(
            'memory:report-a:dataset-sales:version-a:accepted-decision-region',
        );
    });

    it('excludes decisions from other reports and other dataset versions', () => {
        const expectedScope = makeScope('report-a', 'version-a');
        const documents = [
            makeDocument(expectedScope, 'same-report'),
            makeDocument(makeScope('report-b', 'version-a'), 'other-report'),
            makeDocument(makeScope('report-a', 'version-b'), 'other-version'),
            makeDocument(undefined, 'legacy-unscoped'),
        ];

        expect(filterDocumentsForMemoryScope(documents, expectedScope))
            .toEqual([documents[0]]);
    });

    it('migrates only unscoped memories owned by the loaded saved report', () => {
        const scope = makeScope('report-a', 'version-a');
        const alreadyScoped = makeDocument(
            makeScope('report-b', 'version-b'),
            'foreign-scoped',
        );
        const legacy = makeDocument(undefined, 'legacy-card');

        const normalized = normalizeSavedReportMemoryDocuments(
            [legacy, alreadyScoped],
            scope,
        );

        expect(normalized[0]).toEqual(expect.objectContaining({
            id: buildScopedMemoryDocumentId(scope, 'legacy-card'),
            metadata: expect.objectContaining({
                scope,
                origin: expect.objectContaining({
                    kind: 'legacy_report',
                    sourceId: 'legacy-card',
                }),
            }),
        }));
        expect(normalized[1]).toBe(alreadyScoped);
    });

    it('attaches report scope and visible origin to a legacy saved agent run', () => {
        const scope = makeScope('report-a', 'version-a');
        const run = normalizeSavedAgentMemoryRun({
            runId: 'run-1',
            datasetId: 'legacy-dataset',
            createdAt: new Date('2026-07-01T00:00:00.000Z'),
            findings: {
                datasetFacts: null,
                columnVerdicts: [],
                explorations: [],
                warnings: [],
            },
        }, scope);

        expect(run).toEqual(expect.objectContaining({
            reportId: 'report-a',
            datasetId: 'dataset-sales',
            datasetVersion: 'version-a',
            origin: expect.objectContaining({
                kind: 'legacy_report',
                sourceId: 'run-1',
            }),
        }));
    });
});
