import { describe, expect, it } from 'vitest';
import {
    buildColumnDisplayLabels,
    resolveDisplayPlanDescription,
    resolveDisplayPlanTitle,
} from '../services/dashboard/businessLabelResolver';

describe('businessLabelResolver', () => {
    it('keeps query implementation terms out of legacy card descriptions', () => {
        const plan = {
            title: 'Top Blocks by Count Rows',
            description: 'COUNT(*) grouped by Block Review the SQL evidence table first, then use the chart as a compact visual summary (10 rows).',
            groupByColumn: 'Block',
            valueColumn: 'Count Rows',
        };

        const description = resolveDisplayPlanDescription(plan);
        expect(description).toContain('Count of rows grouped by Block.');
        expect(description).toContain('Review the result table first');
        expect(description).not.toMatch(/SQL|COUNT\(\*\)/i);
    });

    it('rebuilds helper-column titles into human-readable display copy', () => {
        const plan = {
            title: 'Value by SeriesLabelL1',
            description: 'Compare Value by SeriesLabelL1.',
            groupByColumn: 'SeriesLabelL1',
            valueColumn: 'Value',
        };

        expect(resolveDisplayPlanTitle(plan)).toBe('Value by Series Label 1');
        expect(resolveDisplayPlanDescription(plan)).toBe('Compare Value by Series Label 1.');
    });

    it('derives browser column labels from business-friendly card plans', () => {
        const labels = buildColumnDisplayLabels(
            ['Code', 'SeriesLabelL1', 'Value', 'SourceColumnName'],
            [
                {
                    title: 'Revenue by Project',
                    description: 'Compare revenue by project.',
                    groupByColumn: 'SeriesLabelL1',
                    valueColumn: 'Value',
                },
            ],
        );

        expect(labels).toEqual({
            Code: 'Code',
            SeriesLabelL1: 'Project',
            Value: 'Revenue',
            SourceColumnName: 'Source Column',
        });
    });

    it('falls back to neutral helper labels when AI only invents helper-like qualifiers', () => {
        const plan = {
            title: 'Total Financial Value by Fiscal Series Label',
            description: 'Compare total financial value across fiscal series labels.',
            groupByColumn: 'SeriesLabelL1',
            valueColumn: 'Value',
        };

        expect(resolveDisplayPlanTitle(plan)).toBe('Total Financial Value by Series Label 1');
        expect(buildColumnDisplayLabels(['SeriesLabelL1'], [plan])).toEqual({
            SeriesLabelL1: 'Series Label 1',
        });
    });

    it('keeps pivot row_label and row_total internal so business hints survive in the display title', () => {
        const plan = {
            title: 'Row Total by Row Label',
            description: 'Pivoted Sales Exec by UOM with sum.',
            groupByColumn: 'row_label',
            valueColumn: 'row_total',
            artifactMetadata: {
                artifactType: 'pivot_matrix' as const,
                matrixRowLabel: 'Sales Exec',
                matrixColumnLabel: 'UOM',
                matrixMetricLabel: 'Item Cnt',
            },
        };

        expect(resolveDisplayPlanTitle(plan)).toBe('Item Cnt by Sales Exec and UOM');
        expect(resolveDisplayPlanDescription(plan)).toBe('Cross-tabulation of Item Cnt across Sales Exec (rows) and UOM (columns).');
    });

    it('strips double-colon separators and system terms from AI-generated titles', () => {
        const plan = {
            title: 'Top END USER NAME :: Matrix Grains by Sum 1',
            description: '',
            groupByColumn: 'END USER NAME',
            valueColumn: 'Sum 1',
        };

        const displayTitle = resolveDisplayPlanTitle(plan);
        expect(displayTitle).not.toContain('::');
        expect(displayTitle).not.toContain('Matrix Grains');
        expect(displayTitle).not.toContain('Sum 1');
    });

    it('cleans up internal metric placeholders like Sum 1 from descriptions', () => {
        const plan = {
            title: 'Total Units by MVC DEAL NUMBER :: PC 2001',
            description: 'Total Units by MVC DEAL NUMBER :: PC 2001 breakdown.',
            groupByColumn: 'MVC DEAL NUMBER',
            valueColumn: 'Units',
        };

        expect(resolveDisplayPlanTitle(plan)).not.toContain('::');
        expect(resolveDisplayPlanDescription(plan)).not.toContain('::');
    });

    it('repairs a missing space after a connector and displays CCY as Currency', () => {
        const plan = {
            title: 'Total Balance Amount byCurrency',
            description: 'Total Bal Amount grouped by CCY.',
            groupByColumn: 'CCY',
            valueColumn: 'Bal Amount',
        };

        expect(resolveDisplayPlanTitle(plan)).toBe('Bal Amount by Currency');
    });
});
