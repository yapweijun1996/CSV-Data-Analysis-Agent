import { beforeEach, describe, expect, it, vi } from 'vitest';

const { searchIfReadyMock } = vi.hoisted(() => ({
    searchIfReadyMock: vi.fn(),
}));

vi.mock('../services/vectorStore', () => ({
    vectorStore: {
        searchIfReady: searchIfReadyMock,
    },
}));

describe('findRelatedCards', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        searchIfReadyMock.mockResolvedValue([]);
    });

    it('skips blocking vector warmup and falls back to keyword scoring when memory is not ready', async () => {
        const { findRelatedCards } = await import('../services/agent/memory/cardRetrieval');
        const store = {
            getState: () => ({
                sessionId: 'report-1',
                currentDatasetId: 'dataset-1',
                reportMemoryScope: {
                    reportId: 'report-1',
                    datasetId: 'dataset-1',
                    datasetVersion: 'version-legacy',
                },
                csvData: {
                    fileName: 'quality.csv',
                    data: [{ Department: 'Sales', 'Null Count': 2 }],
                },
                rawCsvData: null,
                canonicalCsvData: null,
                columnProfiles: [{ name: 'Department', type: 'categorical' }, { name: 'Null Count', type: 'numerical' }],
                analysisCards: [
                    {
                        id: 'card-1',
                        plan: {
                            chartType: 'bar',
                            title: 'Null review by department',
                            description: 'Check data quality by department',
                            groupByColumn: 'Department',
                            valueColumn: 'Null Count',
                            aggregation: 'count',
                        },
                        aggregatedData: [],
                        summary: { language: 'English', text: 'Department null review summary' },
                        displayChartType: 'bar',
                        isDataVisible: false,
                        topN: null,
                        hideOthers: false,
                    },
                ],
            }),
        };

        const result = await findRelatedCards('review nulls by department', store as never, 3);

        expect(searchIfReadyMock).toHaveBeenCalledWith(
            'review nulls by department',
            5,
            expect.objectContaining({
                reportId: 'report-1',
                datasetId: 'dataset-1',
                datasetVersion: expect.stringMatching(/^version-/),
            }),
        );
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            id: 'card-1',
            title: 'Null Count by Department',
            displayTitle: 'Null Count by Department',
        });
    });

    it('reuses precomputed vector hits without issuing a second vector search', async () => {
        const { findRelatedCards } = await import('../services/agent/memory/cardRetrieval');
        const store = {
            getState: () => ({
                columnProfiles: [{ name: 'Region', type: 'categorical' }, { name: 'Revenue', type: 'numerical' }],
                analysisCards: [
                    {
                        id: 'card-1',
                        plan: {
                            chartType: 'bar',
                            title: 'Revenue by region',
                            description: 'Grouped revenue totals',
                            groupByColumn: 'Region',
                            valueColumn: 'Revenue',
                            aggregation: 'sum',
                        },
                        aggregatedData: [],
                        summary: { language: 'English', text: 'Revenue grouped by region' },
                        displayChartType: 'bar',
                        isDataVisible: false,
                        topN: null,
                        hideOthers: false,
                    },
                ],
            }),
        };

        const result = await findRelatedCards(
            'show me revenue by region',
            store as never,
            3,
            [{ id: 'card-1', text: 'Revenue by region memory', score: 0.91 }],
        );

        expect(searchIfReadyMock).not.toHaveBeenCalled();
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            id: 'card-1',
            semanticRole: 'business_dimension',
            helperExposureLevel: 'none',
            narrativeEligibility: 'preferred',
        });
    });

    it('keeps helper cards behind business cards when both match the same query', async () => {
        const { findRelatedCards } = await import('../services/agent/memory/cardRetrieval');
        const store = {
            getState: () => ({
                columnProfiles: [
                    { name: 'SeriesLabelL1', type: 'categorical' },
                    { name: 'SourceColumnName', type: 'categorical' },
                    { name: 'Value', type: 'numerical' },
                ],
                analysisCards: [
                    {
                        id: 'business-card',
                        plan: {
                            chartType: 'bar',
                            title: 'Revenue by Project',
                            description: 'Project revenue totals',
                            groupByColumn: 'SeriesLabelL1',
                            valueColumn: 'Value',
                            aggregation: 'sum',
                        },
                        aggregatedData: [{ SeriesLabelL1: 'BDB LAB DESIGN', Value: 1200 }],
                        summary: { language: 'English', text: 'Project revenue summary' },
                        displayChartType: 'bar',
                        isDataVisible: false,
                        topN: null,
                        hideOthers: false,
                    },
                    {
                        id: 'helper-card',
                        plan: {
                            chartType: 'bar',
                            title: 'Total Value by Source Column',
                            description: 'Source column totals',
                            groupByColumn: 'SourceColumnName',
                            valueColumn: 'Value',
                            aggregation: 'sum',
                        },
                        aggregatedData: [{ SourceColumnName: '24216', Value: 2400 }],
                        summary: { language: 'English', text: 'Helper summary' },
                        displayChartType: 'bar',
                        isDataVisible: false,
                        topN: null,
                        hideOthers: false,
                    },
                ],
            }),
        };

        const result = await findRelatedCards(
            'show me value by project',
            store as never,
            2,
            [
                { id: 'business-card', text: 'Revenue by Project memory', score: 0.82 },
                { id: 'helper-card', text: 'Total Value by Source Column memory', score: 0.82 },
            ],
        );

        expect(result[0]?.id).toBe('business-card');
        expect(result[1]?.id).toBe('helper-card');
    });
});
