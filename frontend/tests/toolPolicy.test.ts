/**
 * AGENT-105: Runtime Tool Policy Pipeline tests — 3-phase model.
 *
 * Verifies:
 * - Each phase (converse / explore / analyze) returns the correct tool set
 * - Task-mode → phase mapping is correct
 * - Focused analysis now returns full analyze phase tools
 * - Tool overrides work (allow + deny)
 * - Phase escalation helpers
 * - Backward-compat: old constants still work
 */

import { describe, it, expect } from 'vitest';
import {
    getToolsForPhase,
    getToolsForTaskMode,
    getToolsForFocusedAnalysis,
    getToolPhaseLabel,
    resolveToolPhaseForTaskMode,
    applyToolOverrides,
    getNextPhase,
    isToolInPhase,
    findPhaseForTool,
    PHASE_ESCALATION_ORDER,
} from '../services/agent/runtime/runtimeToolPolicy';
import {
    CLARIFICATION_ONLY_TOOLS,
    READ_ONLY_RUNTIME_TOOLS,
    VISUALIZATION_RUNTIME_TOOLS,
    buildVisualizationToolSet,
    buildReadOnlyToolSet,
    buildFocusedAnalysisToolSet,
} from '../services/agent/runtime/runtimeToolExposurePolicy';

// ─── Phase tool sets ────────────────────────────────────────────

describe('getToolsForPhase — 3-phase model', () => {
    it('converse → clarification plus direct card actions and lightweight evidence query', () => {
        expect(getToolsForPhase('converse')).toEqual([
            'conversation.request_clarification',
            'card.refine',
            'card.delete',
            'data.query',
        ]);
    });

    it('explore → data.query + spreadsheet.filter + validate_metric_mapping + clarification', () => {
        const tools = getToolsForPhase('explore');
        expect(tools).toContain('data.query');
        expect(tools).toContain('spreadsheet.filter');
        expect(tools).toContain('analysis.validate_metric_mapping');
        expect(tools).toContain('conversation.request_clarification');
        expect(tools).not.toContain('analysis.create_plan');
        expect(tools).not.toContain('data.mutate');
    });

    it('analyze → includes all analysis tools + data.mutate', () => {
        const tools = getToolsForPhase('analyze');
        expect(tools).toContain('analysis.create_plan');
        expect(tools).toContain('analysis.pivot_matrix');
        expect(tools).toContain('analysis.validate_metric_mapping');
        expect(tools).toContain('card.review');
        expect(tools).toContain('ui.change_chart_type');
        expect(tools).toContain('data.query');
        expect(tools).toContain('data.mutate');
        expect(tools).toContain('conversation.request_clarification');
    });

    it('unknown phase → empty array', () => {
        expect(getToolsForPhase('nonexistent' as never)).toEqual([]);
    });

    it('each phase returns a fresh array (no shared references)', () => {
        const a = getToolsForPhase('analyze');
        const b = getToolsForPhase('analyze');
        expect(a).toEqual(b);
        expect(a).not.toBe(b);
    });
});

// ─── Task-mode → phase mapping ──────────────────────────────────

describe('resolveToolPhaseForTaskMode — 3-phase model', () => {
    it('inspect → explore', () => {
        expect(resolveToolPhaseForTaskMode('inspect')).toBe('explore');
    });

    it('explain → explore', () => {
        expect(resolveToolPhaseForTaskMode('explain')).toBe('explore');
    });

    it('visualize → analyze', () => {
        expect(resolveToolPhaseForTaskMode('visualize')).toBe('analyze');
    });

    it('validate_metric → analyze', () => {
        expect(resolveToolPhaseForTaskMode('validate_metric')).toBe('analyze');
    });

    it('derive_metric → analyze', () => {
        expect(resolveToolPhaseForTaskMode('derive_metric')).toBe('analyze');
    });

    it('all specialized analysis modes → analyze', () => {
        expect(resolveToolPhaseForTaskMode('pivot_matrix')).toBe('analyze');
        expect(resolveToolPhaseForTaskMode('period_compare')).toBe('analyze');
        expect(resolveToolPhaseForTaskMode('cohort_retention')).toBe('analyze');
        expect(resolveToolPhaseForTaskMode('root_cause_breakdown')).toBe('analyze');
        expect(resolveToolPhaseForTaskMode('statistical_analysis')).toBe('analyze');
    });
});

describe('getToolsForTaskMode', () => {
    it('inspect → explore tools', () => {
        expect(getToolsForTaskMode('inspect')).toEqual(getToolsForPhase('explore'));
    });

    it('visualize → analyze tools', () => {
        expect(getToolsForTaskMode('visualize')).toEqual(getToolsForPhase('analyze'));
    });
});

// ─── Focused analysis (now returns full analyze) ────────────────

describe('getToolsForFocusedAnalysis — now returns full analyze phase', () => {
    it('includes the primary tool', () => {
        const tools = getToolsForFocusedAnalysis('analysis.pivot_matrix');
        expect(tools).toContain('analysis.pivot_matrix');
    });

    it('includes all analyze tools (no longer restricted)', () => {
        const tools = getToolsForFocusedAnalysis('analysis.pivot_matrix');
        expect(tools).toContain('analysis.create_plan');
        expect(tools).toContain('data.query');
        expect(tools).toContain('data.mutate');
    });

    it('equals the full analyze phase tools', () => {
        const focused = getToolsForFocusedAnalysis('analysis.pivot_matrix');
        const analyze = getToolsForPhase('analyze');
        expect(new Set(focused)).toEqual(new Set(analyze));
    });
});

// ─── Phase labels ───────────────────────────────────────────────

describe('getToolPhaseLabel', () => {
    it('returns a non-empty label for every defined phase', () => {
        for (const phase of PHASE_ESCALATION_ORDER) {
            const label = getToolPhaseLabel(phase);
            expect(label).toBeTruthy();
            expect(label).not.toBe('Unknown phase');
        }
    });

    it('returns "Unknown phase" for unknown input', () => {
        expect(getToolPhaseLabel('nonexistent' as never)).toBe('Unknown phase');
    });
});

// ─── Tool overrides ─────────────────────────────────────────────

describe('applyToolOverrides', () => {
    it('deny overrides remove tools', () => {
        const base = getToolsForPhase('explore');
        const result = applyToolOverrides(base, [], ['data.query']);
        expect(result).not.toContain('data.query');
        expect(result).toContain('spreadsheet.filter');
    });

    it('allow overrides add tools', () => {
        const base = getToolsForPhase('converse');
        const result = applyToolOverrides(base, ['data.query']);
        expect(result).toContain('data.query');
        expect(result).toContain('conversation.request_clarification');
    });

    it('deny takes precedence when same tool is in both allow and base', () => {
        const base = ['data.query', 'conversation.request_clarification'] as const;
        const result = applyToolOverrides([...base], ['data.query'], ['data.query']);
        expect(result).not.toContain('data.query');
    });
});

// ─── Phase escalation helpers ───────────────────────────────────

describe('phase escalation helpers', () => {
    it('PHASE_ESCALATION_ORDER is converse → explore → analyze', () => {
        expect(PHASE_ESCALATION_ORDER).toEqual(['converse', 'explore', 'analyze']);
    });

    it('getNextPhase escalates correctly', () => {
        expect(getNextPhase('converse')).toBe('explore');
        expect(getNextPhase('explore')).toBe('analyze');
        expect(getNextPhase('analyze')).toBeNull();
    });

    it('isToolInPhase checks correctly', () => {
        expect(isToolInPhase('data.query', 'explore')).toBe(true);
        expect(isToolInPhase('data.query', 'converse')).toBe(true);
        expect(isToolInPhase('analysis.create_plan', 'analyze')).toBe(true);
        expect(isToolInPhase('analysis.create_plan', 'explore')).toBe(false);
    });

    it('findPhaseForTool finds narrowest phase', () => {
        expect(findPhaseForTool('conversation.request_clarification')).toBe('converse');
        expect(findPhaseForTool('data.query')).toBe('converse');
        expect(findPhaseForTool('analysis.create_plan')).toBe('analyze');
        expect(findPhaseForTool('nonexistent.tool')).toBeNull();
    });
});

// ─── Backward compatibility ─────────────────────────────────────

describe('backward-compat: old constants map to new phases', () => {
    it('CLARIFICATION_ONLY_TOOLS stays narrower than converse phase', () => {
        expect(CLARIFICATION_ONLY_TOOLS).toEqual(['conversation.request_clarification']);
        expect(getToolsForPhase('converse')).toEqual(expect.arrayContaining(CLARIFICATION_ONLY_TOOLS));
    });

    it('READ_ONLY_RUNTIME_TOOLS matches explore phase', () => {
        expect(READ_ONLY_RUNTIME_TOOLS).toEqual(getToolsForPhase('explore'));
    });

    it('VISUALIZATION_RUNTIME_TOOLS matches analyze phase', () => {
        expect(VISUALIZATION_RUNTIME_TOOLS).toEqual(getToolsForPhase('analyze'));
    });

    it('buildVisualizationToolSet() matches analyze phase', () => {
        expect(buildVisualizationToolSet()).toEqual(getToolsForPhase('analyze'));
    });

    it('buildReadOnlyToolSet() matches explore phase', () => {
        expect(buildReadOnlyToolSet()).toEqual(getToolsForPhase('explore'));
    });

    it('buildFocusedAnalysisToolSet matches getToolsForFocusedAnalysis', () => {
        const old = buildFocusedAnalysisToolSet('analysis.pivot_matrix');
        const pipeline = getToolsForFocusedAnalysis('analysis.pivot_matrix');
        expect(new Set(old)).toEqual(new Set(pipeline));
    });
});

// ─── Structured result API ──────────────────────────────────────

import { resolvePhase, resolvePhaseForTaskMode, resolvePhaseForFocusedAnalysis } from '../services/agent/runtime/runtimeToolPolicy';

describe('resolvePhase (structured result)', () => {
    it('returns tools + phase + label', () => {
        const result = resolvePhase('analyze');
        expect(result.phase).toBe('analyze');
        expect(result.label).toContain('analysis');
        expect(result.tools).toEqual(getToolsForPhase('analyze'));
    });
});

describe('resolvePhaseForTaskMode (structured result)', () => {
    it('maps inspect → explore with metadata', () => {
        const result = resolvePhaseForTaskMode('inspect');
        expect(result.phase).toBe('explore');
        expect(result.tools).toEqual(getToolsForPhase('explore'));
        expect(result.label).toBeTruthy();
    });
});

describe('resolvePhaseForFocusedAnalysis (structured result)', () => {
    it('returns analyze phase (no longer focused_analysis)', () => {
        const result = resolvePhaseForFocusedAnalysis('analysis.pivot_matrix');
        expect(result.phase).toBe('analyze');
        expect(result.tools).toContain('analysis.pivot_matrix');
        expect(result.tools).toContain('analysis.create_plan');
    });
});

// ─── All analysis modes → analyze phase ─────────────────────────

describe('all analysis task modes use analyze phase', () => {
    it('all specialized modes resolve to analyze', () => {
        const modes = ['pivot_matrix', 'period_compare', 'cohort_retention', 'root_cause_breakdown', 'statistical_analysis', 'visualize', 'validate_metric', 'derive_metric'] as const;
        for (const mode of modes) {
            expect(resolveToolPhaseForTaskMode(mode)).toBe('analyze');
        }
    });

    it('inspect/explain resolve to explore (not analyze)', () => {
        expect(resolveToolPhaseForTaskMode('inspect')).toBe('explore');
        expect(resolveToolPhaseForTaskMode('explain')).toBe('explore');
    });
});
