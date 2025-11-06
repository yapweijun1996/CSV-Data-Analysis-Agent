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

const humanisePhase = phaseId =>
  typeof phaseId === 'string' && PHASE_LABELS[phaseId] ? PHASE_LABELS[phaseId] : phaseId || 'Phase';

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
  const heading = humanisePhase(phase.phase);
  const statusCls = statusClass(phase.status);
  const steps = Array.isArray(phase.steps) ? phase.steps.map(renderStep).join('') : '';
  const thoughts = Array.isArray(phase.thoughts) ? phase.thoughts.map(renderThought).join('') : '';
  return `
    <section class="wt-phase ${statusCls}">
      <header class="wt-phase-header">
        <div class="wt-phase-title">${escapeHtml(heading)}</div>
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

const formatConstraints = constraints => {
  if (Array.isArray(constraints) && constraints.length) {
    return constraints
      .filter(item => typeof item === 'string' && item.trim())
      .map(item => `<li>${escapeHtml(item.trim())}</li>`)
      .join('');
  }
  return '';
};

const renderPlanOverview = planItems => {
  if (!Array.isArray(planItems) || !planItems.length) {
    return '';
  }
  const items = planItems
    .map(item => {
      const label = humanisePhase(item.step);
      const status = statusClass(item.status);
      const statusText =
        item.status === 'in_progress'
          ? '進行中'
          : item.status === 'completed'
          ? '完成'
          : item.status === 'failed'
          ? '失敗'
          : '等待中';
      return `
        <li class="wt-plan-item ${status}">
          <span class="wt-plan-label">${escapeHtml(label)}</span>
          <span class="wt-plan-status">${escapeHtml(statusText)}</span>
        </li>
      `;
    })
    .join('');
  return `
    <section class="wt-plan">
      <header class="wt-plan-header">
        <h3>工作計畫</h3>
        <p>Agent 會依序完成 Diagnose → Plan → Execute → Adjust → Verify。</p>
      </header>
      <ol class="wt-plan-list">${items}</ol>
    </section>
  `;
};

export const renderWorkflowTimeline = (timeline, planItems = []) => {
  const hasTimeline = Boolean(timeline);
  const hasPlan = Array.isArray(planItems) && planItems.length > 0;
  if (!hasTimeline && !hasPlan) {
    return '';
  }

  const phases = hasTimeline && Array.isArray(timeline.phases) ? timeline.phases : [];
  const constraints = formatConstraints(timeline?.constraints);
  const headerMeta = timeline
    ? `
        ${timeline.goal ? `<p class="wt-goal">🎯 ${escapeHtml(timeline.goal)}</p>` : ''}
        ${
          constraints
            ? `<div class="wt-constraints"><span>🔒 限制：</span><ul>${constraints}</ul></div>`
            : ''
        }
        ${
          timeline.summary
            ? `<p class="wt-summary">✅ ${escapeHtml(timeline.summary)}</p>`
            : ''
        }
        ${
          timeline.completedAt
            ? `<p class="wt-meta">完成時間：${escapeHtml(formatTime(timeline.completedAt))}</p>`
            : ''
        }
      `
    : '<p class="wt-goal">Workflow tracker will appear once the agent starts.</p>';

  const phaseContent = phases.length
    ? phases.map(renderPhase).join('')
    : '<div class="wt-empty-text">尚未有階段紀錄。啟動任務後會顯示 AI 的逐步行動與思考。</div>';

  return `
    <section class="workflow-timeline${!phases.length ? ' is-empty' : ''}">
      <header class="wt-header">
        <h2>Workflow Timeline</h2>
        ${headerMeta}
      </header>
      ${hasPlan ? renderPlanOverview(planItems) : ''}
      <div class="wt-body">
        ${phaseContent}
      </div>
    </section>
  `;
};
