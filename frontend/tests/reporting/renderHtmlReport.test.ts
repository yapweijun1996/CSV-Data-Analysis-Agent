// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { ReportIr } from '../../types';
import { renderHtmlReport } from '../../services/reporting/renderHtmlReport';

const createReportIr = (): ReportIr => ({
    version: 'report_ir_v1',
    reportId: 'report.session-1.dataset-1.20260314090000000',
    generatedAt: '2026-03-14T09:00:00.000Z',
    dataset: {
        title: 'Dataset Readiness',
        datasetName: 'Executive Revenue Report',
        readiness: 'ready',
        readinessReason: 'Ready for bounded analyst synthesis with no material structural or workflow caveats detected.',
        generationGate: 'allowed',
        generationBlockers: [],
        trustedCardsCount: 2,
        excludedEvidenceCount: 1,
        workflowStatus: 'prep=baseline_prepared | analysis=ready | intake=warning | cards=2',
        shapeSummary: '12 raw row(s) | 10 cleaned row(s) | 2 metadata row(s) | 1 summary row(s) | header depth 1',
        readinessDrivers: [
            'Trusted analysis cards exist (2).',
            'Parser confidence is high.',
        ],
        readinessRisks: [
            'Workflow warnings remain unresolved.',
        ],
        structuralSignals: {
            rowExpansionRatio: 0.8,
            hasMetadataRows: true,
            hasMultiRowHeader: false,
            usedFallbackContext: false,
        },
        caveats: ['Totals were reconstructed from metadata rows.', 'One helper column remains unverified.'],
    },
    summary: {
        title: 'Executive Summary',
        executiveSummary: 'The verified dataset supports a bounded report, but caveat-aware wording remains necessary.',
        executivePosition: 'The verified dataset supports a bounded report.',
        topImplication: 'East region concentration is the leading business signal.',
        mainCaution: 'Workflow warnings still require caveat-aware wording.',
        overallConfidence: 'medium',
        managementHighlights: [
            'East region concentration is the leading business signal.',
            'Workflow warnings still require caveat-aware wording.',
        ],
        recommendedActions: [
            'Draft the report with explicit caveat language.',
            'Review the fallback SQL precheck warning before export.',
        ],
    },
    contents: [
        { id: 'key-takeaways', label: 'Key Takeaways' },
        { id: 'kpi-strip', label: 'KPI Snapshot' },
        { id: 'key-findings', label: 'Key Findings' },
        { id: 'risks-caveats', label: 'Risks & Caveats' },
        { id: 'recommended-actions', label: 'Recommended Actions' },
        { id: 'appendix', label: 'Appendix' },
    ],
    kpiHighlights: [
        { label: 'Top visual value', value: '1,200', supportingNote: 'East region concentration is the leading business signal.', tone: 'good' },
        { label: 'Material caveats', value: '3', supportingNote: 'Caveats and readiness risks still active.', tone: 'warning' },
    ],
    reportVisuals: [
        {
            cardId: 'card-1',
            title: 'Revenue by Region',
            businessTitle: 'East region concentration is the leading business signal.',
            topicKey: 'revenue_concentration',
            chartType: 'bar',
            chartPayload: {
                chartType: 'bar',
                title: 'Revenue by Region',
                groupByColumn: 'Region',
                valueColumn: 'Revenue',
                rows: [{ Region: 'East', Revenue: 1200 }],
                sortedRows: [{ Region: 'East', Revenue: 1200 }],
                labels: ['East'],
                displayLabels: ['East'],
                numericValues: [1200],
                formattedValues: ['1,200'],
                chartNarrative: 'East region leads revenue.',
                valueDomain: 'positive',
                aggregationApplied: false,
                aggregatedOtherValue: null,
                chartWarnings: [],
            },
            svgMarkup: '<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>',
            fallbackTable: null,
            whatItShows: 'East region leads revenue.',
            whyItMatters: 'East region concentration is the leading business signal.',
            caveat: 'One helper column remains unverified.',
            calloutValue: '1,200',
            chartWarnings: [],
        },
    ],
    sections: [
        {
            type: 'findings',
            title: 'Key Findings',
            items: [
                {
                    id: 'forum-1',
                    claim: 'East region concentration is the leading business signal.',
                    importance: 'high',
                    supportedByRoles: ['business', 'risk'],
                    caveats: ['One helper column remains unverified.'],
                    evidenceRefs: ['card.card-1', 'summary.core'],
                },
            ],
        },
        {
            type: 'disagreements',
            title: 'Open Disagreements',
            items: [
                {
                    id: 'dis-1',
                    topic: 'How definitive the report can be',
                    resolution: 'partially_resolved',
                    positions: [
                        {
                            role: 'business',
                            stance: 'The trusted cards support an executive draft.',
                            evidenceRefs: ['card.card-1', 'summary.final'],
                        },
                        {
                            role: 'risk',
                            stance: 'Warnings still require caveat language.',
                            evidenceRefs: ['workflow.verification'],
                        },
                    ],
                },
            ],
        },
        {
            type: 'evidence',
            title: 'Evidence Appendix Highlights',
            cards: [
                {
                    cardId: 'card-1',
                    title: 'Revenue by Region',
                    artifactType: null,
                    whyItMatters: 'East region concentration is the leading business signal.',
                },
            ],
        },
    ],
    appendix: {
        title: 'Evidence Catalog',
        evidenceCatalog: [
            {
                id: 'dataset.context',
                kind: 'dataset',
                label: 'Dataset Context',
                source: 'derived',
                detail: 'Executive Revenue Report | 12 raw row(s) -> 10 cleaned row(s)',
            },
            {
                id: 'card.card-1',
                kind: 'card',
                label: 'Revenue by Region',
                source: 'state',
                detail: 'chart | 4 row(s)',
            },
        ],
        excludedEvidence: [
            {
                decision: 'excluded',
                evidenceId: 'card.card-2',
                cardId: 'card-2',
                title: 'Margin by Region',
                displayTitle: 'Margin by Region',
                detail: 'businessMeaningConfidence=0.61',
                reasonCodes: ['low_business_confidence'],
            },
        ],
    },
});

describe('renderHtmlReport', () => {
    it('renders a printform-compatible narrative report without the legacy preview/bootstrap path', () => {
        const html = renderHtmlReport(createReportIr());

        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('<html lang="en">');
        expect(html).toContain('<title>Executive Revenue Report Analyst Report</title>');
        expect(html).toContain('Analyst Report Viewer');
        expect(html).toContain('Export PDF');
        expect(html).toContain('class="paper_width printform"');
        expect(html).toContain('data-report-template="management_review"');
        expect(html).toContain('class="paper_width pheader report-shell-table"');
        expect(html).toContain('class="paper_width pdocinfo report-shell-table" id="report-contents"');
        expect(html).toContain('class="paper_width prowitem report-row report-shell-table" id="key-takeaways"');
        expect(html).toContain('class="paper_width prowitem report-row report-shell-table" id="kpi-strip"');
        expect(html).toContain('class="paper_width prowitem report-row report-shell-table" id="key-findings"');
        expect(html).toContain('class="paper_width prowitem report-row report-shell-table" id="key-findings"');
        expect(html).toContain('<colgroup>');
        expect(html).toContain('class="report-shell-col report-shell-col--gutter"');
        expect(html).toContain('class="paper_width pfooter_pagenum report-shell-table"');
        expect(html).toContain('class="report-shell-gutter"');
        expect(html).toContain('PrintForm.formatAll({ force: true })');
        expect(html).toContain('window.location.hash === \"#print\"');
        expect(html).toContain('data-repeat-docinfo002="n"');
        expect(html).toContain('data-repeat-rowheader="n"');
        expect(html).toContain('data-insert-dummy-row-while-format-table="n"');
        expect(html).toContain('data-insert-footer-spacer-while-format-table="n"');
        expect(html).not.toContain('data-report-preview');
        expect(html).not.toContain('data-report-source');
        expect(html).not.toContain('renderPaginatedPreview');
        expect(html).not.toContain('class="paper_width pdocinfo002"');
        expect(html).not.toContain('class="paper_width pdocinfo003"');
        expect(html).toContain('Top excluded item');
        expect(html).not.toContain('Dataset Context');
        expect(html).not.toContain('Decision Guardrails:</strong>');
        expect(html).not.toContain('class="paper_width ptac narrative-flow report-shell-table" id="key-takeaways"');
        expect(html).not.toContain('class="paper_width ptac narrative-flow report-shell-table" id="risks-caveats"');
        expect(html).not.toContain('class="paper_width ptac narrative-flow report-shell-table" id="recommended-actions"');
        expect(html).not.toContain('class="paper_width report-row report-row--chart report-shell-table"');
        expect(html).toMatch(/<div class="eyebrow">Visuals<\/div>\s*<div class="hero-stat-value">1<\/div>/);
    });

    it('keeps short reports compact instead of overloading ptac sections', () => {
        const ir = createReportIr();
        ir.dataset.readinessDrivers = [];
        ir.dataset.readinessRisks = [];
        ir.dataset.caveats = [];
        ir.summary.managementHighlights = [];
        ir.summary.recommendedActions = [];
        ir.sections = [];
        ir.appendix.evidenceCatalog = [];
        ir.appendix.excludedEvidence = [];

        const html = renderHtmlReport(ir);
        expect(html).toContain('id="key-takeaways"');
        expect(html).not.toContain('id="traceability"');
        expect(html).toContain('class="paper_width prowitem report-row report-shell-table" id="kpi-strip"');
        expect(html).toContain('class="paper_width prowitem report-row report-shell-table" id="appendix"');
        expect(html).toContain('No evidence references were recorded.');
    });

    it('routes long appendix text into paddt output for the audit appendix template', () => {
        const ir = createReportIr();
        ir.appendix.evidenceCatalog[0].detail = 'Long detail '.repeat(40);
        ir.appendix.excludedEvidence[0].detail = 'Long excluded detail '.repeat(40);

        const html = renderHtmlReport(ir, { reportTemplate: 'audit_appendix' });

        expect(html).toContain('data-report-template="audit_appendix"');
        expect(html).toContain('class="paper_width paddt appendix-flow report-shell-table"');
        expect(html).toContain('Long detail Long detail');
        expect(html).toContain('Long excluded detail Long excluded detail');
    });

    it('renders a fuller audit appendix layout with traceability before findings', () => {
        const html = renderHtmlReport(createReportIr(), { reportTemplate: 'audit_appendix' });

        expect(html).toContain('data-repeat-rowheader="y"');
        expect(html).toContain('Preparation &amp; Verification');
        expect(html).toContain('Workflow status');
        expect(html).toContain('Dataset Context');
        expect(html).toContain('Margin by Region');
        expect(html.indexOf('id="traceability"')).toBeLessThan(html.indexOf('id="key-findings"'));
        expect(html.indexOf('id="open-disagreements"')).toBeLessThan(html.indexOf('id="appendix"'));
    });

    it('renders visual and non-visual findings together when both sources exist', () => {
        const ir = createReportIr();
        ir.sections = [
            ...ir.sections,
            {
                type: 'findings',
                title: 'Additional Findings',
                items: [
                    {
                        id: 'forum-2',
                        claim: 'Fallback recovery still needs analyst review.',
                        importance: 'medium',
                        supportedByRoles: ['risk'],
                        caveats: ['Workflow review remains manual.'],
                        evidenceRefs: ['workflow.verification'],
                    },
                ],
            },
        ];

        const html = renderHtmlReport(ir, { reportTemplate: 'audit_appendix' });

        expect(html).toContain('Revenue by Region');
        expect(html).toContain('Fallback recovery still needs analyst review.');
    });

    it('renders disagreement content as paragraphs instead of concatenated text', () => {
        const html = renderHtmlReport(createReportIr(), { reportTemplate: 'audit_appendix' });

        expect(html).toContain('<p>How definitive the report can be (Partially Resolved).</p>');
        expect(html).toContain('<strong>Business:</strong>');
        expect(html).not.toContain(').Business:');
    });

    it('keeps board-pack appendix compact and excludes full evidence catalog rows', () => {
        const html = renderHtmlReport(createReportIr(), { reportTemplate: 'executive_brief' });

        expect(html).toContain('data-repeat-rowheader="n"');
        expect(html).toContain('id="appendix"');
        expect(html).toContain('Top excluded item');
        expect(html).not.toContain('Dataset Context');
        expect(html).not.toContain('Margin by Region');
        expect(html).not.toContain('class="paper_width ptac narrative-flow report-shell-table" id="key-takeaways"');
        expect(html).not.toContain('class="paper_width report-row report-row--chart report-shell-table"');
    });

    it('dedupes business summary and finding content when visual and text claims overlap', () => {
        const ir = createReportIr();
        ir.summary.topImplication = 'The verified dataset supports a bounded report with strong revenue and profit alignment.';
        ir.summary.mainCaution = 'Workflow warnings still require caveat-aware wording.';

        const html = renderHtmlReport(ir);

        expect(html).not.toContain('<strong>Top Business Implication:</strong> The verified dataset supports a bounded report with strong revenue and profit alignment.');
        expect(html).toContain('<strong>Main Caution:</strong> Workflow warnings still require caveat-aware wording.');
        expect(html).not.toContain('Key Finding 2</h3>');
    });

    it('downgrades redundant KPI notes instead of repeating the finding sentence', () => {
        const html = renderHtmlReport(createReportIr());

        expect(html).toContain('Primary value highlighted by the selected visual.');
        expect(html).not.toContain('<p class="kpi-note">East region concentration is the leading business signal.</p>');
    });

    it('escapes HTML-sensitive content from the IR', () => {
        const ir = createReportIr();
        ir.dataset.datasetName = 'Revenue <Quarterly> & "Board"';
        ir.summary.executiveSummary = 'Unsafe <script>alert("x")</script> summary';
        ir.summary.executivePosition = 'Unsafe <script>alert("x")</script> summary';
        ir.summary.topImplication = 'Claim with <b>markup</b> & detail';
        ir.summary.mainCaution = 'Need <review> & approval';
        ir.reportVisuals = [];
        ir.sections = [
            {
                type: 'findings',
                title: 'Key Findings',
                items: [
                    {
                        id: 'unsafe-1',
                        claim: 'Claim with <b>markup</b> & detail',
                        importance: 'medium',
                        supportedByRoles: ['business'],
                        caveats: ['Need <review> & approval'],
                        evidenceRefs: ['summary.core'],
                    },
                ],
            },
        ];

        const html = renderHtmlReport(ir);

        expect(html).toContain('Revenue &lt;Quarterly&gt; &amp; &quot;Board&quot; Analyst Report');
        expect(html).toContain('Unsafe &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; summary');
        expect(html).toContain('Claim with &lt;b&gt;markup&lt;/b&gt; &amp; detail');
        expect(html).toContain('Need &lt;review&gt; &amp; approval');
        expect(html).not.toContain('<script>alert("x")</script>');
    });

    it('renders a fixed warning banner for partial artifacts', () => {
        const html = renderHtmlReport(createReportIr(), {
            language: 'English',
            manifest: {
                reportId: 'report.session-1.dataset-1.20260314090000000',
                title: 'Executive Revenue Report Analyst Report',
                generatedAt: '2026-03-14T09:00:00.000Z',
                artifactStatus: 'partial',
                generationGate: 'allowed_with_caveats',
                reportReadiness: 'partial',
                reportReadinessReason: 'Warnings still require caveat-aware wording.',
                trustedCardsCount: 2,
                excludedEvidenceCount: 1,
                gateReasons: [],
                llmUsed: true,
                fallbacksUsed: [],
                reportTemplate: 'management_review',
                latestFiles: {
                    html: '/workspace/reports/latest-analyst-report.html',
                    ir: '/workspace/reports/latest-analyst-report.ir.json',
                    memos: '/workspace/reports/latest-analyst-report.memos.json',
                    forum: '/workspace/reports/latest-analyst-report.forum.json',
                    bundle: '/workspace/reports/latest-analyst-report.bundle.json',
                    readiness: '/workspace/reports/latest-analyst-report.readiness.json',
                    manifest: '/workspace/reports/latest-analyst-report.manifest.json',
                },
                archiveFiles: {
                    html: '/workspace/reports/report.session-1.dataset-1.20260314090000000.html',
                    ir: '/workspace/reports/report.session-1.dataset-1.20260314090000000.ir.json',
                    memos: '/workspace/reports/report.session-1.dataset-1.20260314090000000.memos.json',
                    forum: '/workspace/reports/report.session-1.dataset-1.20260314090000000.forum.json',
                    bundle: '/workspace/reports/report.session-1.dataset-1.20260314090000000.bundle.json',
                    readiness: '/workspace/reports/report.session-1.dataset-1.20260314090000000.readiness.json',
                    manifest: '/workspace/reports/report.session-1.dataset-1.20260314090000000.manifest.json',
                },
            },
        });

        expect(html).toContain('This report is deliverable only with explicit caveats.');
        expect(html).toContain('Warnings still require caveat-aware wording.');
        expect(html).toContain('Excluded evidence: 1');
    });

    it('is deterministic for the same IR input', () => {
        const ir = createReportIr();

        const first = renderHtmlReport(ir);
        const second = renderHtmlReport(ir);

        expect(second).toBe(first);
    });
});
