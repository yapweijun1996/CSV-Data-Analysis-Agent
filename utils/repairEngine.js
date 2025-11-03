import { getRepairSkills } from '../services/skillLibrary.js';
import { auditAnalysisState } from './pipelineAudit.js';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const scoreCategoricalProfile = profile => {
  const unique = typeof profile?.uniqueValues === 'number' ? profile.uniqueValues : 0;
  const missing = clamp(typeof profile?.missingPercentage === 'number' ? profile.missingPercentage : 0, 0, 100);
  if (unique <= 1) return 0;
  const coverageScore = 100 - missing;
  const idealUnique = 12;
  const uniquenessPenalty = Math.abs(unique - idealUnique);
  const uniquenessScore = clamp(50 - uniquenessPenalty * 2, 0, 50);
  return coverageScore * 0.6 + uniquenessScore * 0.4;
};

const scoreNumericProfile = profile => {
  const missing = clamp(typeof profile?.missingPercentage === 'number' ? profile.missingPercentage : 0, 0, 100);
  const range = Array.isArray(profile?.valueRange)
    ? Math.abs((profile.valueRange[1] ?? 0) - (profile.valueRange[0] ?? 0))
    : 0;
  const coverageScore = 100 - missing;
  const rangeScore = Math.log10(range + 1) * 25;
  return coverageScore * 0.6 + rangeScore * 0.4;
};

const buildFallbackSelector = (orderedNames = []) => {
  let cursor = 0;
  return current => {
    while (cursor < orderedNames.length) {
      const candidate = orderedNames[cursor++];
      if (!candidate) continue;
      if (candidate === current) {
        continue;
      }
      return candidate;
    }
    return current || orderedNames[0] || null;
  };
};

const buildPlanPatch = (plan, patch, context) => {
  const result = { ...plan };
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (typeof value === 'string' && value.startsWith('<') && value.endsWith('>')) {
      const token = value.slice(1, -1);
      if (token === 'categoricalFallback') {
        result[key] = context.nextCategorical(plan[key] || result[key]);
      } else if (token === 'numericFallback') {
        result[key] = context.nextNumeric(plan[key] || result[key]);
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
  const categoricalRanked = columnProfiles
    .filter(profile => profile?.type !== 'numerical' && profile?.name)
    .map(profile => ({ name: profile.name, score: scoreCategoricalProfile(profile) }))
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.name);
  const numericRanked = columnProfiles
    .filter(profile => profile?.type === 'numerical' && profile?.name)
    .map(profile => ({ name: profile.name, score: scoreNumericProfile(profile) }))
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.name);

  const fallbackContext = {
    nextCategorical: buildFallbackSelector(categoricalRanked),
    nextNumeric: buildFallbackSelector(numericRanked),
  };

  const repairSkills = getRepairSkills();

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
