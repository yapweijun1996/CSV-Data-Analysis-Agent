import { escapeHtml } from './helpers.js';

export const renderReportPanel = ({ overview, keyInsights = [], visuals = [], recommendations = [] } = {}) => {
  if (!overview && !keyInsights.length && !visuals.length && !recommendations.length) {
    return '';
  }
  const insightsHtml = keyInsights.length
    ? `<ul class="report-insights">
        ${keyInsights
          .map(
            insight => `<li>
              <strong>${escapeHtml(insight.title || 'Insight')}</strong>
              <span>${escapeHtml(insight.detail || '')}</span>
            </li>`
          )
          .join('')}
      </ul>`
    : '';
  const visualsHtml = visuals.length
    ? `<div class="report-visuals">
        ${visuals
          .map(
            visual => `<div class="report-visual-card">
              <div class="report-visual-title">${escapeHtml(visual.title || '')}</div>
              ${visual.description ? `<div class="report-visual-desc">${escapeHtml(visual.description)}</div>` : ''}
            </div>`
          )
          .join('')}
      </div>`
    : '';
  const recHtml = recommendations.length
    ? `<ol class="report-recommendations">
        ${recommendations.map(rec => `<li>${escapeHtml(rec)}</li>`).join('')}
      </ol>`
    : '';

  return `
    <section class="report-panel">
      <header class="report-header">
        <h3>Analysis Report</h3>
      </header>
      ${overview ? `<p class="report-overview">${escapeHtml(overview)}</p>` : ''}
      ${insightsHtml}
      ${visualsHtml}
      ${recHtml}
    </section>
  `;
};
