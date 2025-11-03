import { getSkillCatalog } from '../services/skillLibrary.js';
import { detectIntent } from './intentClassifier.js';
import { auditAnalysisState } from './pipelineAudit.js';

const selectFallbackColumn = (columns, predicate) => {
  if (!Array.isArray(columns)) return null;
  const match = columns.find(predicate);
  if (match) return match;
  return columns.length ? columns[0] : null;
};

const buildPlanPatch = (plan, patch, context) => {
  const result = { ...plan };
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (typeof value === 'string' && value.startsWith('<') && value.endsWith('>')) {
      const token = value.slice(1, -1);
      if (token === 'categoricalFallback') {
        result[key] = context.categoricalFallback || plan[key] || result[key];
      } else if (token === 'numericFallback') {
        result[key] = context.numericFallback || plan[key] || result[key];
      } else {
        result[key] = plan[key] || result[key];
      }
    } else {
      result[key] = value;
    }
  });
  return result;
};

export const determineRepairActions = (state, options = {}) => {
  const audit = options.auditReport || auditAnalysisState(state);
  const datasetId = state?.currentDatasetId || 'session';
  const columnProfiles = state?.columnProfiles || [];
  const categoricalColumns = columnProfiles
    .filter(profile => profile?.type !== 'numerical')
    .map(profile => profile.name)
    .filter(Boolean);
  const numericColumns = columnProfiles
    .filter(profile => profile?.type === 'numerical')
    .map(profile => profile.name)
    .filter(Boolean);

  const fallbackContext = {
    categoricalFallback: selectFallbackColumn(categoricalColumns, () => true),
    numericFallback: selectFallbackColumn(numericColumns, () => true),
  };

  const repairIntent = detectIntent('repair missing charts', columnProfiles);
  const repairSkills = getSkillCatalog(repairIntent).filter(skill => skill.repair);

  const actions = [];

  audit.issues.forEach(issue => {
    const skill = repairSkills.find(repair => repair.repair?.condition?.(issue));
    if (!skill) return;

    if (skill.repair.type === 'plan_patch' && issue.details?.cardId) {
      const card = state.analysisCards?.find(entry => entry.id === issue.details.cardId);
      if (!card) return;
      const patchedPlan = buildPlanPatch(card.plan || {}, skill.repair.patch, fallbackContext);
      actions.push({
        type: 'plan_patch',
        cardId: card.id,
        originalPlan: card.plan,
        patchedPlan,
        reason: issue.message,
        skillId: skill.id,
      });
    }

    if (skill.repair.type === 'audit_summary') {
      actions.push({
        type: 'system_message',
        summary: audit.summary,
        issues: audit.issues,
        skillId: skill.id,
      });
    }
  });

  return {
    datasetId,
    audit,
    actions,
  };
};

export const hasCriticalIssues = auditReport => (auditReport?.stats?.critical || 0) > 0;

export const summariseRepairActions = repairPlan => {
  if (!repairPlan || !Array.isArray(repairPlan.actions)) return 'No repair actions planned.';
  const count = repairPlan.actions.length;
  if (!count) return 'No repair actions required.';
  const patched = repairPlan.actions.filter(action => action.type === 'plan_patch').length;
  const messages = repairPlan.actions
    .filter(action => action.type === 'plan_patch')
    .map(action => `- Card ${action.cardId}: ${action.reason}`)
    .join('\n');
  return `Prepared ${count} repair action(s). ${patched} plan(s) will be patched.\n${messages}`;
};
