import { escapeHtml } from './helpers.js';

const renderSampleTable = data => {
  if (!Array.isArray(data) || data.length === 0) {
    return '<p class="text-xs text-slate-500 p-3">No sample rows available.</p>';
  }
  const headers = Object.keys(data[0]);
  return `
    <div class="max-h-64 overflow-auto border border-slate-200 rounded-md">
      <table class="min-w-full text-xs text-left">
        <thead class="bg-slate-100 text-slate-600">
          <tr>
            ${headers
              .map(header => `<th class="px-3 py-2 font-semibold">${escapeHtml(header)}</th>`)
              .join('')}
          </tr>
        </thead>
        <tbody>
          ${data
            .map(
              row => `
                <tr class="border-t border-slate-200">
                  ${headers
                    .map(header => {
                      const value =
                        row && Object.prototype.hasOwnProperty.call(row, header) ? row[header] : '';
                      return `<td class="px-3 py-2 text-slate-700 whitespace-nowrap">${
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

export const renderDataPrepDebugPanel = ({
  plan,
  originalSample,
  transformedSample,
  isVisible,
}) => {
  if (
    !plan ||
    !plan.jsFunctionBody ||
    !Array.isArray(originalSample) ||
    originalSample.length === 0
  ) {
    return '';
  }

  const explanation = plan.explanation
    ? escapeHtml(plan.explanation)
    : 'AI did not provide an explanation.';
  const codeBlock = escapeHtml(plan.jsFunctionBody);
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
        class="flex justify-between items-center w-full text-left p-4 rounded-t-lg hover:bg-slate-50 transition-colors"
        data-toggle-data-prep
        aria-expanded="${isExpanded}"
      >
        <div>
          <h3 class="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span class="inline-flex items-center justify-center w-8 h-8 bg-slate-100 text-slate-700 rounded-full shadow-inner">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </span>
            AI Data Transformation Log
          </h3>
          <p class="text-sm text-slate-500">See how the AI cleaned and reshaped your data.</p>
        </div>
        <span class="transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>
      <div class="${bodyClasses.join(' ')}" data-data-prep-body>
        <div>
          <h4 class="font-semibold text-slate-800 mb-2">AI's Plan</h4>
          <p class="text-sm bg-slate-50 p-3 rounded-md border border-slate-200 text-slate-700 italic">"${explanation}"</p>
        </div>
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
        <div>
          <h4 class="font-semibold text-slate-800 mb-2">Transformation Code</h4>
          <pre class="bg-slate-900 text-slate-100 p-3 rounded-md text-xs overflow-x-auto">
<code>// AI-generated function to transform data
function transform(data, _util) {
${codeBlock}
}</code>
          </pre>
        </div>
        <div class="grid md:grid-cols-2 gap-6">
          <div>
            <h4 class="font-semibold text-slate-800 mb-2">Data Before (Raw Sample)</h4>
            ${renderSampleTable(originalSample)}
          </div>
          <div>
            <h4 class="font-semibold text-slate-800 mb-2">Data After (Transformed Sample)</h4>
            ${renderSampleTable(transformed)}
          </div>
        </div>
      </div>
    </div>
  `;
};
