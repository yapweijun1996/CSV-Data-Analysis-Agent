import { escapeHtml } from './helpers.js';

const STAGE_PLAN_SECTIONS = [
  { key: 'titleExtraction', label: 'Title & Metadata' },
  { key: 'headerResolution', label: 'Header Resolution' },
  { key: 'dataNormalization', label: 'Data Rows' },
];

const renderSampleTable = data => {
  if (!Array.isArray(data) || data.length === 0) {
    return '<p class="data-sample-table-empty-message">No sample rows available.</p>';
  }
  const headers = Object.keys(data[0]);
  return `
    <div class="data-sample-table-wrapper">
      <table class="data-sample-table">
        <thead>
          <tr>
            ${headers
              .map(header => `<th>${escapeHtml(header)}</th>`)
              .join('')}
          </tr>
        </thead>
        <tbody>
          ${data
            .map(
              row => `
                <tr>
                  ${headers
                    .map(header => {
                      const value =
                        row && Object.prototype.hasOwnProperty.call(row, header) ? row[header] : '';
                      return `<td>${
                        value === null || value === undefined ? '' : escapeHtml(String(value))
                      }</td>`;
                    })
                    .join('')}
                </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
};

const renderStageSection = (label, detail) => {
  if (!detail) return '';
  const safeList = (items, title) =>
    Array.isArray(items) && items.length
      ? `<div>
           <p class="text-xs font-semibold text-slate-500 mb-1">${escapeHtml(title)}</p>
           <ul class="list-disc list-inside text-sm text-slate-700 space-y-1">
             ${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
           </ul>
         </div>`
      : '';
  const statusBadge = detail.status
    ? `<span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">${escapeHtml(
        detail.status
      )}</span>`
    : '';
  return `
    <div class="border border-slate-200 rounded-md p-3 bg-white shadow-sm space-y-3">
      <div class="flex items-center justify-between gap-3">
        <h5 class="font-semibold text-slate-800">${escapeHtml(label)}</h5>
        ${statusBadge}
      </div>
      <p class="text-sm text-slate-700">${escapeHtml(detail.goal || 'No goal specified.')}</p>
      ${
        detail.nextAction
          ? `<p class="text-xs text-slate-500"><span class="font-semibold">Next:</span> ${escapeHtml(
              detail.nextAction
            )}</p>`
          : ''
      }
      ${safeList(detail.checkpoints, 'Checkpoints')}
      ${safeList(detail.expectedArtifacts, 'Expected Artifacts')}
      ${safeList(detail.heuristics, 'Heuristics / Signals')}
      ${safeList(detail.fallbackStrategies, 'Fallback Strategies')}
    </div>
  `;
};

const renderStagePlan = stagePlan => {
  if (!stagePlan || typeof stagePlan !== 'object') {
    return '';
  }
  const sections = STAGE_PLAN_SECTIONS.map(section =>
    renderStageSection(section.label, stagePlan[section.key])
  )
    .filter(Boolean)
    .join('');
  if (!sections) {
    return '';
  }
  return `
    <div>
      <h4 class="font-semibold text-slate-800 mb-2">Stage Plan (Title → Header → Data)</h4>
      <div class="grid gap-3 md:grid-cols-3">${sections}</div>
    </div>
  `;
};

const renderAgentLog = agentLog => {
  if (!Array.isArray(agentLog) || !agentLog.length) {
    return '';
  }
  const entries = agentLog
    .map(entry => {
      if (!entry || !entry.thought) return '';
      const stage = entry.stage ? entry.stage.toUpperCase() : 'GENERAL';
      const action = entry.action ? ` → ${entry.action}` : '';
      const status = entry.status ? ` [${entry.status}]` : '';
      return `<li><span class="font-semibold text-slate-600">${escapeHtml(
        stage
      )}</span> ${escapeHtml(entry.thought)}${escapeHtml(action)}${escapeHtml(status)}</li>`;
    })
    .filter(Boolean)
    .join('');
  if (!entries) return '';
  return `
    <div>
      <h4 class="font-semibold text-slate-800 mb-2">Agent Log</h4>
      <ol class="list-decimal list-inside text-sm text-slate-700 space-y-1">${entries}</ol>
    </div>
  `;
};

export const renderDataPrepDebugPanel = ({
  plan,
  originalSample,
  transformedSample,
  isVisible,
}) => {
  if (!plan) {
    return '';
  }
  const hasStagePlan = plan.stagePlan && typeof plan.stagePlan === 'object';
  const hasCode = typeof plan.jsFunctionBody === 'string' && plan.jsFunctionBody.trim().length > 0;
  const hasSamples = Array.isArray(originalSample) && originalSample.length > 0;
  if (!hasStagePlan && !hasCode && !hasSamples) {
    return '';
  }

  const explanation = plan.explanation
    ? escapeHtml(plan.explanation)
    : 'AI did not provide an explanation.';
  const codeBlock = hasCode ? escapeHtml(plan.jsFunctionBody) : '';
  const transformed = Array.isArray(transformedSample) ? transformedSample : [];
  const isExpanded = Boolean(isVisible);
  const bodyClasses = ['p-4', 'pt-0', 'space-y-6'];
  if (!isExpanded) {
    bodyClasses.push('hidden');
  }

  return `
    <div class="bg-white rounded-lg shadow border border-slate-200" data-data-prep-panel>
      <button
        type="button"
        class="flex justify-between items-center w-full text-left p-4 ${isExpanded ? 'rounded-t-lg' : 'rounded-lg'} hover:bg-slate-50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        data-toggle-data-prep
        aria-expanded="${isExpanded}"
        aria-controls="data-prep-body"
      >
        <div>
          <h3 class="text-lg font-bold text-slate-900 flex items-center gap-3">
            <span class="inline-flex items-center justify-center text-slate-600" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </span>
            AI Data Preparation Log
          </h3>
          <p class="text-sm text-slate-500">Step-by-step plan for cleaning your CSV.</p>
        </div>
        <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-600 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>
      <div id="data-prep-body" class="${bodyClasses.join(' ')}" data-data-prep-body>
        <div>
          <h4 class="font-semibold text-slate-800 mb-2">AI's Plan</h4>
          <p class="text-sm bg-slate-50 p-3 rounded-md border border-slate-200 text-slate-700 italic">"${explanation}"</p>
        </div>
        ${hasStagePlan ? renderStagePlan(plan.stagePlan) : ''}
        ${
          Array.isArray(plan.analysisSteps) && plan.analysisSteps.length
            ? `<div>
                 <h4 class="font-semibold text-slate-800 mb-2">Analysis Steps (CoT)</h4>
                 <ol class="list-decimal list-inside text-sm text-slate-700 space-y-1">
                   ${plan.analysisSteps
                     .map(step => `<li>${escapeHtml(step)}</li>`)
                     .join('')}
                 </ol>
               </div>`
            : ''
        }
        ${renderAgentLog(plan.agentLog)}
        ${
          hasCode
            ? `<div>
                 <h4 class="font-semibold text-slate-800 mb-2">Transformation Code</h4>
                 <pre class="bg-slate-900 text-slate-100 p-3 rounded-md text-xs overflow-x-auto">
<code>// AI-generated function to transform data
function transform(data, _util) {
${codeBlock}
}</code>
                 </pre>
               </div>`
            : ''
        }
        ${
          hasSamples
            ? `<div class="data-sample-grid">
                 <div class="data-sample-section">
                   <h4 class="font-semibold text-slate-800 mb-2">Data Before (Raw Sample)</h4>
                   ${renderSampleTable(originalSample)}
                 </div>
                 <div class="data-sample-section">
                   <h4 class="font-semibold text-slate-800 mb-2">Data After (Transformed Sample)</h4>
                   ${renderSampleTable(transformed)}
                 </div>
               </div>`
            : ''
        }
      </div>
    </div>
  `;
};
