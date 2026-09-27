import { describe, expect, it } from 'vitest';
import type {
    ReportBoundary,
    ReportStructureFieldProposal,
    ReportStructureProposal,
} from '../types';
import { verifyReportStructureProposal } from '../services/agent/reportStructureProposalVerifier';

const boundary: ReportBoundary = {
    headerRowIndex: 0,
    headerLayerRowIndexes: [],
    bodyStartIndex: 1,
    summaryStartIndex: null,
    parameterRowIndexes: [],
    repeatedHeaderRowIndexes: [],
};

const createProposal = (
    overrides: Partial<ReportStructureProposal> = {},
): ReportStructureProposal => ({
    purpose: {
        summary: 'Compare revenue by region and order date.',
        confidence: 0.92,
    },
    grain: {
        columns: ['Region', 'Order Date'],
        description: 'One row per region and order date.',
        confidence: 0.9,
    },
    fields: [
        { columnName: 'Region', role: 'grain', confidence: 0.92, reasoning: 'Business grouping field.' },
        { columnName: 'Order Date', role: 'time_dimension', confidence: 0.9, reasoning: 'Visible date field.' },
        { columnName: 'Revenue', role: 'metric', confidence: 0.95, reasoning: 'Numeric amount field.' },
    ],
    pivot: {
        shape: 'row_table',
        dimensionColumns: ['Region', 'Order Date'],
        measureColumns: ['Revenue'],
        labelColumns: [],
        confidence: 0.91,
    },
    bodyRowRoles: [],
    carryForwardColumns: [],
    sectionLabelColumns: [],
    detailInclusionRoles: ['detail'],
    confidence: 0.91,
    reasoning: 'The evidence is a stable row-oriented table.',
    ...overrides,
});

const rawRows = [
    ['Region', 'Order Date', 'Revenue'],
    ['East', '2026-01-01', '100'],
    ['West', '2026-01-02', '120'],
    ['East', '2026-01-03', '90'],
    ['West', '2026-01-04', '130'],
    ['East', '2026-01-05', '140'],
];

describe('verifyReportStructureProposal', () => {
    it('passes a high-confidence proposal that agrees with deterministic evidence', () => {
        const result = verifyReportStructureProposal({
            proposal: createProposal(),
            mergedHeaders: ['Region', 'Order Date', 'Revenue'],
            rawRows,
            boundary,
            deterministicTargetShape: 'row_table',
        });

        expect(result?.tier).toBe('pass');
        expect(result?.autoApplySafe).toBe(true);
        expect(result?.requiresHumanConfirmation).toBe(false);
        expect(result?.grainColumns).toEqual(['Region', 'Order Date']);
        expect(result?.fields.map(field => field.columnName)).toEqual(['Region', 'Order Date', 'Revenue']);
    });

    it('warns and requires confirmation for an ambiguous high-impact proposal', () => {
        const result = verifyReportStructureProposal({
            proposal: createProposal({
                grain: {
                    columns: [],
                    description: 'Grain is not resolved.',
                    confidence: 0.68,
                },
                pivot: {
                    shape: 'unknown',
                    dimensionColumns: [],
                    measureColumns: [],
                    labelColumns: [],
                    confidence: 0.7,
                },
                confidence: 0.7,
            }),
            mergedHeaders: ['Region', 'Order Date', 'Revenue'],
            rawRows,
            boundary,
            deterministicTargetShape: 'row_table',
        });

        expect(result?.tier).toBe('warn');
        expect(result?.autoApplySafe).toBe(false);
        expect(result?.requiresHumanConfirmation).toBe(true);
        expect(result?.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
            'grain_missing',
            'pivot_shape_unknown',
            'proposal_low_confidence',
        ]));
    });

    it('fails closed to human review when model and deterministic pivot shapes conflict', () => {
        const result = verifyReportStructureProposal({
            proposal: createProposal(),
            mergedHeaders: ['Region', 'Order Date', 'Revenue'],
            rawRows,
            boundary,
            deterministicTargetShape: 'long_fact_table',
        });

        expect(result?.tier).toBe('fail');
        expect(result?.accepted).toBe(false);
        expect(result?.requiresHumanConfirmation).toBe(true);
        expect(result?.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'pivot_shape_conflict', severity: 'error' }),
        ]));
    });

    it('uses a tolerance band instead of rejecting one unresolved field out of one hundred', () => {
        const headers = Array.from({ length: 99 }, (_value, index) => `Field ${index + 1}`);
        const fields: ReportStructureFieldProposal[] = [
            ...headers.map(columnName => ({
                columnName,
                role: 'descriptor' as const,
                confidence: 0.9,
                reasoning: 'Visible descriptor.',
            })),
            {
                columnName: 'One model typo',
                role: 'descriptor',
                confidence: 0.9,
                reasoning: 'Model-only field.',
            },
        ];
        const result = verifyReportStructureProposal({
            proposal: createProposal({
                grain: {
                    columns: ['Field 1'],
                    description: 'One row per Field 1.',
                    confidence: 0.9,
                },
                fields,
                pivot: {
                    shape: 'row_table',
                    dimensionColumns: ['Field 1'],
                    measureColumns: [],
                    labelColumns: [],
                    confidence: 0.9,
                },
            }),
            mergedHeaders: headers,
            rawRows: [headers, headers.map((_header, index) => `Value ${index}`)],
            boundary,
            deterministicTargetShape: 'row_table',
        });

        expect(result?.tier).toBe('pass');
        expect(result?.issues.some(issue => issue.code === 'field_column_unresolved')).toBe(false);
    });
});
