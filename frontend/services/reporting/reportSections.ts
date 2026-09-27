import type {
    ReportEvidenceRef,
    ReportFindingSection,
    ReportIr,
    ReportSection,
    ReportVisual,
    Settings,
} from '../../types';
import { escapeHtml, titleCase, isLongText, chunk } from './htmlUtils';
import type { ShellText } from './reportLocalization';
import { humanizeReasonCode } from './reportLocalization';
import {
    renderBadge,
    renderPaddtSection,
    renderParagraphBlock,
    renderProwHeader,
    renderProwItem,
    renderPtacSection,
    renderCompactNarrativeSection,
    renderTextParagraph,
} from './htmlRenderers';
import {
    renderManagementFindingSentence,
    resolveBusinessKpiNote,
    renderVisualFindingRows,
    renderBusinessVisualFindingRows,
    renderBusinessTextFindingRows,
    renderTextFindingRows,
} from './reportFindingRenderers';

export { renderManagementFindingSentence, resolveBusinessKpiNote } from './reportFindingRenderers';

export const renderFindingRows = (
    reportVisuals: ReportVisual[],
    text: ShellText,
    findingSections: ReportFindingSection[],
    options?: { reportTemplate?: Settings['reportTemplate']; maxItems?: number },
): string => {
    const reportTemplate = options?.reportTemplate ?? 'management_review';
    if (reportTemplate === 'executive_brief' || reportTemplate === 'management_review') {
        const businessRows = [
            ...renderBusinessVisualFindingRows(reportVisuals, text),
            ...renderBusinessTextFindingRows(text, findingSections, reportVisuals.length > 0, reportVisuals.length),
        ];
        return (typeof options?.maxItems === 'number' ? businessRows.slice(0, options.maxItems) : businessRows).join('');
    }

    const rows = [
        ...renderVisualFindingRows(reportVisuals, text, reportTemplate),
        ...renderTextFindingRows(text, findingSections, reportTemplate),
    ];

    return (typeof options?.maxItems === 'number' ? rows.slice(0, options.maxItems) : rows).join('');
};

export const renderKpiGridContent = (
    kpiHighlights: ReportIr['kpiHighlights'],
    options?: { text?: ShellText; businessContext?: string[] },
): string => {
    if (kpiHighlights.length === 0) {
        return '<p class="empty-state">No KPI highlights were recorded.</p>';
    }

    return chunk(kpiHighlights, 3).map(group => `
      <div class="kpi-grid">
        ${group.map(item => `
        <article class="kpi-card">
          <div class="kpi-label">${escapeHtml(item.label)}</div>
          <div class="kpi-value kpi-value-${item.tone ?? 'neutral'}">${escapeHtml(item.value)}</div>
          <p class="kpi-note">${escapeHtml(options?.text && options.businessContext
              ? resolveBusinessKpiNote(item, options.text, options.businessContext)
              : item.supportingNote)}</p>
        </article>
        `).join('')}
      </div>
    `).join('');
};

export const renderDisagreementPtac = (
    section: Extract<ReportSection, { type: 'disagreements' }>,
    text: ShellText,
    options?: { id?: string },
): string => renderPtacSection(
    section.title,
    text.openQuestions,
    section.items.flatMap(item => [
        renderTextParagraph(`${item.topic} (${titleCase(item.resolution)}).`),
        ...item.positions.map(position => renderParagraphBlock(
            titleCase(position.role),
            `${position.stance}${position.evidenceRefs.length > 0 ? ` Evidence: ${position.evidenceRefs.join(', ')}` : ''}`,
        )),
    ]),
    options,
);

export const renderEvidenceHighlightRows = (
    section: Extract<ReportSection, { type: 'evidence' }>,
    text: ShellText,
): { rows: string; longForm: string[] } => {
    const longForm: string[] = [];

    const rows = section.cards.filter(card => {
        const long = isLongText(card.whyItMatters, 180);
        if (long) {
            longForm.push(`${card.title} (${card.cardId}): ${card.whyItMatters}`);
        }
        return !long;
    }).map(card => renderProwItem(`
      <article class="supporting-card compact-card">
        <div class="card-header">
          <h3>${escapeHtml(card.title)}</h3>
          ${renderBadge(card.artifactType ? titleCase(card.artifactType) : text.chart, 'neutral')}
        </div>
        <p class="meta-line"><strong>Card ID:</strong> <code>${escapeHtml(card.cardId)}</code></p>
        <p>${escapeHtml(card.whyItMatters)}</p>
      </article>
    `, { suppressRowHeader: true })).join('');

    return { rows, longForm };
};

export const splitEvidenceCatalog = (entries: ReportEvidenceRef[]): { shortRows: string[]; longParagraphs: string[] } => {
    const shortRows: string[] = [];
    const longParagraphs: string[] = [];

    entries.forEach(entry => {
        const detail = `${entry.label} (${entry.id}) - ${titleCase(entry.source)}: ${entry.detail}`;
        if (isLongText(entry.detail, 180)) {
            longParagraphs.push(detail);
            return;
        }

        shortRows.push(`
          <article class="supporting-card compact-card">
            <div class="card-header">
              <h3>${escapeHtml(entry.label)}</h3>
              ${renderBadge(titleCase(entry.kind), 'neutral')}
            </div>
            <p class="meta-line"><strong>ID:</strong> <code>${escapeHtml(entry.id)}</code></p>
            <p class="meta-line"><strong>Source:</strong> ${escapeHtml(titleCase(entry.source))}</p>
            <p>${escapeHtml(entry.detail)}</p>
          </article>
        `);
    });

    return { shortRows, longParagraphs };
};

export const renderAppendix = (ir: ReportIr, text: ShellText): { rows: string; longForm: string } => {
    const { shortRows, longParagraphs } = splitEvidenceCatalog(ir.appendix.evidenceCatalog);
    const excludedLongForm: string[] = [];

    const excludedRows = ir.appendix.excludedEvidence.filter(item => {
        const detail = `${item.displayTitle} (${item.cardId}) - ${item.detail}`;
        if (isLongText(item.detail, 180)) {
            excludedLongForm.push(`${detail}. Reasons: ${item.reasonCodes.map(humanizeReasonCode).join(', ')}`);
            return false;
        }
        return true;
    }).map(item => renderProwItem(`
      <article class="supporting-card compact-card">
        <div class="card-header">
          <h3>${escapeHtml(item.displayTitle)}</h3>
          ${renderBadge(titleCase(item.decision), 'warning')}
        </div>
        <p class="meta-line"><strong>Card ID:</strong> <code>${escapeHtml(item.cardId)}</code></p>
        <p class="meta-line"><strong>Reasons:</strong> ${escapeHtml(item.reasonCodes.map(humanizeReasonCode).join(', '))}</p>
        <p>${escapeHtml(item.detail)}</p>
      </article>
    `, { suppressRowHeader: true })).join('');

    const evidenceRows = shortRows.length > 0
        ? shortRows.map(row => renderProwItem(row, { suppressRowHeader: true })).join('')
        : renderProwItem('<p class="empty-state">No evidence references were recorded.</p>', { suppressRowHeader: true });

    const rows = [
        renderProwHeader(text.traceability, ir.appendix.title, 'appendix'),
        evidenceRows,
        ir.appendix.excludedEvidence.length > 0 ? renderProwHeader(text.excludedEvidence, text.excludedEvidence) : '',
        excludedRows,
    ].join('');

    const longFormParagraphs = [...longParagraphs, ...excludedLongForm];

    return {
        rows,
        longForm: renderPaddtSection(text.evidenceCatalog, text.appendixHighlights, longFormParagraphs),
    };
};

export const buildSummarySection = (
    ir: ReportIr,
    text: ShellText,
    summaryParagraphs: string[],
    options?: { compact?: boolean },
): string => options?.compact
    ? renderCompactNarrativeSection(ir.summary.title, text.managementSummary, summaryParagraphs, { id: 'key-takeaways' })
    : renderPtacSection(ir.summary.title, text.managementSummary, summaryParagraphs, { id: 'key-takeaways' });

export const buildKpiSection = (
    text: ShellText,
    kpiHighlights: ReportIr['kpiHighlights'],
    options?: { compactIntro?: boolean; businessContext?: string[] },
): string => options?.compactIntro
    ? renderProwItem(`
      <article class="supporting-card compact-card section-intro-card">
        <p class="eyebrow">${escapeHtml(text.boardSnapshot)}</p>
        <h2>${escapeHtml(text.kpiSnapshot)}</h2>
        ${renderKpiGridContent(kpiHighlights, { text, businessContext: options.businessContext })}
      </article>
    `, { id: 'kpi-strip' })
    : [
        renderProwHeader(text.boardSnapshot, text.kpiSnapshot, 'kpi-strip'),
        renderProwItem(renderKpiGridContent(kpiHighlights), { suppressRowHeader: true }),
    ].join('');

export const buildFindingsSection = (
    text: ShellText,
    findingsMarkup: string,
    options?: { compactIntro?: boolean },
): string => findingsMarkup
    ? [
        ...(options?.compactIntro ? [] : [renderProwHeader(text.decisionEvidence, text.keyFindings, 'key-findings')]),
        findingsMarkup,
    ].join('')
    : renderProwItem(`
      <article class="supporting-card compact-card section-intro-card">
        <p class="eyebrow">${escapeHtml(text.decisionEvidence)}</p>
        <h2>${escapeHtml(text.keyFindings)}</h2>
        <p class="empty-state">${escapeHtml(text.emptyFindings)}</p>
      </article>
    `, { id: 'key-findings' });

export const buildRisksSection = (
    text: ShellText,
    paragraphs: string[],
    options?: { compact?: boolean },
): string => {
    const rendered = options?.compact
        ? renderCompactNarrativeSection(text.decisionGuardrails, text.decisionGuardrails, paragraphs, { id: 'risks-caveats' })
        : renderPtacSection(text.decisionGuardrails, text.decisionGuardrails, paragraphs, { id: 'risks-caveats' });
    return rendered || renderProwItem(`
      <article class="supporting-card compact-card section-intro-card">
        <p class="eyebrow">${escapeHtml(text.decisionGuardrails)}</p>
        <h2>${escapeHtml(text.decisionGuardrails)}</h2>
        <p class="empty-state">${escapeHtml(text.emptyRisks)}</p>
      </article>
    `, { id: 'risks-caveats' });
};

export const buildActionsSection = (
    text: ShellText,
    paragraphs: string[],
    options?: { compact?: boolean },
): string => {
    const rendered = options?.compact
        ? renderCompactNarrativeSection(text.recommendedActions, text.whatToDoNext, paragraphs, { id: 'recommended-actions' })
        : renderPtacSection(text.recommendedActions, text.whatToDoNext, paragraphs, { id: 'recommended-actions' });
    return rendered || renderProwItem(`
      <article class="supporting-card compact-card section-intro-card">
        <p class="eyebrow">${escapeHtml(text.recommendedActions)}</p>
        <h2>${escapeHtml(text.whatToDoNext)}</h2>
        <p class="empty-state">${escapeHtml(text.emptyActions)}</p>
      </article>
    `, { id: 'recommended-actions' });
};

export const buildTraceabilitySection = (
    text: ShellText,
    paragraphs: string[],
): string => renderPtacSection(text.preparationVerification, text.traceability, paragraphs, { id: 'traceability' });

export const buildCompactAppendixSection = (
    text: ShellText,
    ir: ReportIr,
): string => {
    if (ir.appendix.evidenceCatalog.length === 0 && ir.appendix.excludedEvidence.length === 0) {
        return renderProwItem(`
          <article class="supporting-card compact-card section-intro-card">
            <p class="eyebrow">${escapeHtml(text.traceability)}</p>
            <h2>${escapeHtml(text.appendixHighlights)}</h2>
            <p class="empty-state">No evidence references were recorded.</p>
          </article>
        `, { id: 'appendix' });
    }

    const topExcludedItem = ir.appendix.excludedEvidence[0];
    const topExcludedSummary = topExcludedItem
        ? topExcludedItem.reasonCodes.map(humanizeReasonCode).join(', ')
        : '';

    return renderProwItem(`
      <article class="supporting-card compact-card section-intro-card">
        <div class="card-header">
          <div>
            <p class="eyebrow">${escapeHtml(text.traceability)}</p>
            <h2>${escapeHtml(text.appendixHighlights)}</h2>
          </div>
          ${renderBadge(text.traceability, 'neutral')}
        </div>
        <p>${escapeHtml(`${ir.appendix.evidenceCatalog.length} evidence reference(s) and ${ir.appendix.excludedEvidence.length} excluded item(s) remain available in the audit appendix layout.`)}</p>
        <p class="meta-line"><strong>${escapeHtml(text.evidenceReferences)}:</strong> ${escapeHtml(String(ir.appendix.evidenceCatalog.length))}</p>
        <p class="meta-line"><strong>${escapeHtml(text.excludedCount)}:</strong> ${escapeHtml(String(ir.appendix.excludedEvidence.length))}</p>
        ${topExcludedSummary
            ? `<p class="meta-line"><strong>${escapeHtml(text.topExcludedItem)}:</strong> ${escapeHtml(topExcludedSummary)}</p>`
            : ''}
      </article>
    `, { id: 'appendix' });
};
