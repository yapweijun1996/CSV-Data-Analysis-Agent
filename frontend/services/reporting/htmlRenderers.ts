import type {
    ForumDisagreementResolution,
    ReportIr,
    ReportVisual,
} from '../../types';
import { escapeHtml, titleCase, isSemanticallySimilar } from './htmlUtils';

export const renderBadge = (label: string, tone: 'neutral' | 'good' | 'warning' | 'danger'): string =>
    `<span class="badge badge-${tone}">${escapeHtml(label)}</span>`;

export const renderReadinessLabel = (readiness: ReportIr['dataset']['readiness']): string => {
    if (readiness === 'ready') {
        return 'Ready for bounded analyst synthesis';
    }

    if (readiness === 'partial') {
        return 'Usable with material caveats';
    }

    return 'Not ready for analyst synthesis';
};

export const renderList = (items: string[], className = 'bullet-list'): string => {
    if (items.length === 0) {
        return '<p class="empty-state">None.</p>';
    }

    return `<ul class="${className}">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
};

export const renderEvidenceRefs = (evidenceRefs: string[]): string => {
    if (evidenceRefs.length === 0) {
        return '<p class="meta-line">Evidence: none</p>';
    }

    return `<p class="meta-line"><strong>Evidence:</strong> ${evidenceRefs.map(ref => `<code>${escapeHtml(ref)}</code>`).join(', ')}</p>`;
};

export const renderDisagreementResolutionTone = (
    resolution: ForumDisagreementResolution,
): 'neutral' | 'warning' | 'danger' => {
    if (resolution === 'resolved') {
        return 'neutral';
    }

    if (resolution === 'partially_resolved') {
        return 'warning';
    }

    return 'danger';
};

export const renderStructuralSignals = (signals: ReportIr['dataset']['structuralSignals']): string[] => {
    const items: string[] = [];

    if (typeof signals.rowExpansionRatio === 'number') {
        items.push(`Row expansion ratio: ${signals.rowExpansionRatio.toFixed(1)}x`);
    }
    if (signals.hasMetadataRows) {
        items.push('Metadata rows were detected in the source report.');
    }
    if (signals.hasMultiRowHeader) {
        items.push('A multi-row header structure was detected.');
    }
    if (signals.usedFallbackContext) {
        items.push('Report context required fallback recovery.');
    }

    return items;
};

export const renderFallbackTable = (visual: ReportVisual): string => {
    if (!visual.fallbackTable) {
        return '<p class="empty-state">No chartable rows were available for this finding.</p>';
    }

    return `
<div class="table-wrap compact-table">
  <table>
    <thead>
      <tr>
        ${visual.fallbackTable.columns.map(column => `<th>${escapeHtml(column)}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${visual.fallbackTable.rows.map(row => `
        <tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>
      `).join('')}
    </tbody>
  </table>
</div>
`;
};

export const renderTableShell = (
    className: string,
    content: string,
    options?: { id?: string },
): string => `
<table cellpadding="0" cellspacing="0" border="0" class="paper_width ${className} report-shell-table"${options?.id ? ` id="${escapeHtml(options.id)}"` : ''}>
  <colgroup>
    <col class="report-shell-col report-shell-col--gutter" />
    <col class="report-shell-col report-shell-col--content" />
    <col class="report-shell-col report-shell-col--gutter" />
  </colgroup>
  <tr>
    <td class="report-shell-gutter"></td>
    <td class="report-shell-content-cell">
      <div class="report-shell-content">
        ${content}
      </div>
    </td>
    <td class="report-shell-gutter"></td>
  </tr>
</table>
`;

export const renderProwHeader = (eyebrow: string, title: string, id?: string): string => `
${renderTableShell('prowheader', `
  <div class="section-heading">
    <div>
      <p class="eyebrow">${escapeHtml(eyebrow)}</p>
      <h2>${escapeHtml(title)}</h2>
    </div>
  </div>
`, id ? { id } : undefined)}`;

export const renderProwItem = (
    content: string,
    options?: {
        id?: string;
        extraClassName?: string;
        suppressRowHeader?: boolean;
        pageBreakBefore?: boolean;
    },
): string => `
${renderTableShell(
    `prowitem report-row${options?.extraClassName ? ` ${options.extraClassName}` : ''}${options?.pageBreakBefore ? ' tb_page_break_before' : ''}`,
    `
  <div class="report-row__body">
    ${content}
  </div>
`,
    options?.id ? { id: options.id } : undefined,
)}
`;

export const renderCompactSectionCard = (eyebrow: string, title: string, id?: string): string => renderProwItem(`
  <article class="supporting-card compact-card section-intro-card">
    <p class="eyebrow">${escapeHtml(eyebrow)}</p>
    <h2>${escapeHtml(title)}</h2>
  </article>
`, id ? { id } : undefined);

export const renderParagraphBlock = (label: string, value: string): string =>
    `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`;

export const renderTextParagraph = (value: string): string =>
    `<p>${escapeHtml(value)}</p>`;

export const renderNumberedList = (items: string[]): string =>
    items.length > 0
        ? `<ol class="recommended-actions-list">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`
        : '';

export const renderPtacSection = (
    title: string,
    eyebrow: string,
    paragraphs: string[],
    options?: { id?: string; pageBreakBefore?: boolean },
): string => {
    const normalized = paragraphs.map(item => String(item ?? '').trim()).filter(Boolean);
    if (normalized.length === 0) {
        return '';
    }

    return `
${renderTableShell(`ptac narrative-flow${options?.pageBreakBefore ? ' tb_page_break_before' : ''}`, `
  <div class="narrative-sheet">
    <p class="eyebrow">${escapeHtml(eyebrow)}</p>
    <h2>${escapeHtml(title)}</h2>
    ${normalized.join('')}
  </div>
`, options?.id ? { id: options.id } : undefined)}
`;
};

export const renderCompactNarrativeSection = (
    title: string,
    eyebrow: string,
    paragraphs: string[],
    options?: { id?: string },
): string => {
    const normalized = paragraphs.map(item => String(item ?? '').trim()).filter(Boolean);
    if (normalized.length === 0) {
        return '';
    }

    return renderProwItem(`
      <article class="supporting-card compact-card section-intro-card">
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h2>${escapeHtml(title)}</h2>
        ${normalized.join('')}
      </article>
    `, options?.id ? { id: options.id } : undefined);
};

export const renderPaddtSection = (
    title: string,
    eyebrow: string,
    paragraphs: string[],
    options?: { id?: string },
): string => {
    const normalized = paragraphs.map(item => String(item ?? '').trim()).filter(Boolean);
    if (normalized.length === 0) {
        return '';
    }

    return `
${renderTableShell('paddt appendix-flow', `
  <div class="narrative-sheet">
    <p class="eyebrow">${escapeHtml(eyebrow)}</p>
    <h2>${escapeHtml(title)}</h2>
    ${normalized.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('')}
  </div>
`, options?.id ? { id: options.id } : undefined)}
`;
};

export const buildDistinctParagraphBlocks = (
    entries: Array<{ label: string; value: string | null | undefined }>,
    maxItems: number,
): string[] => {
    const selected: Array<{ label: string; value: string }> = [];

    entries.forEach(entry => {
        const value = String(entry.value ?? '').trim();
        if (!value) {
            return;
        }
        if (selected.some(item => isSemanticallySimilar(item.value, value))) {
            return;
        }
        if (selected.length >= maxItems) {
            return;
        }
        selected.push({ label: entry.label, value });
    });

    return selected.map(entry => renderParagraphBlock(entry.label, entry.value));
};
