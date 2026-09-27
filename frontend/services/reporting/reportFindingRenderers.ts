import type {
    ReportFindingSection,
    ReportIr,
    ReportVisual,
    Settings,
} from '../../types';
import { escapeHtml, titleCase, isLongText, isSemanticallySimilar } from './htmlUtils';
import type { ShellText } from './reportLocalization';
import {
    renderBadge,
    renderEvidenceRefs,
    renderFallbackTable,
    renderList,
    renderParagraphBlock,
    renderProwItem,
    renderPtacSection,
    renderTextParagraph,
} from './htmlRenderers';

export const renderManagementFindingSentence = (claim: string, caveat?: string): string =>
    `${claim.trim().replace(/\.*$/, '')}.${caveat ? ` Caveat: ${caveat.trim().replace(/\.*$/, '')}.` : ''}`;

export const resolveBusinessKpiNote = (
    item: ReportIr['kpiHighlights'][number],
    text: ShellText,
    businessContext: string[],
): string => {
    const note = String(item.supportingNote ?? '').trim();
    if (!note) {
        return '';
    }
    if (!businessContext.some(entry => isSemanticallySimilar(entry, note))) {
        return note;
    }

    const label = item.label.toLowerCase();
    if (label.includes('top visual')) {
        return text.primaryVisualSupport;
    }
    if (label.includes('trusted cards')) {
        return 'Visual evidence selected for this report.';
    }
    if (label.includes('row expansion')) {
        return 'Prepared rows compared with raw rows.';
    }
    if (label.includes('material caveats')) {
        return 'Caveats and readiness risks still active.';
    }
    return text.supportingDetailAvailable;
};

const renderVisualSummaryRow = (
    visual: ReportVisual,
    index: number,
    text: ShellText,
    reportTemplate: Settings['reportTemplate'],
): string => renderProwItem(`
  <article class="supporting-card summary-card finding-high">
    <div class="card-header">
      <div>
        <p class="eyebrow">${escapeHtml(text.keyFinding)} ${index + 1}</p>
        <h3>${escapeHtml(reportTemplate === 'executive_brief' ? visual.title : visual.businessTitle)}</h3>
        ${reportTemplate === 'audit_appendix'
            ? `<p class="meta-line">${escapeHtml(visual.title)}</p>`
            : ''}
      </div>
      <div class="badge-stack">
        ${renderBadge(visual.chartType === 'table' ? text.dataTable : titleCase(visual.chartType), 'neutral')}
        ${visual.calloutValue ? renderBadge(visual.calloutValue, 'good') : ''}
      </div>
    </div>
    ${reportTemplate === 'executive_brief' || reportTemplate === 'management_review'
        ? `<p>${escapeHtml(renderManagementFindingSentence(visual.businessTitle, visual.caveat))}</p>`
        : visual.caveat ? `<p class="meta-line">${escapeHtml(visual.caveat)}</p>` : ''}
  </article>
`, { id: `finding-${index + 1}` });

const renderVisualChartRow = (visual: ReportVisual): string => renderProwItem(`
  <article class="supporting-card chart-card">
    <div class="visual-surface">
      ${visual.svgMarkup ?? renderFallbackTable(visual)}
    </div>
    ${visual.chartWarnings.length > 0 ? `<p class="meta-line chart-warning">${escapeHtml(visual.chartWarnings.join(' '))}</p>` : ''}
  </article>
`, { suppressRowHeader: true, extraClassName: 'report-row--chart' });

const renderVisualNarrativeRow = (
    visual: ReportVisual,
    text: ShellText,
): string => renderProwItem(`
  <article class="supporting-card narrative-card">
    <div class="narrative-grid narrative-grid--short">
      <div>
        <h4>${escapeHtml(text.whatItShows)}</h4>
        <p>${escapeHtml(visual.whatItShows)}</p>
      </div>
      <div>
        <h4>${escapeHtml(text.whyItMatters)}</h4>
        <p>${escapeHtml(visual.whyItMatters)}</p>
      </div>
      ${visual.caveat ? `
      <div>
        <h4>${escapeHtml(text.caveat)}</h4>
        <p>${escapeHtml(visual.caveat)}</p>
      </div>
      ` : ''}
    </div>
  </article>
`, { suppressRowHeader: true, extraClassName: 'report-row--narrative' });

const renderVisualLongNarrative = (
    visual: ReportVisual,
    index: number,
    text: ShellText,
): string => renderPtacSection(
    `${text.keyFinding} ${index + 1}: ${visual.businessTitle}`,
    text.decisionEvidence,
    [
        renderParagraphBlock(text.whatItShows, visual.whatItShows),
        renderParagraphBlock(text.whyItMatters, visual.whyItMatters),
        ...(visual.caveat ? [renderParagraphBlock(text.caveat, visual.caveat)] : []),
        ...(visual.chartWarnings.length > 0 ? [renderParagraphBlock('Chart note', visual.chartWarnings.join(' '))] : []),
    ],
);

export const renderVisualFindingRows = (
    reportVisuals: ReportVisual[],
    text: ShellText,
    reportTemplate: Settings['reportTemplate'],
): string[] => {
    if (reportVisuals.length === 0) {
        return [];
    }

    return reportVisuals.map((visual, index) => {
        if (reportTemplate === 'executive_brief' || reportTemplate === 'management_review') {
            return [
                renderVisualSummaryRow(visual, index, text, reportTemplate),
                renderVisualChartRow(visual),
            ].join('');
        }

        const shortNarrative = ![
            visual.whatItShows,
            visual.whyItMatters,
            visual.caveat ?? '',
            visual.chartWarnings.join(' '),
        ].some(item => isLongText(item, 160));

        return [
            renderVisualSummaryRow(visual, index, text, reportTemplate),
            renderVisualChartRow(visual),
            shortNarrative ? renderVisualNarrativeRow(visual, text) : renderVisualLongNarrative(visual, index, text),
        ].join('');
    });
};

export const renderBusinessVisualFindingRows = (
    reportVisuals: ReportVisual[],
    text: ShellText,
): string[] => reportVisuals.map((visual, index) => renderProwItem(`
  <article class="supporting-card summary-card finding-high">
    ${index === 0 ? `<div class="section-intro-inline"><p class="eyebrow">${escapeHtml(text.decisionEvidence)}</p><h2>${escapeHtml(text.keyFindings)}</h2></div>` : ''}
    <div class="card-header">
      <div>
        <p class="eyebrow">${escapeHtml(text.keyFinding)} ${index + 1}</p>
        <h3>${escapeHtml(visual.title)}</h3>
      </div>
      <div class="badge-stack">
        ${renderBadge(visual.chartType === 'table' ? text.dataTable : titleCase(visual.chartType), 'neutral')}
        ${visual.calloutValue ? renderBadge(visual.calloutValue, 'good') : ''}
      </div>
    </div>
    <div class="visual-surface">
      ${visual.svgMarkup ?? renderFallbackTable(visual)}
    </div>
    <p>${escapeHtml(renderManagementFindingSentence(visual.businessTitle, visual.caveat))}</p>
  </article>
`, { id: index === 0 ? 'key-findings' : undefined }));

export const renderBusinessTextFindingRows = (
    text: ShellText,
    findingSections: ReportFindingSection[],
    introAlreadyUsed: boolean,
    startIndex = 0,
): string[] => {
    let usedIntro = introAlreadyUsed;
    let businessIndex = startIndex > 0 ? startIndex + 1 : (introAlreadyUsed ? 2 : 1);

    return findingSections.flatMap(section => section.items.map(item => {
        const row = renderProwItem(`
          <article class="supporting-card summary-card finding-${item.importance}">
            ${!usedIntro ? `<div class="section-intro-inline"><p class="eyebrow">${escapeHtml(text.decisionEvidence)}</p><h2>${escapeHtml(text.keyFindings)}</h2></div>` : ''}
            <div class="card-header">
              <div>
                <p class="eyebrow">${escapeHtml(text.keyFinding)} ${businessIndex}</p>
                <h3>${escapeHtml(item.claim)}</h3>
              </div>
              ${renderBadge(titleCase(item.importance), item.importance === 'high' ? 'good' : item.importance === 'medium' ? 'warning' : 'neutral')}
            </div>
            <p>${escapeHtml(renderManagementFindingSentence(item.claim, item.caveats[0]))}</p>
          </article>
        `, { id: !usedIntro ? 'key-findings' : undefined });
        usedIntro = true;
        businessIndex += 1;
        return row;
    }));
};

export const renderTextFindingRows = (
    text: ShellText,
    findingSections: ReportFindingSection[],
    reportTemplate: Settings['reportTemplate'],
): string[] => findingSections.flatMap((section, sectionIndex) => section.items.map((item, index) => renderProwItem(`
      <article class="supporting-card summary-card finding-${item.importance}">
        ${index === 0 ? `<p class="eyebrow">${escapeHtml(section.title)}</p>` : ''}
        <div class="card-header">
          <h3>${escapeHtml(reportTemplate === 'audit_appendix' ? item.claim : `${text.keyFinding} ${sectionIndex + index + 1}`)}</h3>
          ${renderBadge(titleCase(item.importance), item.importance === 'high' ? 'good' : item.importance === 'medium' ? 'warning' : 'neutral')}
        </div>
        ${reportTemplate === 'executive_brief' || reportTemplate === 'management_review'
            ? `<p>${escapeHtml(renderManagementFindingSentence(item.claim, item.caveats[0]))}</p>`
            : `
        <p class="meta-line"><strong>Supported by:</strong> ${item.supportedByRoles.map(role => escapeHtml(titleCase(role))).join(', ')}</p>
        ${renderEvidenceRefs(item.evidenceRefs)}
        ${item.caveats.length > 0 ? `<div class="subsection"><h4>Caveats</h4>${renderList(item.caveats, 'compact-list')}</div>` : ''}
        `}
      </article>
    `, {
        id: sectionIndex === 0 && index === 0 ? 'finding-1' : undefined,
    })));
