import { escapeHtml } from './helpers.js';

const PHASE_LABELS = {
  diagnose: 'Diagnose 診斷',
  plan: 'Plan 規劃',
  execute: 'Execute 執行',
  adjust: 'Adjust 調整',
  verify: 'Verify 驗證',
};

const statusClass = status => {
  switch (status) {
    case 'completed':
      return 'status-completed';
    case 'failed':
      return 'status-failed';
    case 'in_progress':
      return 'status-active';
    default:
      return 'status-pending';
  }
};

const formatTime = iso => {
  if (!iso) return '';
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString();
  } catch (error) {
    return '';
  }
};

const renderStep = step => {
  const label = escapeHtml(step.label || 'Step');
  const status = escapeHtml(step.status || 'completed');
  const content = step.error
    ? `<span class="wt-step-error">${escapeHtml(step.error)}</span>`
    : step.outcome
    ? `<span class="wt-step-outcome">${escapeHtml(step.outcome)}</span>`
    : '';
  const statusCls = statusClass(status);
  const time = formatTime(step.completedAt);
  return `
    <li class="wt-step ${statusCls}">
      <div class="wt-step-header">
        <span class="wt-step-label">${label}</span>
        ${time ? `<span class="wt-step-time">${escapeHtml(time)}</span>` : ''}
      </div>
      ${content ? `<div class="wt-step-body">${content}</div>` : ''}
    </li>
  `;
};

const renderThought = thought => {
  const text = escapeHtml(thought.text || '');
  const time = formatTime(thought.timestamp);
  return `
    <div class="wt-thought">
      <span class="wt-thought-icon">🤔</span>
      <div class="wt-thought-body">
        <p>${text}</p>
        ${time ? `<span class="wt-thought-time">${escapeHtml(time)}</span>` : ''}
      </div>
    </div>
  `;
};

const renderPhase = phase => {
  const heading = PHASE_LABELS[phase.phase] || escapeHtml(phase.phase || 'Phase');
  const statusCls = statusClass(phase.status);
  const steps = Array.isArray(phase.steps)
    ? phase.steps.map(renderStep).join('')
    : '';
  const thoughts = Array.isArray(phase.thoughts)
    ? phase.thoughts.map(renderThought).join('')
    : '';
  return `
    <section class="wt-phase ${statusCls}">
      <header class="wt-phase-header">
        <div class="wt-phase-title">${heading}</div>
        <div class="wt-phase-meta">
          <span class="wt-phase-status">${escapeHtml(phase.status || '')}</span>
          ${phase.startedAt ? `<span class="wt-phase-time">開始 ${escapeHtml(formatTime(phase.startedAt))}</span>` : ''}
          ${phase.finishedAt ? `<span class="wt-phase-time">結束 ${escapeHtml(formatTime(phase.finishedAt))}</span>` : ''}
        </div>
      </header>
      ${steps ? `<ol class="wt-step-list">${steps}</ol>` : '<div class="wt-step-list wt-empty">尚未記錄步驟</div>'}
      ${thoughts ? `<div class="wt-thought-list">${thoughts}</div>` : ''}
    </section>
  `;
};

export const renderWorkflowTimeline = () => '';
