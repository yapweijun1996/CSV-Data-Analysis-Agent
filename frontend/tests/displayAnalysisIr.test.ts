import { describe, expect, it } from 'vitest';
import type { AnalysisCardData, ColumnProfile } from '../types';
import { buildDisplayAnalysisIr, buildDisplayAnalysisIrList } from '../services/dashboard/displayAnalysisIr';

const columnProfiles: ColumnProfile[] = [
    { name: 'SeriesLabelL1', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
    { name: 'SourceColumnName', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
    { name: 'UOM', type: 'categorical', uniqueValues: 12, missingPercentage: 0 },
    { name: 'UOM_10', type: 'categorical', uniqueValues: 4, missingPercentage: 0 },
    { name: 'Value', type: 'numerical', missingPercentage: 0, valueRange: [100, 1200] },
];

const buildCard = (overrides: Partial<AnalysisCardData> = {}): AnalysisCardData => ({
    id: overrides.id ?? 'card-1',
    plan: {
        title: overrides.plan?.title ?? 'Revenue by Project',
        description: overrides.plan?.description ?? 'Compare revenue by project.',
        chartType: overrides.plan?.chartType ?? 'bar',
        aggregation: overrides.plan?.aggregation ?? 'sum',
        groupByColumn: overrides.plan?.groupByColumn ?? 'SeriesLabelL1',
        valueColumn: overrides.plan?.valueColumn ?? 'Value',
        preFilter: overrides.plan?.preFilter,
        isFallback: overrides.plan?.isFallback ?? false,
    },
    aggregatedData: overrides.aggregatedData ?? [{ SeriesLabelL1: 'BDB LAB DESIGN', Value: 1200 }],
    summary: overrides.summary ?? { language: 'English', text: 'Summary' },
    displayChartType: overrides.displayChartType ?? 'bar',
    isDataVisible: overrides.isDataVisible ?? false,
    topN: overrides.topN ?? null,
    hideOthers: overrides.hideOthers ?? false,
    hiddenLabels: overrides.hiddenLabels ?? [],
    filter: overrides.filter,
    autoAnalysisEvaluation: overrides.autoAnalysisEvaluation ?? null,
});

describe('displayAnalysisIr', () => {
    it('classifies business and helper cards differently and penalizes helper cards', () => {
        const businessCard = buildCard({
            id: 'business-card',
            plan: {
                title: 'Revenue by Project',
                description: 'Compare revenue by project.',
                chartType: 'bar',
                aggregation: 'sum',
                groupByColumn: 'SeriesLabelL1',
                valueColumn: 'Value',
            },
        });
        const helperCard = buildCard({
            id: 'helper-card',
            plan: {
                title: 'Total Value by Source Column',
                description: 'Compare total value by source column.',
                chartType: 'bar',
                aggregation: 'sum',
                groupByColumn: 'SourceColumnName',
                valueColumn: 'Value',
            },
            aggregatedData: [{ SourceColumnName: '24216', Value: 2400 }],
        });

        const [businessIr, helperIr] = buildDisplayAnalysisIrList([businessCard, helperCard], columnProfiles);

        expect(businessIr.semanticRole).toBe('business_dimension');
        expect(helperIr.semanticRole).toBe('helper_dimension');
        expect(businessIr.selectionScore).toBeGreaterThan(helperIr.selectionScore);
        expect(businessIr.narrativeEligibility).toBe('preferred');
        expect(businessIr.helperExposureLevel).toBe('none');
        expect(businessIr.businessMeaningConfidence).toBeGreaterThanOrEqual(0.7);
        expect(helperIr.narrativeEligibility).toBe('allowed_neutral');
        expect(helperIr.helperExposureLevel).toBe('high');
        expect(helperIr.aggregationQualityFlags).toContain('helper_dimension_heavy');
    });

    it('keeps helper labels neutral and display-safe in the derived IR', () => {
        const helperCard = buildCard({
            id: 'helper-card',
            plan: {
                title: 'Total Value by Source Column.',
                description: 'Compare total value by source column.',
                chartType: 'bar',
                aggregation: 'sum',
                groupByColumn: 'SourceColumnName',
                valueColumn: 'Value',
            },
            aggregatedData: [{ SourceColumnName: '24216', Value: 2400 }],
        });

        const ir = buildDisplayAnalysisIr(helperCard, [helperCard], columnProfiles);

        expect(ir.displayTitle).toBe('Total Value by Source Column');
        expect(ir.displayGroupLabel).toBe('Source Column');
        expect(ir.displayMetricLabel).toBe('Total Value');
        expect(ir.safeNarrativeLabels.dimension).toBe('Source Column');
        expect(ir.aggregationQualityFlags).toContain('neutral_only_labels');
    });

    it('marks fallback cards as fallback and excludes them from selection scoring', () => {
        const fallbackCard = buildCard({
            plan: {
                title: 'Recovered Revenue by Project',
                description: 'Fallback card',
                chartType: 'bar',
                aggregation: 'sum',
                groupByColumn: 'SeriesLabelL1',
                valueColumn: 'Value',
                isFallback: true,
            },
        });

        const ir = buildDisplayAnalysisIr(fallbackCard, [fallbackCard], columnProfiles);

        expect(ir.semanticRole).toBe('fallback');
        expect(ir.selectionScore).toBe(Number.NEGATIVE_INFINITY);
        expect(ir.selectionReasons).toContain('fallback_card_excluded');
        expect(ir.helperExposureLevel).toBe('high');
        expect(ir.narrativeEligibility).toBe('allowed_neutral');
        expect(ir.aggregationQualityFlags).toContain('fallback_view');
    });

    it('demotes helper row index cards to avoid-if-possible narrative handling', () => {
        const helperRowCard = buildCard({
            id: 'helper-row-card',
            plan: {
                title: 'Total Value by Source Row',
                description: 'Compare total value by source row.',
                chartType: 'bar',
                aggregation: 'sum',
                groupByColumn: 'SourceRowIndex',
                valueColumn: 'Value',
            },
            aggregatedData: [{ SourceRowIndex: 0, Value: 22191666.85 }],
        });

        const ir = buildDisplayAnalysisIr(helperRowCard, [helperRowCard], columnProfiles);

        expect(ir.semanticRole).toBe('helper_row_index');
        expect(ir.helperExposureLevel).toBe('high');
        expect(ir.businessMeaningConfidence).toBeLessThanOrEqual(0.2);
        expect(ir.narrativeEligibility).toBe('avoid_if_possible');
        expect(ir.aggregationQualityFlags).toContain('helper_dimension_heavy');
    });

    it('keeps business cards narrative-safe when null-like labels are present', () => {
        const businessCard = buildCard({
            id: 'business-null-card',
            plan: {
                title: 'Revenue by Project',
                description: 'Compare revenue by project.',
                chartType: 'bar',
                aggregation: 'sum',
                groupByColumn: 'SeriesLabelL1',
                valueColumn: 'Value',
            },
            aggregatedData: [
                { SeriesLabelL1: 'BDB LAB DESIGN', Value: 1200 },
                { SeriesLabelL1: '', Value: 240 },
            ],
        });

        const ir = buildDisplayAnalysisIr(businessCard, [businessCard], columnProfiles);

        expect(ir.semanticRole).toBe('business_dimension');
        expect(ir.safeNarrativeLabels.title).toBe('Revenue by Project');
        expect(ir.aggregationQualityFlags).toContain('null_group_labels');
        expect(ir.businessMeaningConfidence).toBeGreaterThan(0.65);
    });

    it('downgrades repeated bundle members so they cannot masquerade as business dimensions', () => {
        const repeatedCard = buildCard({
            id: 'repeated-card',
            plan: {
                title: 'Value by UOM_10',
                description: 'Compare value by repeated UOM bundle column.',
                chartType: 'bar',
                aggregation: 'sum',
                groupByColumn: 'UOM_10',
                valueColumn: 'Value',
            },
            aggregatedData: [{ UOM_10: 'PCS', Value: 1200 }],
        });

        const ir = buildDisplayAnalysisIr(repeatedCard, [repeatedCard], columnProfiles);

        expect(ir.semanticRole).toBe('repeated_bundle_member');
        expect(ir.narrativeEligibility).toBe('avoid_if_possible');
        expect(ir.aggregationQualityFlags).toContain('repeated_bundle_dimension');
        expect(ir.selectionScore).toBeLessThan(0);
    });

    it('demotes caveated business cards so trusted cards win narrative and KPI selection', () => {
        const caveatedCard = buildCard({
            id: 'caveated-card',
            autoAnalysisEvaluation: {
                verdict: 'caveated',
                reasonCodes: ['aggregation_quality_warning'],
                detail: 'aggregation_quality_warning',
                evaluatedAt: new Date().toISOString(),
                source: 'auto_analysis_evaluator_v1',
            },
        });

        const ir = buildDisplayAnalysisIr(caveatedCard, [caveatedCard], columnProfiles);

        expect(ir.autoAnalysisVerdict).toBe('caveated');
        expect(ir.narrativeEligibility).toBe('allowed_neutral');
        expect(ir.selectionReasons).toContain('caveated_verdict_penalty');
        expect(ir.businessMeaningConfidence).toBeLessThan(0.74);
    });

    it('does not mark cards with canonical prefilters as no-prefilter candidates', () => {
        const businessCard = buildCard({
            id: 'prefiltered-card',
            plan: {
                title: 'Revenue by Project',
                description: 'Compare revenue by project.',
                chartType: 'bar',
                aggregation: 'sum',
                groupByColumn: 'SeriesLabelL1',
                valueColumn: 'Value',
                preFilter: [{ column: 'RowClass', operator: 'eq', value: 'fact' }],
            },
            aggregatedData: [{ SeriesLabelL1: 'BDB LAB DESIGN', Value: 1200 }],
        });

        const ir = buildDisplayAnalysisIr(businessCard, [businessCard], columnProfiles);

        expect(ir.selectionReasons).not.toContain('no_prefilter');
    });

    it('does not treat a long monthly temporal series as fragmented categorical groups', () => {
        const trendCard = buildCard({
            id: 'monthly-trend-card',
            plan: {
                title: 'Average Resale Price by Month',
                description: 'Track average resale prices over time.',
                chartType: 'area',
                aggregation: 'avg',
                groupByColumn: 'month',
                valueColumn: 'avg_resale_price',
            },
            aggregatedData: Array.from({ length: 36 }, (_, index) => ({
                month: `${2023 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`,
                avg_resale_price: 400_000 + index * 1_000,
            })),
        });

        const ir = buildDisplayAnalysisIr(trendCard, [trendCard], [
            { name: 'month', type: 'categorical', uniqueValues: 36, missingPercentage: 0 },
            { name: 'avg_resale_price', type: 'currency', uniqueValues: 36, missingPercentage: 0 },
        ]);

        expect(ir.aggregationQualityFlags).not.toContain('fragmented_groups');
    });
});
