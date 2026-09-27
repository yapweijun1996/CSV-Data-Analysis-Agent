/**
 * Markdown Report Renderer
 *
 * Renders a ReportIr into GitHub-Flavored Markdown (GFM).
 *
 * Design principles:
 * - Chart -> table degradation: when svgMarkup is absent, render fallbackTable
 *   as a GFM table; when fallbackTable is also absent, synthesise a minimal
 *   two-column table from chartPayload displayLabels + formattedValues.
 * - No external dependencies -- pure string concatenation.
 * - Sections follow the same structural order as renderHtmlReport.
 * - All user-data text is escaped to prevent accidental markdown injection.
 */

import type {
    ReportIr,
    ReportDataQualitySummary,
    ReportSection,
    ReportFindingSection,
    ReportDisagreementSection,
    ReportEvidenceSection,
    ReportKpiHighlight,
    ReportVisual,
    ReportChartPayload,
    ReportFallbackTable,
} from '../../types';

// ---------------------------------------------------------------------------
// Escaping helpers
// ---------------------------------------------------------------------------

/** Escape pipe and newline -- the two characters that break GFM table cells. */
const escapeCell = (value: unknown): string =>
    String(value ?? '')
        .replace(/\|/g, '\\|')
        .replace(/\n/g, ' ');

/** Collapse newlines to a single space for inline text. */
const escapeLine = (value: unknown): string =>
    String(value ?? '').replace(/\n+/g, ' ');

// ---------------------------------------------------------------------------
// YAML front matter
// ---------------------------------------------------------------------------

/**
 * Render YAML front matter block from ReportIr fields.
 * Produces a valid YAML block parseable by tools like gray-matter.
 */
const renderYamlFrontMatter = (ir: ReportIr): string => {
    const title = escapeLine(ir.summary.title);
    const date = escapeLine(ir.generatedAt);
    const dataSource = escapeLine(ir.dataset.datasetName ?? '');
    const cardCount = ir.dataset.trustedCardsCount;
    const phases = ir.dataQualitySummary?.harnessPhasesCovered ?? [];
    const harnessLine = phases.length > 0 ? phases.join(', ') : 'none';

    return [
        '---',
        `title: "${title}"`,
        `date: "${date}"`,
        `dataSource: "${dataSource}"`,
        `cardCount: ${cardCount}`,
        `harnessPhasesCovered: "${harnessLine}"`,
        '---',
    ].join('\n');
};

// ---------------------------------------------------------------------------
// Data Quality Summary section
// ---------------------------------------------------------------------------

const renderDataQualitySummary = (dq: ReportDataQualitySummary): string => {
    const lines: string[] = ['## Data Quality Summary'];

    lines.push(`- **Hierarchy detection:** ${dq.hierarchyGroupCount} group${dq.hierarchyGroupCount !== 1 ? 's' : ''} detected`);
    lines.push(`- **Duplicate labels:** ${dq.duplicateLabelCount} detected`);
    lines.push(`- **Missing data patterns:** ${dq.missingDataPatternCount} column${dq.missingDataPatternCount !== 1 ? 's' : ''} affected`);

    if (dq.paretoDetected) {
        lines.push('- **Pareto concentration:** Detected — top groups dominate value distribution');
    } else {
        lines.push('- **Pareto concentration:** Not detected — distribution is relatively uniform');
    }

    if (dq.temporalProfileSummary) {
        lines.push(`- **Temporal profile:** ${escapeLine(dq.temporalProfileSummary)}`);
    } else {
        lines.push('- **Temporal profile:** No temporal columns detected');
    }

    return lines.join('\n');
};

// ---------------------------------------------------------------------------
// GFM table helpers
// ---------------------------------------------------------------------------

const renderGfmTable = (columns: string[], rows: string[][]): string => {
    if (columns.length === 0 || rows.length === 0) return '';
    const header = '| ' + columns.map(escapeCell).join(' | ') + ' |';
    const divider = '| ' + columns.map(() => '---').join(' | ') + ' |';
    const body = rows.map(row => '| ' + row.map(escapeCell).join(' | ') + ' |').join('\n');
    return [header, divider, body].join('\n');
};

/** Render a pre-built ReportFallbackTable as a GFM table. */
const renderFallbackTable = (table: ReportFallbackTable): string =>
    renderGfmTable(table.columns, table.rows);

/**
 * Synthesise a two-column GFM table from a ReportChartPayload.
 * Uses displayLabels + formattedValues which are already ready for display.
 */
export const renderChartPayloadAsTable = (
    payload: ReportChartPayload,
    maxRows = 20,
): string => {
    const groupLabel = payload.groupByColumn ?? 'Category';
    const valueLabel = payload.valueColumn ?? 'Value';

    const count = Math.min(payload.displayLabels.length, maxRows);
    if (count === 0) return '';

    const rows: string[][] = [];
    for (let i = 0; i < count; i += 1) {
        rows.push([
            payload.displayLabels[i] ?? '',
            payload.formattedValues[i] ?? String(payload.numericValues[i] ?? ''),
        ]);
    }

    const overflow = payload.displayLabels.length - count;
    if (overflow > 0) {
        rows.push([`*... ${overflow} more rows*`, '']);
    }

    return renderGfmTable([groupLabel, valueLabel], rows);
};

// ---------------------------------------------------------------------------
// Visual block rendering (chart -> table degradation)
// ---------------------------------------------------------------------------

/**
 * Render a single ReportVisual as markdown.
 *
 * Degradation order:
 * 1. fallbackTable present -> render as GFM table.
 * 2. chartPayload present  -> synthesise 2-col table from displayLabels/formattedValues.
 * 3. svgMarkup present     -> note that SVG chart is in the HTML report.
 * 4. None of the above     -> emit placeholder.
 */
const renderVisual = (visual: ReportVisual, maxTableRows: number): string => {
    const lines: string[] = [];

    lines.push('### ' + escapeLine(visual.businessTitle || visual.title));

    // Chart type caption — provides context about the visualisation type in the markdown export.
    lines.push('\n> Chart: ' + escapeLine(visual.chartType) + ' — ' + escapeLine(visual.businessTitle || visual.title));

    if (visual.calloutValue) {
        lines.push('\n**' + escapeLine(visual.calloutValue) + '**');
    }
    if (visual.whatItShows) {
        lines.push('\n*' + escapeLine(visual.whatItShows) + '*');
    }
    if (visual.whyItMatters) {
        lines.push('\n' + escapeLine(visual.whyItMatters));
    }

    // Chart -> table degradation
    if (visual.fallbackTable && visual.fallbackTable.columns.length > 0) {
        const capped: ReportFallbackTable = {
            ...visual.fallbackTable,
            rows: visual.fallbackTable.rows.slice(0, maxTableRows),
        };
        lines.push('\n' + renderFallbackTable(capped));
    } else if (visual.chartPayload && visual.chartPayload.displayLabels.length > 0) {
        lines.push('\n' + renderChartPayloadAsTable(visual.chartPayload, maxTableRows));
    } else if (visual.svgMarkup) {
        lines.push('\n> Chart available in HTML report -- no data table attached.');
    } else {
        lines.push('\n> *No data table available for this visual.*');
    }

    if (visual.caveat) {
        lines.push('\n> Warning: ' + escapeLine(visual.caveat));
    }
    for (const warning of visual.chartWarnings) {
        lines.push('> Warning: ' + escapeLine(warning));
    }

    return lines.join('\n');
};

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

const IMPORTANCE_MARK: Record<string, string> = {
    high: '[HIGH]',
    medium: '[MED]',
    low: '[LOW]',
};

const renderFindingSection = (section: ReportFindingSection): string => {
    const lines: string[] = ['## ' + escapeLine(section.title)];
    for (const item of section.items) {
        const mark = IMPORTANCE_MARK[item.importance] ?? '-';
        lines.push('\n### ' + mark + ' ' + escapeLine(item.claim));
        for (const caveat of item.caveats) {
            lines.push('> Caveat: ' + escapeLine(caveat));
        }
        if (item.supportedByRoles.length > 0) {
            lines.push('*Supported by: ' + item.supportedByRoles.join(', ') + '*');
        }
    }
    return lines.join('\n');
};

const renderDisagreementSection = (section: ReportDisagreementSection): string => {
    const lines: string[] = ['## ' + escapeLine(section.title)];
    for (const item of section.items) {
        lines.push('\n### ' + escapeLine(item.topic));
        lines.push('*Resolution: ' + item.resolution.replace(/_/g, ' ') + '*');
        for (const position of item.positions) {
            lines.push('\n**' + position.role.replace(/_/g, ' ') + ':** ' + escapeLine(position.stance));
        }
    }
    return lines.join('\n');
};

const renderEvidenceSection = (section: ReportEvidenceSection): string => {
    const lines: string[] = ['## ' + escapeLine(section.title)];
    for (const card of section.cards) {
        const typeTag = card.artifactType ? ' *(' + card.artifactType + ')*' : '';
        lines.push('\n- **' + escapeLine(card.title) + '**' + typeTag);
        if (card.whyItMatters) {
            lines.push('  ' + escapeLine(card.whyItMatters));
        }
    }
    return lines.join('\n');
};

const renderSection = (section: ReportSection): string => {
    switch (section.type) {
        case 'findings': return renderFindingSection(section);
        case 'disagreements': return renderDisagreementSection(section);
        case 'evidence': return renderEvidenceSection(section);
    }
};

// ---------------------------------------------------------------------------
// KPI highlights
// ---------------------------------------------------------------------------

const renderKpiHighlights = (highlights: ReportKpiHighlight[]): string => {
    if (highlights.length === 0) return '';
    const rows = highlights.map(h => [h.label, h.value, h.supportingNote]);
    return renderGfmTable(['Metric', 'Value', 'Note'], rows);
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RenderMarkdownReportOptions {
    /** Include an appendix with the evidence catalog. Default: true. */
    includeAppendix?: boolean;
    /** Max rows shown in synthesised data tables. Default: 20. */
    maxTableRows?: number;
    /**
     * Emit YAML front matter block at the top of the document. Default: true.
     * Front matter includes title, date, dataSource, cardCount, harnessPhasesCovered.
     * The output is valid YAML parseable by tools like gray-matter.
     */
    includeFrontMatter?: boolean;
}

/**
 * Render a ReportIr to GitHub-Flavored Markdown.
 *
 * Chart -> table degradation rules (applied per ReportVisual):
 * 1. fallbackTable present -> render as GFM table.
 * 2. chartPayload present  -> synthesise 2-col table from displayLabels + formattedValues.
 * 3. svgMarkup present     -> note that the chart exists only in the HTML report.
 * 4. None                  -> render placeholder note.
 *
 * @param ir - Report intermediate representation built by buildReportIr.
 * @param options - Optional rendering options.
 * @returns A GFM markdown string ready to save or display.
 */
export const renderMarkdownReport = (
    ir: ReportIr,
    options: RenderMarkdownReportOptions = {},
): string => {
    const { includeAppendix = true, maxTableRows = 20, includeFrontMatter = true } = options;
    const parts: string[] = [];

    // YAML front matter — parseable by tools like gray-matter
    if (includeFrontMatter) {
        parts.push(renderYamlFrontMatter(ir));
        parts.push('');
    }

    // Title and metadata
    parts.push('# ' + escapeLine(ir.summary.title));
    parts.push('\n*Generated: ' + escapeLine(ir.generatedAt) + ' | Report ID: ' + escapeLine(ir.reportId) + '*');

    // Dataset section
    const ds = ir.dataset;
    const readinessBadge =
        ds.readiness === 'ready' ? 'Ready' :
        ds.readiness === 'partial' ? 'Partial' : 'Blocked';

    parts.push('\n## Dataset: ' + escapeLine(ds.datasetName ?? ds.title));
    parts.push('**Readiness:** ' + readinessBadge + '  ');
    parts.push('**Workflow:** ' + escapeLine(ds.workflowStatus) + '  ');
    parts.push('**Shape:** ' + escapeLine(ds.shapeSummary));

    if (ds.caveats.length > 0) {
        parts.push('\n### Caveats');
        for (const caveat of ds.caveats) {
            parts.push('- ' + escapeLine(caveat));
        }
    }

    // Management summary
    const sm = ir.summary;
    parts.push('\n## Management Summary');
    parts.push(escapeLine(sm.executiveSummary));

    if (sm.executivePosition) {
        parts.push('\n**Overall position:** ' + escapeLine(sm.executivePosition));
    }
    if (sm.topImplication) {
        parts.push('\n**Top implication:** ' + escapeLine(sm.topImplication));
    }
    if (sm.mainCaution) {
        parts.push('\n**Main caution:** ' + escapeLine(sm.mainCaution));
    }

    if (sm.recommendedActions.length > 0) {
        parts.push('\n### Recommended Actions');
        for (const action of sm.recommendedActions) {
            parts.push('- ' + escapeLine(action));
        }
    }
    if (sm.managementHighlights.length > 0) {
        parts.push('\n### Key Highlights');
        for (const h of sm.managementHighlights) {
            parts.push('- ' + escapeLine(h));
        }
    }

    // KPI snapshot
    if (ir.kpiHighlights.length > 0) {
        parts.push('\n## KPI Snapshot');
        parts.push(renderKpiHighlights(ir.kpiHighlights));
    }

    // Visuals with chart -> table degradation
    if (ir.reportVisuals.length > 0) {
        parts.push('\n## Decision Evidence');
        for (const visual of ir.reportVisuals) {
            parts.push('\n' + renderVisual(visual, maxTableRows));
        }
    }

    // Data Quality Summary — rendered before findings when harness findings are available
    if (ir.dataQualitySummary) {
        parts.push('\n' + renderDataQualitySummary(ir.dataQualitySummary));
    }

    // Main content sections
    for (const section of ir.sections) {
        parts.push('\n' + renderSection(section));
    }

    // Appendix
    if (includeAppendix && ir.appendix) {
        const appendix = ir.appendix;
        parts.push('\n## ' + escapeLine(appendix.title));

        if (appendix.evidenceCatalog.length > 0) {
            parts.push('\n### Evidence Catalog');
            for (const ref of appendix.evidenceCatalog) {
                parts.push('- **[' + ref.id + ']** ' + escapeLine(ref.label) + ' *(' + ref.kind + ')*: ' + escapeLine(ref.detail));
            }
        }

        if (appendix.excludedEvidence.length > 0) {
            parts.push('\n### Excluded Evidence');
            for (const ex of appendix.excludedEvidence) {
                const reasons = ex.reasonCodes.join(', ');
                parts.push('- ' + escapeLine(ex.title) + ': ' + escapeLine(ex.detail) + (reasons ? ' *(' + reasons + ')*' : ''));
            }
        }
    }

    return parts.join('\n');
};

/**
 * Export markdown report as a downloadable file (browser environment only).
 *
 * @param markdown - Rendered markdown string.
 * @param filename - Download filename. Default: 'report.md'.
 */
export const downloadMarkdownReport = (markdown: string, filename = 'report.md'): void => {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
