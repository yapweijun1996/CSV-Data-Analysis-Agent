/**
 * AGENT-105: Runtime Tool Policy Pipeline — Phase Consolidation.
 *
 * Centralizes all runtime tool exposure decisions into a single phase-based
 * policy. Each contract selects a phase, the pipeline returns the tool set.
 *
 * 3-phase model (converse / explore / analyze):
 *   - Phase is "coarse-grained tool exposure" only.
 *   - Real safety stays in deterministic executor / governance (decideHarness).
 *   - "Relax tool exposure, don't relax destructive safety."
 *
 * Every phase has a human-readable label for traceability — the runtime
 * can explain *why* a tool is allowed or denied at any step.
 */

import type { RuntimeStepContract, ToolName } from '../../../types';

// ─── Phase type ─────────────────────────────────────────────────

export type RuntimeToolPhase =
    | 'converse'
    | 'explore'
    | 'analyze';

/** Ordered from narrowest to widest — used by orient escalation. */
export const PHASE_ESCALATION_ORDER: readonly RuntimeToolPhase[] = [
    'converse',
    'explore',
    'analyze',
] as const;

// ─── Policy entries ─────────────────────────────────────────────

interface RuntimeToolPolicyEntry {
    phase: RuntimeToolPhase;
    label: string;
    tools: ToolName[];
}

const ANALYSIS_TOOLS: ToolName[] = [
    'analysis.create_plan',
    'analysis.pivot_matrix',
    'analysis.period_compare',
    'analysis.cohort_retention',
    'analysis.root_cause_breakdown',
    'analysis.correlation',
    'analysis.validate_metric_mapping',
    'card.review',
    'card.delete',
    'ui.change_chart_type',
    'ui.highlight_card',
    'ui.show_card_data',
    'ui.filter_card',
    'data.query',
    'data.mutate',
    'spreadsheet.filter',
    'conversation.request_clarification',
];

const RUNTIME_TOOL_POLICY: RuntimeToolPolicyEntry[] = [
    {
        phase: 'converse',
        label: 'Conversational with card refinement + deletion',
        tools: ['conversation.request_clarification', 'card.refine', 'card.delete', 'data.query'],
    },
    {
        phase: 'explore',
        label: 'Read-only evidence inspection + card refinement + deletion',
        tools: [
            'data.query',
            'spreadsheet.filter',
            'analysis.validate_metric_mapping',
            'conversation.request_clarification',
            'card.refine',
            'card.delete',
        ],
    },
    {
        phase: 'analyze',
        label: 'Full analysis, card creation, and data mutation',
        tools: [...ANALYSIS_TOOLS],
    },
];

// ─── Lookup helpers ─────────────────────────────────────────────

const policyMap = new Map<RuntimeToolPhase, RuntimeToolPolicyEntry>(
    RUNTIME_TOOL_POLICY.map(entry => [entry.phase, entry]),
);

const dedupeTools = (tools: ToolName[]) => Array.from(new Set(tools));

// ─── Public API ─────────────────────────────────────────────────

/** Get tool set for a phase. Single source of truth. */
export const getToolsForPhase = (phase: RuntimeToolPhase): ToolName[] => {
    const entry = policyMap.get(phase);
    return entry ? [...entry.tools] : [];
};

/** Human-readable label for a phase. */
export const getToolPhaseLabel = (phase: RuntimeToolPhase): string => {
    const entry = policyMap.get(phase);
    return entry?.label ?? 'Unknown phase';
};

/**
 * Focused analysis: returns the full analyze phase tool set.
 * Previously limited to primary + support tools; now exposes all analysis
 * tools. Safety is enforced by decideHarness, not tool exposure.
 */
export const getToolsForFocusedAnalysis = (_primaryTool: ToolName): ToolName[] =>
    getToolsForPhase('analyze');

/** Map a task mode to the appropriate tool phase. */
export const resolveToolPhaseForTaskMode = (
    taskMode: RuntimeStepContract['taskMode'],
): RuntimeToolPhase => {
    switch (taskMode) {
        case 'visualize':
        case 'pivot_matrix':
        case 'period_compare':
        case 'cohort_retention':
        case 'root_cause_breakdown':
        case 'statistical_analysis':
        case 'validate_metric':
        case 'derive_metric':
            return 'analyze';
        case 'inspect':
        case 'reconciliation':
        case 'explain':
        default:
            return 'explore';
    }
};

/** Get tool set for a task mode (convenience wrapper). */
export const getToolsForTaskMode = (taskMode: RuntimeStepContract['taskMode']): ToolName[] =>
    getToolsForPhase(resolveToolPhaseForTaskMode(taskMode));

// ─── Structured result API (AGENT-105A) ─────────────────────────

/** Structured result carrying both tools and phase metadata. */
export interface ToolPhaseResult {
    tools: ToolName[];
    phase: RuntimeToolPhase;
    label: string;
}

/** Resolve tools + phase metadata for a phase. */
export const resolvePhase = (phase: RuntimeToolPhase): ToolPhaseResult => ({
    tools: getToolsForPhase(phase),
    phase,
    label: getToolPhaseLabel(phase),
});

/** Resolve tools + phase metadata for a task mode. */
export const resolvePhaseForTaskMode = (taskMode: RuntimeStepContract['taskMode']): ToolPhaseResult => {
    const phase = resolveToolPhaseForTaskMode(taskMode);
    return resolvePhase(phase);
};

/** Resolve tools + phase metadata for focused analysis (now returns full analyze phase). */
export const resolvePhaseForFocusedAnalysis = (_primaryTool: ToolName): ToolPhaseResult => ({
    tools: getToolsForPhase('analyze'),
    phase: 'analyze',
    label: `${getToolPhaseLabel('analyze')}`,
});

/**
 * Apply contract-local overrides on top of a phase set.
 * Allow overrides add tools; deny overrides remove tools.
 */
export const applyToolOverrides = (
    phaseTools: ToolName[],
    allowOverrides?: ToolName[],
    denyOverrides?: ToolName[],
): ToolName[] => {
    const allowed = new Set([...phaseTools, ...(allowOverrides ?? [])]);
    (denyOverrides ?? []).forEach(tool => allowed.delete(tool));
    return [...allowed];
};

// ─── Phase escalation helpers ───────────────────────────────────

/** Get the next wider phase, or null if already at widest. */
export const getNextPhase = (current: RuntimeToolPhase): RuntimeToolPhase | null => {
    const idx = PHASE_ESCALATION_ORDER.indexOf(current);
    if (idx < 0 || idx >= PHASE_ESCALATION_ORDER.length - 1) return null;
    return PHASE_ESCALATION_ORDER[idx + 1];
};

/** Check if a tool is available in the given phase. */
export const isToolInPhase = (toolName: string, phase: RuntimeToolPhase): boolean =>
    getToolsForPhase(phase).includes(toolName as ToolName);

/** Find the narrowest phase that contains the given tool. */
export const findPhaseForTool = (toolName: string): RuntimeToolPhase | null => {
    for (const phase of PHASE_ESCALATION_ORDER) {
        if (isToolInPhase(toolName, phase)) return phase;
    }
    return null;
};
