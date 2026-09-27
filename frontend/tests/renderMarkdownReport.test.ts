/**
 * Tests for services/reporting/renderMarkdownReport.ts
 *
 * Verifies GFM markdown report generation:
 * - chart -> table degradation (fallbackTable > chartPayload > svg note)
 * - table cell escaping (pipes, newlines)
 * - section rendering (findings, disagreements, evidence)
 * - KPI highlights
 * - appendix catalog and excluded evidence
 * - maxTableRows cap on synthesised tables
 */

import { describe, it, expect } from 'vitest';
import type {
    ReportIr,
    ReportChartPayload,
    ReportDataQualitySummary,
    ReportFallbackTable,
    ReportVisual,
} from '../types';
import {
    renderMarkdownReport,
    renderChartPayloadAsTable,
} from '../services/reporting/renderMarkdownReport';

// ---------------------------------------------------------------------------
// Simple YAML front matter parser (validates without needing gray-matter dep)
// ---------------------------------------------------------------------------
const parseYamlFrontMatter = (markdown: string): Record<string, string> | null => {
    const lines = markdown.split('\n');
    if (lines[0] !== '---') return null;
    const closeIdx = lines.indexOf('---', 1);
    if (closeIdx < 0) return null;
    const result: Record<string, string> = {};
    for (let i = 1; i < closeIdx; i++) {
        const colon = lines[i].indexOf(':');
        if (colon < 0) continue;
        const key = lines[i].slice(0, colon).trim();
        const raw = lines[i].slice(colon + 1).trim();
        // Strip surrounding quotes
        result[key] = raw.replace(/^["']|["']$/g, '');
    }
    return result;
};

// ---------------------------------------------------------------------------
// Shared minimal IR fixture helpers
// ---------------------------------------------------------------------------

const makeMinimalIr = (): ReportIr => ({
    version: 'report_ir_v1',
    reportId: 'test-report-001',
    generatedAt: '2026-03-18T08:00:00Z',
    dataset: {
        title: 'Test Report',
        datasetName: 'sales_data.csv',
        readiness: 'ready',
        readinessReason: 'All checks passed.',
        generationGate: 'allowed',
        generationBlockers: [],
        workflowStatus: 'complete',
        shapeSummary: '1000 rows x 5 columns',
        readinessDrivers: [],
        readinessRisks: [],
        structuralSignals: {
            rowExpansionRatio: null,
            hasMetadataRows: false,
            hasMultiRowHeader: false,
            usedFallbackContext: false,
        },
        caveats: [],
        trustedCardsCount: 3,
        excludedEvidenceCount: 0,
    },
    summary: {
        title: 'Sales Analysis Report',
        executiveSummary: 'Revenue grew 15% year-over-year.',
        executivePosition: 'Strong performance across all regions.',
        topImplication: 'North region leads growth.',
        mainCaution: 'Q4 data still pending.',
        overallConfidence: 'high',
        managementHighlights: ['Record Q3 revenue', 'Cost efficiency improved'],
        recommendedActions: ['Expand North region headcount', 'Review Q4 forecast'],
    },
    contents: [],
    kpiHighlights: [],
    reportVisuals: [],
    sections: [],
    appendix: {
        title: 'Appendix',
        evidenceCatalog: [],
        excludedEvidence: [],
    },
});

const makeChartPayload = (overrides: Partial<ReportChartPayload> = {}): ReportChartPayload => ({
    chartType: 'bar',
    title: 'Regional Sales',
    groupByColumn: 'Region',
    valueColumn: 'Revenue',
    rows: [],
    sortedRows: [],
    labels: ['North', 'South', 'East'],
    displayLabels: ['North', 'South', 'East'],
    numericValues: [5000, 3000, 2000],
    formattedValues: ['5,000', '3,000', '2,000'],
    chartNarrative: 'North leads.',
    valueDomain: 'positive',
    aggregationApplied: false,
    aggregatedOtherValue: null,
    chartWarnings: [],
    ...overrides,
});

const makeVisual = (overrides: Partial<ReportVisual> = {}): ReportVisual => ({
    cardId: 'card-1',
    title: 'Regional Performance',
    businessTitle: 'Regional Revenue Breakdown',
    topicKey: 'regional_revenue',
    chartType: 'bar',
    chartPayload: makeChartPayload(),
    svgMarkup: null,
    fallbackTable: null,
    whatItShows: 'Revenue by region.',
    whyItMatters: 'Identifies growth leaders.',
    caveat: null,
    calloutValue: null,
    chartWarnings: [],
    ...overrides,
});

// ---------------------------------------------------------------------------
// renderChartPayloadAsTable
// ---------------------------------------------------------------------------

describe('renderChartPayloadAsTable', () => {
    it('renders a two-column GFM table from displayLabels + formattedValues', () => {
        const payload = makeChartPayload();
        const table = renderChartPayloadAsTable(payload);

        expect(table).toContain('| Region | Revenue |');
        expect(table).toContain('| --- | --- |');
        expect(table).toContain('| North | 5,000 |');
        expect(table).toContain('| South | 3,000 |');
        expect(table).toContain('| East | 2,000 |');
    });

    it('uses Category/Value as fallback headers when groupByColumn/valueColumn are null', () => {
        const payload = makeChartPayload({ groupByColumn: null, valueColumn: null });
        const table = renderChartPayloadAsTable(payload);
        expect(table).toContain('| Category | Value |');
    });

    it('respects maxRows and appends overflow indicator', () => {
        const payload = makeChartPayload({
            displayLabels: Array.from({ length: 15 }, (_, i) => 'Item ' + (i + 1)),
            formattedValues: Array.from({ length: 15 }, (_, i) => String((i + 1) * 100)),
            numericValues: Array.from({ length: 15 }, (_, i) => (i + 1) * 100),
        });
        const table = renderChartPayloadAsTable(payload, 5);

        expect(table).toContain('Item 5');
        expect(table).not.toContain('Item 6');
        expect(table).toContain('10 more rows');
    });

    it('returns empty string when displayLabels is empty', () => {
        const payload = makeChartPayload({ displayLabels: [], formattedValues: [], numericValues: [] });
        expect(renderChartPayloadAsTable(payload)).toBe('');
    });

    it('escapes pipe characters in cell values', () => {
        const payload = makeChartPayload({
            displayLabels: ['A|B'],
            formattedValues: ['1,000'],
            numericValues: [1000],
        });
        const table = renderChartPayloadAsTable(payload);
        expect(table).toContain('A\\|B');
    });
});

// ---------------------------------------------------------------------------
// renderMarkdownReport - title and metadata
// ---------------------------------------------------------------------------

describe('renderMarkdownReport', () => {
    it('renders the report title from summary.title', () => {
        const md = renderMarkdownReport(makeMinimalIr());
        expect(md).toContain('# Sales Analysis Report');
    });

    it('includes generatedAt and reportId in metadata line', () => {
        const md = renderMarkdownReport(makeMinimalIr());
        expect(md).toContain('2026-03-18T08:00:00Z');
        expect(md).toContain('test-report-001');
    });

    it('renders dataset readiness labels correctly', () => {
        const ready = renderMarkdownReport(makeMinimalIr());
        expect(ready).toContain('Ready');

        const partialIr = makeMinimalIr();
        partialIr.dataset.readiness = 'partial';
        expect(renderMarkdownReport(partialIr)).toContain('Partial');

        const blockedIr = makeMinimalIr();
        blockedIr.dataset.readiness = 'blocked';
        expect(renderMarkdownReport(blockedIr)).toContain('Blocked');
    });

    it('renders dataset name, workflow status, and shape summary', () => {
        const md = renderMarkdownReport(makeMinimalIr());
        expect(md).toContain('sales_data.csv');
        expect(md).toContain('complete');
        expect(md).toContain('1000 rows x 5 columns');
    });

    it('renders dataset caveats as a list when present', () => {
        const ir = makeMinimalIr();
        ir.dataset.caveats = ['Some rows excluded.', 'Data from Q1 only.'];
        const md = renderMarkdownReport(ir);
        expect(md).toContain('Some rows excluded.');
        expect(md).toContain('Data from Q1 only.');
    });

    it('renders executive summary, position, top implication, and main caution', () => {
        const md = renderMarkdownReport(makeMinimalIr());
        expect(md).toContain('Revenue grew 15% year-over-year.');
        expect(md).toContain('Strong performance across all regions.');
        expect(md).toContain('North region leads growth.');
        expect(md).toContain('Q4 data still pending.');
    });

    it('renders recommended actions as a list', () => {
        const md = renderMarkdownReport(makeMinimalIr());
        expect(md).toContain('Expand North region headcount');
        expect(md).toContain('Review Q4 forecast');
    });

    it('renders management highlights as a list', () => {
        const md = renderMarkdownReport(makeMinimalIr());
        expect(md).toContain('Record Q3 revenue');
        expect(md).toContain('Cost efficiency improved');
    });

    // KPI highlights

    it('renders KPI highlights as a 3-column GFM table', () => {
        const ir = makeMinimalIr();
        ir.kpiHighlights = [
            { label: 'Total Revenue', value: '$1.2M', supportingNote: 'Q3 record', tone: 'good' },
            { label: 'Gross Margin', value: '42%', supportingNote: 'Stable', tone: 'neutral' },
        ];
        const md = renderMarkdownReport(ir);
        expect(md).toContain('## KPI Snapshot');
        expect(md).toContain('| Metric | Value | Note |');
        expect(md).toContain('| Total Revenue | $1.2M | Q3 record |');
        expect(md).toContain('| Gross Margin | 42% | Stable |');
    });

    // Chart -> table degradation

    it('prefers fallbackTable over chartPayload when both are present', () => {
        const ir = makeMinimalIr();
        const fallback: ReportFallbackTable = {
            columns: ['Product', 'Units'],
            rows: [['Widget A', '500'], ['Widget B', '300']],
        };
        ir.reportVisuals = [makeVisual({ fallbackTable: fallback })];
        const md = renderMarkdownReport(ir);
        expect(md).toContain('| Product | Units |');
        expect(md).toContain('| Widget A | 500 |');
        // chartPayload Region column should NOT appear since fallback wins
        expect(md).not.toContain('| Region | Revenue |');
    });

    it('falls back to chartPayload table when no fallbackTable', () => {
        const ir = makeMinimalIr();
        ir.reportVisuals = [makeVisual({ fallbackTable: null })];
        const md = renderMarkdownReport(ir);
        expect(md).toContain('| Region | Revenue |');
        expect(md).toContain('| North | 5,000 |');
    });

    it('renders a note for svg-only visuals (no data table)', () => {
        const ir = makeMinimalIr();
        ir.reportVisuals = [makeVisual({
            fallbackTable: null,
            chartPayload: null,
            svgMarkup: '<svg/>',
        })];
        const md = renderMarkdownReport(ir);
        expect(md).toContain('HTML report');
        expect(md).not.toContain('| Region |');
    });

    it('renders placeholder when visual has no chart data at all', () => {
        const ir = makeMinimalIr();
        ir.reportVisuals = [makeVisual({
            fallbackTable: null,
            chartPayload: null,
            svgMarkup: null,
        })];
        const md = renderMarkdownReport(ir);
        expect(md).toContain('No data table available');
    });

    it('caps synthesised table rows at maxTableRows option', () => {
        const ir = makeMinimalIr();
        const payload = makeChartPayload({
            displayLabels: Array.from({ length: 25 }, (_, i) => 'Row ' + (i + 1)),
            formattedValues: Array.from({ length: 25 }, () => '100'),
            numericValues: Array.from({ length: 25 }, () => 100),
        });
        ir.reportVisuals = [makeVisual({ fallbackTable: null, chartPayload: payload })];
        const md = renderMarkdownReport(ir, { maxTableRows: 5 });
        expect(md).toContain('Row 5');
        expect(md).not.toContain('Row 6');
        expect(md).toContain('20 more rows');
    });

    it('renders visual caveat and chart warnings', () => {
        const ir = makeMinimalIr();
        ir.reportVisuals = [makeVisual({
            caveat: 'Only top 10 shown.',
            chartWarnings: ['Negative values truncated.'],
        })];
        const md = renderMarkdownReport(ir);
        expect(md).toContain('Only top 10 shown.');
        expect(md).toContain('Negative values truncated.');
    });

    it('renders businessTitle, calloutValue, whatItShows, whyItMatters', () => {
        const ir = makeMinimalIr();
        ir.reportVisuals = [makeVisual({
            businessTitle: 'Revenue by Region',
            calloutValue: '$5M Total',
            whatItShows: 'Shows regional split.',
            whyItMatters: 'North drives 50% of revenue.',
        })];
        const md = renderMarkdownReport(ir);
        expect(md).toContain('Revenue by Region');
        expect(md).toContain('$5M Total');
        expect(md).toContain('Shows regional split.');
        expect(md).toContain('North drives 50% of revenue.');
    });

    // Sections

    it('renders findings section with importance marks, caveats, and supported-by', () => {
        const ir = makeMinimalIr();
        ir.sections = [{
            type: 'findings',
            title: 'Key Findings',
            items: [
                {
                    id: 'f1',
                    claim: 'Revenue exceeded target by 15%.',
                    importance: 'high',
                    supportedByRoles: ['business', 'data_quality'],
                    caveats: ['Excludes one-off items.'],
                    evidenceRefs: [],
                },
                {
                    id: 'f2',
                    claim: 'Costs stable quarter-on-quarter.',
                    importance: 'low',
                    supportedByRoles: [],
                    caveats: [],
                    evidenceRefs: [],
                },
            ],
        }];
        const md = renderMarkdownReport(ir);
        expect(md).toContain('## Key Findings');
        expect(md).toContain('[HIGH]');
        expect(md).toContain('Revenue exceeded target by 15%.');
        expect(md).toContain('Excludes one-off items.');
        expect(md).toContain('Supported by: business, data_quality');
        expect(md).toContain('[LOW]');
        expect(md).toContain('Costs stable quarter-on-quarter.');
    });

    it('renders disagreements section with resolution and positions', () => {
        const ir = makeMinimalIr();
        ir.sections = [{
            type: 'disagreements',
            title: 'Open Questions',
            items: [{
                id: 'd1',
                topic: 'Q4 forecast accuracy',
                resolution: 'partially_resolved',
                positions: [
                    { role: 'business', stance: 'Optimistic on Q4.', evidenceRefs: [] },
                    { role: 'risk', stance: 'Cautious given macro.', evidenceRefs: [] },
                ],
            }],
        }];
        const md = renderMarkdownReport(ir);
        expect(md).toContain('## Open Questions');
        expect(md).toContain('Q4 forecast accuracy');
        expect(md).toContain('partially resolved');
        expect(md).toContain('business:');
        expect(md).toContain('Optimistic on Q4.');
        expect(md).toContain('risk:');
        expect(md).toContain('Cautious given macro.');
    });

    it('renders evidence section with card titles, artifact type, and whyItMatters', () => {
        const ir = makeMinimalIr();
        ir.sections = [{
            type: 'evidence',
            title: 'Supporting Evidence',
            cards: [
                { cardId: 'c1', title: 'Regional Breakdown', artifactType: 'chart', whyItMatters: 'Shows split.' },
                { cardId: 'c2', title: 'Monthly Trend', artifactType: null, whyItMatters: '' },
            ],
        }];
        const md = renderMarkdownReport(ir);
        expect(md).toContain('## Supporting Evidence');
        expect(md).toContain('**Regional Breakdown**');
        expect(md).toContain('*(chart)*');
        expect(md).toContain('Shows split.');
        expect(md).toContain('**Monthly Trend**');
    });

    // Appendix

    it('renders evidence catalog in appendix', () => {
        const ir = makeMinimalIr();
        ir.appendix = {
            title: 'Appendix',
            evidenceCatalog: [{
                id: 'ev-1',
                kind: 'card',
                label: 'Regional Sales Card',
                source: 'state',
                detail: 'Bar chart of sales by region.',
            }],
            excludedEvidence: [],
        };
        const md = renderMarkdownReport(ir);
        expect(md).toContain('## Appendix');
        expect(md).toContain('### Evidence Catalog');
        expect(md).toContain('[ev-1]');
        expect(md).toContain('Regional Sales Card');
        expect(md).toContain('*(card)*');
    });

    it('renders excluded evidence with reason codes in appendix', () => {
        const ir = makeMinimalIr();
        ir.appendix = {
            title: 'Appendix',
            evidenceCatalog: [],
            excludedEvidence: [{
                decision: 'excluded',
                evidenceId: 'ex-1',
                cardId: 'card-x',
                title: 'Low Confidence Card',
                displayTitle: 'Low Confidence Card',
                detail: 'Business confidence too low.',
                reasonCodes: ['low_business_confidence'],
            }],
        };
        const md = renderMarkdownReport(ir);
        expect(md).toContain('### Excluded Evidence');
        expect(md).toContain('Low Confidence Card');
        expect(md).toContain('*(low_business_confidence)*');
    });

    it('omits appendix when includeAppendix is false', () => {
        const ir = makeMinimalIr();
        ir.appendix = {
            title: 'Appendix',
            evidenceCatalog: [{ id: 'ev-1', kind: 'card', label: 'Card', source: 'state', detail: 'Detail.' }],
            excludedEvidence: [],
        };
        const md = renderMarkdownReport(ir, { includeAppendix: false });
        expect(md).not.toContain('Evidence Catalog');
    });

    // Escaping

    it('escapes pipe characters in data values to prevent GFM table breakage', () => {
        const ir = makeMinimalIr();
        const payload = makeChartPayload({
            displayLabels: ['A|B'],
            formattedValues: ['1,000'],
            numericValues: [1000],
        });
        ir.reportVisuals = [makeVisual({ fallbackTable: null, chartPayload: payload })];
        const md = renderMarkdownReport(ir);
        expect(md).toContain('A\\|B');
    });

    it('collapses newlines in inline text fields', () => {
        const ir = makeMinimalIr();
        ir.summary.executiveSummary = 'Line one.\nLine two.';
        const md = renderMarkdownReport(ir);
        expect(md).toContain('Line one. Line two.');
    });

    // ---------------------------------------------------------------------------
    // YAML front matter
    // ---------------------------------------------------------------------------

    describe('YAML front matter', () => {
        it('emits YAML front matter by default with required keys', () => {
            const md = renderMarkdownReport(makeMinimalIr());
            expect(md.startsWith('---')).toBe(true);

            const frontMatter = parseYamlFrontMatter(md);
            expect(frontMatter).not.toBeNull();
            expect(frontMatter!['title']).toBe('Sales Analysis Report');
            expect(frontMatter!['date']).toBe('2026-03-18T08:00:00Z');
            expect(frontMatter!['dataSource']).toBe('sales_data.csv');
            expect(frontMatter!['cardCount']).toBe('3');
            expect(frontMatter!['harnessPhasesCovered']).toBe('none');
        });

        it('front matter harnessPhasesCovered reflects dataQualitySummary phases', () => {
            const ir = makeMinimalIr();
            ir.dataQualitySummary = {
                harnessPhasesCovered: ['hierarchy', 'pareto', 'temporal'],
                hierarchyGroupCount: 2,
                duplicateLabelCount: 0,
                missingDataPatternCount: 1,
                paretoDetected: true,
                temporalProfileSummary: 'Monthly data with continuous dates',
            };

            const md = renderMarkdownReport(ir);
            const frontMatter = parseYamlFrontMatter(md);
            expect(frontMatter!['harnessPhasesCovered']).toBe('hierarchy, pareto, temporal');
        });

        it('omits front matter when includeFrontMatter is false', () => {
            const md = renderMarkdownReport(makeMinimalIr(), { includeFrontMatter: false });
            expect(md.startsWith('---')).toBe(false);
            expect(md.startsWith('#')).toBe(true);
        });

        it('front matter cardCount reflects trustedCardsCount from IR', () => {
            const ir = makeMinimalIr();
            ir.dataset.trustedCardsCount = 7;
            const md = renderMarkdownReport(ir);
            const frontMatter = parseYamlFrontMatter(md);
            expect(frontMatter!['cardCount']).toBe('7');
        });
    });

    // ---------------------------------------------------------------------------
    // Data Quality Summary section
    // ---------------------------------------------------------------------------

    describe('Data Quality Summary section', () => {
        const makeDataQuality = (overrides?: Partial<ReportDataQualitySummary>): ReportDataQualitySummary => ({
            harnessPhasesCovered: ['hierarchy', 'pareto', 'temporal'],
            hierarchyGroupCount: 3,
            duplicateLabelCount: 2,
            missingDataPatternCount: 4,
            paretoDetected: true,
            temporalProfileSummary: 'Continuous monthly data — line chart promoted',
            ...overrides,
        });

        it('renders Data Quality Summary section when dataQualitySummary is present', () => {
            const ir = makeMinimalIr();
            ir.dataQualitySummary = makeDataQuality();

            const md = renderMarkdownReport(ir);
            expect(md).toContain('## Data Quality Summary');
            expect(md).toContain('3 groups detected');
            expect(md).toContain('2 detected');
            expect(md).toContain('4 columns affected');
            expect(md).toContain('Pareto concentration');
            expect(md).toContain('Detected — top groups dominate value distribution');
            expect(md).toContain('Continuous monthly data — line chart promoted');
        });

        it('Data Quality Summary section is omitted when dataQualitySummary is absent', () => {
            const ir = makeMinimalIr();
            // No dataQualitySummary
            const md = renderMarkdownReport(ir);
            expect(md).not.toContain('## Data Quality Summary');
        });

        it('Data Quality Summary section is omitted when dataQualitySummary is null', () => {
            const ir = makeMinimalIr();
            ir.dataQualitySummary = null;
            const md = renderMarkdownReport(ir);
            expect(md).not.toContain('## Data Quality Summary');
        });

        it('reports "not detected" for Pareto when paretoDetected is false', () => {
            const ir = makeMinimalIr();
            ir.dataQualitySummary = makeDataQuality({ paretoDetected: false });
            const md = renderMarkdownReport(ir);
            expect(md).toContain('Not detected — distribution is relatively uniform');
        });

        it('reports "No temporal columns detected" when temporalProfileSummary is null', () => {
            const ir = makeMinimalIr();
            ir.dataQualitySummary = makeDataQuality({ temporalProfileSummary: null });
            const md = renderMarkdownReport(ir);
            expect(md).toContain('No temporal columns detected');
        });

        it('Data Quality Summary appears before the main content sections', () => {
            const ir = makeMinimalIr();
            ir.dataQualitySummary = makeDataQuality();
            ir.sections = [{
                type: 'findings',
                title: 'Key Findings',
                items: [{ id: 'f1', claim: 'Revenue up.', importance: 'high', supportedByRoles: [], caveats: [], evidenceRefs: [] }],
            }];
            const md = renderMarkdownReport(ir);
            const dqIdx = md.indexOf('## Data Quality Summary');
            const findingsIdx = md.indexOf('## Key Findings');
            expect(dqIdx).toBeGreaterThan(-1);
            expect(findingsIdx).toBeGreaterThan(-1);
            expect(dqIdx).toBeLessThan(findingsIdx);
        });
    });

    // ---------------------------------------------------------------------------
    // Chart type captions on visuals
    // ---------------------------------------------------------------------------

    describe('chart type captions', () => {
        it('renders chart type caption as blockquote on each visual', () => {
            const ir = makeMinimalIr();
            ir.reportVisuals = [makeVisual({
                chartType: 'bar',
                businessTitle: 'Revenue by Region',
            })];
            const md = renderMarkdownReport(ir);
            expect(md).toContain('> Chart: bar — Revenue by Region');
        });

        it('caption uses visual.title when businessTitle is empty', () => {
            const ir = makeMinimalIr();
            ir.reportVisuals = [makeVisual({
                chartType: 'line',
                businessTitle: '',
                title: 'Monthly Trend',
            })];
            const md = renderMarkdownReport(ir);
            expect(md).toContain('> Chart: line — Monthly Trend');
        });
    });
});
