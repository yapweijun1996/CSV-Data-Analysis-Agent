import { escapeHtml } from './helpers.js';

export const renderReportPanel = ({ overview, keyInsights = [], visuals = [], recommendations = [] } = {}) => {
  if (!overview && !keyInsights.length && !visuals.length && !recommendations.length) {
    return '';
  }

  const overviewHtml = overview
    ? `<section class="report-section">
        <div class="report-section__header">
          <span class="report-section__icon">📌</span>
          <div>
            <h4>Executive Overview</h4>
            <p class="report-section__hint">Summary of key findings</p>
          </div>
        </div>
        <div class="report-overview">${escapeHtml(overview)}</div>
      </section>`
    : '';

  const insightsHtml = keyInsights.length
    ? `<section class="report-section">
        <div class="report-section__header">
          <span class="report-section__icon">💡</span>
          <div>
            <h4>Key Insights</h4>
            <p class="report-section__hint">Top observations with supporting evidence</p>
          </div>
        </div>
        <div class="report-insights-grid">
          ${keyInsights
            .map(
              insight => `<article class="report-insight-card">
                <h5>${escapeHtml(insight.title || 'Insight')}</h5>
                <p>${escapeHtml(insight.detail || '')}</p>
              </article>`
            )
            .join('')}
        </div>
      </section>`
    : '';

  const visualsHtml = visuals.length
    ? `<section class="report-section">
        <div class="report-section__header">
          <span class="report-section__icon">📊</span>
          <div>
            <h4>Supporting Visuals</h4>
            <p class="report-section__hint">Charts backing the insights</p>
          </div>
        </div>
        <div class="report-visuals-grid">
          ${visuals
            .map(
              visual => `<article class="report-visual-card">
                <div class="report-visual-card__body">
                  <h5>${escapeHtml(visual.title || '')}</h5>
                  ${visual.description ? `<p>${escapeHtml(visual.description)}</p>` : ''}
                </div>
              </article>`
            )
            .join('')}
        </div>
      </section>`
    : '';

  const recHtml = recommendations.length
    ? `<section class="report-section">
        <div class="report-section__header">
          <span class="report-section__icon">✅</span>
          <div>
            <h4>Recommended Actions</h4>
            <p class="report-section__hint">Next steps suggested by the agent</p>
          </div>
        </div>
        <ul class="report-recommendations">
          ${recommendations.map(rec => `<li>${escapeHtml(rec)}</li>`).join('')}
        </ul>
      </section>`
    : '';

  return `
    <section class="report-panel">
      <header class="report-header">
        <div>
          <p class="report-header__label">Smart Brief</p>
          <h3>Analysis Report</h3>
        </div>
      </header>
      ${overviewHtml}
      ${insightsHtml}
      ${visualsHtml}
      ${recHtml}
    </section>
  `;
};
