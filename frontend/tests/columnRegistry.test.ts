// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
    buildColumnRegistry,
    resolveColumnReference,
} from '../services/data/columnRegistry';

describe('columnRegistry', () => {
    it('includes sparse columns discovered after the first row', () => {
        const registry = buildColumnRegistry({
            data: {
                fileName: 'sparse.csv',
                data: [
                    { Region: 'North', Value: 10 },
                    { Region: 'South', Value: 20, LateMetric: 5 },
                ],
            },
            columnProfiles: [
                { name: 'Region', type: 'categorical' },
                { name: 'Value', type: 'numerical' },
                { name: 'LateMetric', type: 'numerical' },
            ],
        });

        expect(registry?.columns.map(entry => entry.physicalName)).toEqual(['Region', 'Value', 'LateMetric']);
        expect(registry?.columns.find(entry => entry.physicalName === 'LateMetric')?.source).toBe('sparse_discovered');
    });

    it('resolves RowRole aliases to the actual physical column', () => {
        const registry = buildColumnRegistry({
            data: {
                fileName: 'detail.csv',
                data: [
                    { RowClass: 'detail', Value: 100 },
                ],
            },
            columnProfiles: [
                { name: 'RowClass', type: 'categorical' },
                { name: 'Value', type: 'numerical' },
            ],
        });

        expect(resolveColumnReference('RowRole', registry)).toBe('RowClass');
        expect(resolveColumnReference('RowClass', registry)).toBe('RowClass');
    });

    it('resolves conservative standard business aliases for abbreviated columns', () => {
        const registry = buildColumnRegistry({
            data: {
                fileName: 'finance.csv',
                data: [{ CCY: 'SGD', UOM: 'EA', Amount: 10 }],
            },
            columnProfiles: [
                { name: 'CCY', type: 'categorical' },
                { name: 'UOM', type: 'categorical' },
                { name: 'Amount', type: 'numerical' },
            ],
        });

        expect(resolveColumnReference('currency', registry)).toBe('CCY');
        expect(resolveColumnReference('currency code', registry)).toBe('CCY');
        expect(resolveColumnReference('unit of measure', registry)).toBe('UOM');
    });

    it('preserves physical identity when a display label collides with another column name', () => {
        const registry = buildColumnRegistry({
            data: {
                fileName: 'sales.csv',
                data: [
                    { Sales: 50, Revenue: 100 },
                ],
            },
            columnProfiles: [
                { name: 'Sales', type: 'numerical' },
                { name: 'Revenue', type: 'numerical' },
            ],
            existingRegistry: {
                datasetVersion: 'dataset-older',
                generatedAt: '2026-03-25T00:00:00.000Z',
                columns: [
                    {
                        columnId: 'col_revenue',
                        physicalName: 'Revenue',
                        displayLabel: 'Sales',
                        aliases: ['Revenue', 'Sales', 'Gross Revenue'],
                        source: 'parsed_header',
                        analysisRole: 'business_metric',
                        allowedUsages: { groupBy: false, filter: true, select: true, orderBy: true, aggregationHint: 'additive' as const },
                        isSynthetic: false,
                        isExposedToAi: true,
                    },
                    {
                        columnId: 'col_sales',
                        physicalName: 'Sales',
                        displayLabel: 'Sales',
                        aliases: ['Sales'],
                        source: 'parsed_header',
                        analysisRole: 'business_metric',
                        allowedUsages: { groupBy: false, filter: true, select: true, orderBy: true, aggregationHint: 'additive' as const },
                        isSynthetic: false,
                        isExposedToAi: true,
                    },
                ],
            },
        });

        expect(registry?.columns.find(entry => entry.physicalName === 'Sales')?.columnId).toBe('col_sales');
        expect(resolveColumnReference('Sales', registry)).toBe('Sales');
        expect(resolveColumnReference('Gross Revenue', registry)).toBe('Revenue');
    });

    it('treats numerically profiled business entities as groupable business dimensions when semantic annotation says so', () => {
        const registry = buildColumnRegistry({
            data: {
                fileName: 'project-metrics.csv',
                data: [
                    { Project_ID: 10001, Revenue: 2500 },
                ],
            },
            columnProfiles: [
                { name: 'Project_ID', type: 'numerical' },
                { name: 'Revenue', type: 'currency' },
            ],
            semanticSnapshot: {
                datasetRole: 'detail_table',
                rowAnnotations: [],
                columnAnnotations: [
                    { columnName: 'Project_ID', semanticRole: 'business_entity', confidence: 0.98, reason: 'Detected project identifier.' },
                    { columnName: 'Revenue', semanticRole: 'metric', confidence: 0.99, reason: 'Detected measure column.' },
                ],
                recommendedAnalysisView: {
                    mode: 'soft_exclude',
                    includedRowIndices: [0],
                    excludedRowIndices: [],
                    includedRowCount: 1,
                    excludedRowCount: 0,
                    reason: 'No exclusions.',
                },
                summary: 'Project identifiers should remain analyzable dimensions.',
                generatedAt: '2026-03-25T00:00:00.000Z',
                modelId: 'gemini-test',
                sourceDatasetVersion: 'dataset-1',
            },
        });

        expect(registry?.columns.find(entry => entry.physicalName === 'Project_ID')).toMatchObject({
            analysisRole: 'business_dimension',
            allowedUsages: expect.objectContaining({ groupBy: true }),
        });
        expect(registry?.columns.find(entry => entry.physicalName === 'Revenue')).toMatchObject({
            analysisRole: 'business_metric',
            allowedUsages: expect.objectContaining({ groupBy: false }),
        });
    });

    it('keeps explicit semantic metrics classified as business metrics', () => {
        const registry = buildColumnRegistry({
            data: {
                fileName: 'sales.csv',
                data: [
                    { Revenue: 1000, MarginPct: 12.5 },
                ],
            },
            columnProfiles: [
                { name: 'Revenue', type: 'numerical' },
                { name: 'MarginPct', type: 'percentage' },
            ],
            semanticSnapshot: {
                datasetRole: 'detail_table',
                rowAnnotations: [],
                columnAnnotations: [
                    { columnName: 'Revenue', semanticRole: 'metric', confidence: 0.99, reason: 'Detected revenue measure.' },
                    { columnName: 'MarginPct', semanticRole: 'metric', confidence: 0.99, reason: 'Detected percentage measure.' },
                ],
                recommendedAnalysisView: {
                    mode: 'soft_exclude',
                    includedRowIndices: [0],
                    excludedRowIndices: [],
                    includedRowCount: 1,
                    excludedRowCount: 0,
                    reason: 'No exclusions.',
                },
                summary: 'Both numeric columns are metrics.',
                generatedAt: '2026-03-25T00:00:00.000Z',
                modelId: 'gemini-test',
                sourceDatasetVersion: 'dataset-1',
            },
        });

        expect(registry?.columns.map(entry => ({
            physicalName: entry.physicalName,
            analysisRole: entry.analysisRole,
            groupBy: entry.allowedUsages.groupBy,
        }))).toEqual([
            { physicalName: 'Revenue', analysisRole: 'business_metric', groupBy: false },
            { physicalName: 'MarginPct', analysisRole: 'business_metric', groupBy: false },
        ]);
    });

    it('uses an explicit user field role to correct the analysis role', () => {
        const registry = buildColumnRegistry({
            data: {
                fileName: 'repair.csv',
                data: [{ ProjectCode: 10001, Notes: 'late delivery' }],
            },
            columnProfiles: [
                { name: 'ProjectCode', type: 'numerical' },
                { name: 'Notes', type: 'categorical' },
            ],
            userColumnAnnotations: {
                ProjectCode: {
                    columnName: 'ProjectCode',
                    businessLabel: 'Project',
                    description: '',
                    businessRole: 'dimension',
                },
                Notes: {
                    columnName: 'Notes',
                    businessLabel: 'Notes',
                    description: '',
                    businessRole: 'helper',
                },
            },
        });

        expect(registry?.columns.find(column => column.physicalName === 'ProjectCode')).toMatchObject({
            analysisRole: 'business_dimension',
            allowedUsages: expect.objectContaining({ groupBy: true }),
        });
        expect(registry?.columns.find(column => column.physicalName === 'Notes')).toMatchObject({
            analysisRole: 'helper_dimension',
        });
    });
});

describe('columnRegistry — aggregationHint', () => {
    it('marks percentage-typed columns as non_additive', () => {
        const registry = buildColumnRegistry({
            data: { fileName: 'agg.csv', data: [{ Margin: 30, Revenue: 1000 }] },
            columnProfiles: [
                { name: 'Margin', type: 'percentage' },
                { name: 'Revenue', type: 'currency' },
            ],
        });
        expect(registry?.columns.find(c => c.physicalName === 'Margin')?.allowedUsages.aggregationHint).toBe('non_additive');
        expect(registry?.columns.find(c => c.physicalName === 'Revenue')?.allowedUsages.aggregationHint).toBe('additive');
    });

    it('marks dimension columns as dimension_only', () => {
        const registry = buildColumnRegistry({
            data: { fileName: 'dim.csv', data: [{ Department: 'Sales', Amount: 500 }] },
            columnProfiles: [
                { name: 'Department', type: 'categorical' },
                { name: 'Amount', type: 'numerical' },
            ],
        });
        expect(registry?.columns.find(c => c.physicalName === 'Department')?.allowedUsages.aggregationHint).toBe('dimension_only');
        expect(registry?.columns.find(c => c.physicalName === 'Amount')?.allowedUsages.aggregationHint).toBe('additive');
    });

    it('detects non_additive from column name patterns (avg, rate, margin, etc.)', () => {
        const registry = buildColumnRegistry({
            data: { fileName: 'names.csv', data: [{ Avg_Salary: 8000, Profit_Margin: 25, Growth_Rate: 5 }] },
            columnProfiles: [
                { name: 'Avg_Salary', type: 'numerical' },
                { name: 'Profit_Margin', type: 'numerical' },
                { name: 'Growth_Rate', type: 'numerical' },
            ],
        });
        expect(registry?.columns.find(c => c.physicalName === 'Avg_Salary')?.allowedUsages.aggregationHint).toBe('non_additive');
        expect(registry?.columns.find(c => c.physicalName === 'Profit_Margin')?.allowedUsages.aggregationHint).toBe('non_additive');
        expect(registry?.columns.find(c => c.physicalName === 'Growth_Rate')?.allowedUsages.aggregationHint).toBe('non_additive');
    });

    it('marks per-unit, rate-acronym, and configured budget metrics as non_additive', () => {
        const registry = buildColumnRegistry({
            data: {
                fileName: 'metric-semantics.csv',
                data: [{
                    'Cost per results': 1.25,
                    'Purchase ROAS': 2.4,
                    'Outbound CTR': 0.03,
                    'Ad set budget': 300,
                    Budget: 1200,
                    Revenue: 5000,
                }],
            },
            columnProfiles: [
                { name: 'Cost per results', type: 'numerical' },
                { name: 'Purchase ROAS', type: 'numerical' },
                { name: 'Outbound CTR', type: 'numerical' },
                { name: 'Ad set budget', type: 'numerical' },
                { name: 'Budget', type: 'numerical' },
                { name: 'Revenue', type: 'currency' },
            ],
        });

        expect(registry?.columns.find(c => c.physicalName === 'Cost per results')?.allowedUsages.aggregationHint).toBe('non_additive');
        expect(registry?.columns.find(c => c.physicalName === 'Purchase ROAS')?.allowedUsages.aggregationHint).toBe('non_additive');
        expect(registry?.columns.find(c => c.physicalName === 'Outbound CTR')?.allowedUsages.aggregationHint).toBe('non_additive');
        expect(registry?.columns.find(c => c.physicalName === 'Ad set budget')?.allowedUsages.aggregationHint).toBe('non_additive');
        expect(registry?.columns.find(c => c.physicalName === 'Budget')?.allowedUsages.aggregationHint).toBe('additive');
        expect(registry?.columns.find(c => c.physicalName === 'Revenue')?.allowedUsages.aggregationHint).toBe('additive');
    });

    it('defaults unknown roles to unrestricted', () => {
        const registry = buildColumnRegistry({
            data: { fileName: 'unk.csv', data: [{ Mystery: 'abc' }] },
            columnProfiles: [],
        });
        const entry = registry?.columns.find(c => c.physicalName === 'Mystery');
        expect(entry?.allowedUsages.aggregationHint).toBe('unrestricted');
    });
});
