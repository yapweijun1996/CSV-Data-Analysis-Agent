import { describe, expect, it } from 'vitest';
import type { AnalysisCardData, ColumnProfile } from '../types';
import { buildCardMemoryProjectionList, selectReadableLongTermMemory } from '../services/agent/memory/cardMemoryProjection';

const columnProfiles: ColumnProfile[] = [
    { name: 'SeriesLabelL1', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
    { name: 'SourceColumnName', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
    { name: 'Value', type: 'numerical', missingPercentage: 0, valueRange: [100, 2400] },
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
        isFallback: overrides.plan?.isFallback ?? false,
    },
    aggregatedData: overrides.aggregatedData ?? [{ SeriesLabelL1: 'BDB LAB DESIGN', Value: 1200 }],
    summary: overrides.summary ?? { language: 'English', text: '### Summary\n- Project revenue remains concentrated.' },
    displayChartType: overrides.displayChartType ?? 'bar',
    isDataVisible: overrides.isDataVisible ?? false,
    topN: overrides.topN ?? null,
    hideOthers: overrides.hideOthers ?? false,
    hiddenLabels: overrides.hiddenLabels ?? [],
    filter: overrides.filter,
});

describe('cardMemoryProjection', () => {
    it('builds display-safe memory text and metadata for business cards', () => {
        const [projection] = buildCardMemoryProjectionList([buildCard()], columnProfiles);

        expect(projection.memoryText).toContain('[Analysis Card] Revenue by Project');
        expect(projection.memoryText).toContain('Dimension: Project');
        expect(projection.metadata).toMatchObject({
            kind: 'analysis_card',
            semanticRole: 'business_dimension',
            memoryFormatVersion: 'ir-v1',
        });
    });

    it('keeps helper-heavy memory text neutral', () => {
        const [projection] = buildCardMemoryProjectionList([
            buildCard({
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
            }),
        ], columnProfiles);

        expect(projection.memoryText).toContain('Interpret labels neutrally.');
        expect(projection.helperExposureLevel).toBe('high');
    });

    it('maps card vector hits back to readable IR-derived retrieval snippets', () => {
        const [projection] = buildCardMemoryProjectionList([buildCard()], columnProfiles);

        const memory = selectReadableLongTermMemory([
            { id: 'card-1', text: 'legacy vector text', score: 0.91 },
            { id: 'dataset-doc', text: 'dataset memory', score: 0.63 },
        ], new Map([[projection.cardId, projection]]), 2);

        expect(memory[0]).toContain('Revenue by Project.');
        expect(memory[0]).not.toBe('legacy vector text');
        expect(memory[1]).toBe('dataset memory');
    });
});
