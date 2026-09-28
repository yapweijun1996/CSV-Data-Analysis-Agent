import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AnalysisCardSummary } from '../components/analysis-card/AnalysisCardSummary';

const plan = {
    aggregation: 'sum',
    groupByColumn: 'SeriesLabelL1',
    valueColumn: 'Value',
    title: 'Total Value by SeriesLabelL1',
    description: 'Compare total value by SeriesLabelL1.',
} as any;

afterEach(() => {
    cleanup();
});

describe('AnalysisCardSummary', () => {
    it('describes table-only results without promising a chart', () => {
        render(<AnalysisCardSummary
            cardId="table-only"
            plan={{ ...plan, artifactMetadata: { hideChartByDefault: true } }}
            totalValue={12840}
            overallTotalValue={12840}
            displayedRowCount={1}
            totalRowCount={1}
            displayedMetricLabel="Total Value"
            displayedGroupLabel="Series Label 1"
            topN={null}
            hideOthers={false}
            hiddenLabelCount={0}
            language="English"
        />);

        expect(screen.getByText('The result table is available for verification.')).toBeInTheDocument();
        expect(screen.queryByText(/visible table, chart, and totals/)).not.toBeInTheDocument();
    });

    it('shows only a three-line preview until the user expands the analysis', () => {
        render(
            <AnalysisCardSummary
                plan={plan}
                totalValue={12840}
                overallTotalValue={15600}
                displayedRowCount={8}
                totalRowCount={12}
                displayedMetricLabel="Total Value"
                displayedGroupLabel="Series Label 1"
                topN={8}
                hideOthers={true}
                hiddenLabelCount={0}
                language="English"
                summary={{
                    language: 'English',
                    text: `- Top spending comes from Admin cost (13.6%).
- Personnel statutory cost is the second largest category.
- Training and transport spending remain relatively controlled.

### Expanded Analysis
- Admin cost is roughly 2.1x transport spend in this cut.
- The top two categories account for the clearest concentration of spend.
- Review whether admin growth is structural or timing-related.`,
                }}
                pivotQualitySummary={{
                    totalRows: 20,
                    omittedRowCount: 12,
                    unknownCount: 1,
                    zeroCount: 3,
                    negativeCount: 2,
                    hiddenZeroRowCount: 2,
                    labelNormalizationAppliedColumns: 1,
                    labelNormalizationAppliedClusters: 2,
                    labelNormalizationAppliedReplacements: 3,
                    labelNormalizationDeferredSuggestions: 1,
                    recommendedTotalOnlyDueToWideColumns: true,
                    defaultCompressedStackedView: true,
                    effectiveMatrixValueColumnCount: 14,
                    visibleMatrixValueColumnCount: 8,
                    foldedMatrixValueColumnCount: 6,
                    isStackedChartActive: false,
                }}
            />
        );

        expect(screen.getByText('Current view shows 8 of 12 entries and 12,840.00 of 15,600.00.')).toBeInTheDocument();
        expect(screen.getByText('This summary is based on Total Value grouped by Series Label 1.')).toBeInTheDocument();
        expect(screen.getByText('Scope: Top 8 view; "Others" hidden; No hidden labels.')).toBeInTheDocument();
        expect(screen.getByText('Quality note')).toBeInTheDocument();
        expect(screen.getByText('Deterministic label normalization auto-merged 2 alias groups across 1 columns using 3 replacement rules before this pivot.')).toBeInTheDocument();
        expect(screen.getByText('1 lower-confidence alias suggestions were left unmerged for review.')).toBeInTheDocument();
        expect(screen.getByText('Full pivot still includes 1 unknown-label rows, 3 zero-total rows, and 2 negative rows.')).toBeInTheDocument();
        expect(screen.getByText('The chart focuses on the first 8 visible rows for readability; 12 additional rows remain folded into the full pivot so the overall total does not introduce survivorship bias.')).toBeInTheDocument();
        expect(screen.getByText('The chart currently hides 2 zero-total rows; the table and totals still reflect the full pivot.')).toBeInTheDocument();
        expect(screen.getByText('By default, this pivot shows the top 8 column groups and folds 6 additional columns into Others; the table and totals still reflect the full pivot.')).toBeInTheDocument();
        expect(screen.queryByText('Top spending comes from Admin cost (13.6%).')).not.toBeInTheDocument();
        expect(screen.queryByText('Admin cost is roughly 2.1x transport spend in this cut.')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Expand Analysis' }));

        expect(screen.getByText('Expanded AI narrative')).toBeInTheDocument();
        expect(screen.getByText('Top spending comes from Admin cost (13.6%).')).toBeInTheDocument();
        expect(screen.getByText('Admin cost is roughly 2.1x transport spend in this cut.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Collapse Analysis' })).toBeInTheDocument();
    });

    it('defaults to the selected Mandarin summary and keeps the English version collapsed', () => {
        render(
            <AnalysisCardSummary
                plan={plan}
                totalValue={12840}
                overallTotalValue={15600}
                displayedRowCount={8}
                totalRowCount={12}
                displayedMetricLabel="总值"
                displayedGroupLabel="系列标签 1"
                topN={8}
                hideOthers={true}
                hiddenLabelCount={0}
                language="Mandarin"
                summary={{
                    language: 'Mandarin',
                    text: `- 行政成本是最高支出项目。
- 人员法定成本排在第二。
- 培训与交通支出相对受控。

### Expanded Analysis
- 中文细节默认折叠显示。`,
                }}
            />
        );

        expect(screen.getByText('当前视图显示 8/12 条记录，合计为 12,840.00，整体总计为 15,600.00。')).toBeInTheDocument();
        expect(screen.getByText('该摘要基于按 系列标签 1 聚合的 总值。')).toBeInTheDocument();
        expect(screen.queryByText('Admin cost is the largest spend bucket.')).not.toBeInTheDocument();
        expect(screen.queryByText('行政成本是最高支出项目。')).not.toBeInTheDocument();
    });

    it('shows a generated-in badge when an existing summary was created in another language', () => {
        render(
            <AnalysisCardSummary
                plan={plan}
                totalValue={12840}
                overallTotalValue={12840}
                displayedRowCount={8}
                totalRowCount={8}
                displayedMetricLabel="Total Value"
                displayedGroupLabel="Series Label 1"
                topN={null}
                hideOthers={false}
                hiddenLabelCount={0}
                language="English"
                summary={{
                    language: 'Japanese',
                    text: '- 管理費が最も大きい支出項目です。',
                }}
            />
        );

        expect(screen.getByText('Generated in Japanese')).toBeInTheDocument();
        expect(screen.queryByText('管理費が最も大きい支出項目です。')).not.toBeInTheDocument();
    });

    it('adds a stacked-column focus note when wide pivot columns are folded into Others', () => {
        render(
            <AnalysisCardSummary
                plan={plan}
                totalValue={12840}
                overallTotalValue={15600}
                displayedRowCount={8}
                totalRowCount={12}
                displayedMetricLabel="Total Value"
                displayedGroupLabel="Series Label 1"
                topN={8}
                hideOthers={true}
                hiddenLabelCount={0}
                language="English"
                summary={{
                    language: 'English',
                    text: '',
                }}
                pivotQualitySummary={{
                    totalRows: 20,
                    omittedRowCount: 12,
                    unknownCount: 1,
                    zeroCount: 3,
                    negativeCount: 2,
                    hiddenZeroRowCount: 0,
                    labelNormalizationAppliedColumns: 0,
                    labelNormalizationAppliedClusters: 0,
                    labelNormalizationAppliedReplacements: 0,
                    labelNormalizationDeferredSuggestions: 0,
                    recommendedTotalOnlyDueToWideColumns: true,
                    defaultCompressedStackedView: true,
                    effectiveMatrixValueColumnCount: 14,
                    visibleMatrixValueColumnCount: 8,
                    foldedMatrixValueColumnCount: 6,
                    isStackedChartActive: true,
                }}
            />
        );

        expect(screen.getByText('The stacked chart shows the top 8 column groups and folds 6 additional columns into Others; the table and totals still reflect the full pivot.')).toBeInTheDocument();
    });

    it('does not sum averages or describe a nonexistent Others group', () => {
        const { container } = render(<AnalysisCardSummary
            cardId="average-card"
            plan={{ ...plan, aggregation: 'avg', title: 'Average Price by Town' }}
            totalValue={900}
            overallTotalValue={1200}
            displayedRowCount={2}
            totalRowCount={3}
            displayedMetricLabel="Avg Price"
            displayedGroupLabel="Town"
            topN={2}
            hideOthers={true}
            hiddenLabelCount={0}
            language="English"
        />);

        expect(screen.getByText('Current view shows 2 of 3 groups. Compare each value separately; these measures cannot be added together.')).toBeInTheDocument();
        expect(screen.getByText('Scope: Top 2 view; No hidden labels.')).toBeInTheDocument();
        expect(container.textContent).not.toContain('1,200');
        expect(container.textContent).not.toContain('Others');
    });

    it('does not claim legacy cards with missing aggregation are non-additive', () => {
        const { container } = render(<AnalysisCardSummary
            cardId="legacy-card"
            plan={{ ...plan, aggregation: undefined }}
            totalValue={900}
            overallTotalValue={1200}
            displayedRowCount={2}
            totalRowCount={3}
            displayedMetricLabel="Value"
            displayedGroupLabel="Town"
            topN={null}
            hideOthers={false}
            hiddenLabelCount={0}
            language="English"
        />);

        expect(screen.getByText('Current view shows 2 of 3 groups. The aggregation type is unavailable, so no combined total is shown.')).toBeInTheDocument();
        expect(container.textContent).not.toContain('cannot be added together');
    });
});
