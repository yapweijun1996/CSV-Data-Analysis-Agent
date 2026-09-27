// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { ActiveDataQuery, AnalysisPlan, AppState } from '../types';
import {
    buildAnalysisArtifactProvenance,
    buildNarrativeArtifactProvenance,
    getCurrentAnalysisDatasetVersion,
    resolveAnalysisArtifactFreshness,
} from '../services/agent/artifactProvenance';
import { createQueryTraceEntry } from '../services/agent/queryTraceState';

const data = {
    fileName: 'sales.csv',
    data: [
        { Region: 'East', Revenue: 1200 },
        { Region: 'West', Revenue: 900 },
    ],
};

const plan: AnalysisPlan = {
    title: 'Revenue by Region',
    description: 'Compare revenue.',
    chartType: 'bar',
    groupByColumn: 'Region',
    valueColumn: 'Revenue',
    aggregation: 'sum',
};

const state = {
    currentDatasetId: 'dataset-sales',
    canonicalCsvData: data,
    csvData: data,
    dataPreparationPlan: {
        explanation: 'Prepared sales data.',
        operations: [{
            id: 'op-cast-revenue',
            type: 'cast_column',
            reason: 'Cast revenue to number.',
            column: 'Revenue',
            targetType: 'number',
        }],
        outputColumns: [],
        planStatus: 'operations',
        consistencyIssues: [],
        derivedMetricValidations: [{
            artifactType: 'derived_metric_validation',
            operationId: 'op-derived-margin',
            declaration: {
                metricName: 'Margin',
                formula: 'Revenue - Cost',
                operation: 'subtract',
                sourceColumns: ['Revenue', 'Cost'],
                grain: ['Region'],
                units: 'currency',
                assumptions: [],
                businessMeaning: 'Gross margin.',
            },
            status: 'pass',
            requiresConfirmation: false,
            signals: [],
            evidenceReferences: [],
        }],
    },
} as unknown as Pick<AppState, 'currentDatasetId' | 'canonicalCsvData' | 'csvData' | 'dataPreparationPlan'>;

describe('artifactProvenance', () => {
    it('binds deterministic artifacts to dataset, transformation, validation, and method evidence', () => {
        const provenance = buildAnalysisArtifactProvenance(plan, state, {
            sourceStepIds: ['step-aggregate'],
            now: '2026-07-25T00:00:00.000Z',
        });

        expect(provenance.evidenceStatus).toBe('verified');
        expect(provenance.datasetVersion).toBe(getCurrentAnalysisDatasetVersion(state));
        expect(provenance.method).toMatchObject({
            operation: 'bar',
            groupByColumns: ['Region'],
            sourceColumns: ['Region', 'Revenue'],
        });
        expect(provenance.evidenceRefs).toEqual(expect.arrayContaining([
            expect.objectContaining({ kind: 'dataset_version', id: provenance.datasetVersion }),
            expect.objectContaining({ kind: 'transformation', id: 'op-cast-revenue' }),
            expect.objectContaining({ kind: 'metric_validation', id: 'op-derived-margin' }),
            expect.objectContaining({ kind: 'source_step', id: 'step-aggregate' }),
        ]));
    });

    it('preserves query trace evidence even when the trace is not stored in query history', () => {
        const activeQuery: ActiveDataQuery = {
            explanation: 'Revenue evidence query.',
            plan: {
                groupBy: ['Region'],
                aggregates: [{ function: 'sum', column: 'Revenue', as: 'Revenue' }],
            },
            result: {
                rows: data.data,
                totalMatchedRows: 2,
                returnedRows: 2,
                truncated: false,
                selectedColumns: ['Region', 'Revenue'],
                appliedOrderBy: [],
                appliedLimit: 100,
                durationMs: 2,
            },
            appliedAt: new Date('2026-07-25T00:00:00.000Z'),
            source: 'execute_data_query',
            engine: 'duckdb',
            sqlPreview: 'SELECT Region, SUM(Revenue) AS Revenue FROM dataset GROUP BY Region',
            tableName: 'dataset',
            loadVersion: getCurrentAnalysisDatasetVersion(state),
        };
        const trace = createQueryTraceEntry(activeQuery, 'analysis');
        const provenance = buildAnalysisArtifactProvenance(plan, state, { queryTrace: trace });

        expect(provenance.queryEvidence).toMatchObject({
            traceId: trace.id,
            engine: 'duckdb',
            loadVersion: activeQuery.loadVersion,
        });
        expect(provenance.method.aggregations).toEqual([{
            function: 'sum',
            column: 'Revenue',
            alias: 'Revenue',
        }]);
        expect(provenance.evidenceRefs).toContainEqual(expect.objectContaining({
            kind: 'query_trace',
            id: trace.id,
        }));
    });

    it('marks missing lineage unverified and detects dataset-version staleness', () => {
        const provenance = buildAnalysisArtifactProvenance(plan, state);

        expect(resolveAnalysisArtifactFreshness(provenance, provenance.datasetVersion)).toBe('current');
        expect(resolveAnalysisArtifactFreshness(provenance, 'dataset-version-new')).toBe('stale');
        expect(resolveAnalysisArtifactFreshness(null, provenance.datasetVersion)).toBe('unverified');
    });

    it('binds narrative summaries to their source cards and degrades with source evidence', () => {
        const verifiedCardProvenance = buildAnalysisArtifactProvenance(plan, state);
        const narrative = buildNarrativeArtifactProvenance(state, [{
            id: 'card-revenue',
            plan,
            provenance: {
                ...verifiedCardProvenance,
                evidenceStatus: 'degraded',
                evidenceReasons: ['Query fallback was used.'],
            },
        } as never], '2026-07-25T00:00:00.000Z');

        expect(narrative).toMatchObject({
            evidenceStatus: 'degraded',
            datasetVersion: verifiedCardProvenance.datasetVersion,
            method: { operation: 'narrative_summary' },
        });
        expect(narrative.evidenceRefs).toContainEqual(expect.objectContaining({
            kind: 'analysis_card',
            id: 'card-revenue',
        }));
    });
});
