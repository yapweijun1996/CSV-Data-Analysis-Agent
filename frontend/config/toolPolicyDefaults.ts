/**
 * Centralized tool policy configuration.
 *
 * Tool allow/deny lists and stage-group mappings live here so that
 * policy changes require editing exactly one file, not runtime logic.
 */

import type { ToolGroup, ToolPolicy, ToolStage } from '../types';

// --- Default tool policy (allow/deny list) ---

export const DEFAULT_TOOL_POLICY: ToolPolicy = {
    allow: [
        // Analysis
        'analysis.create_plan',
        'analysis.correlation',
        'analysis.pivot_matrix',
        'analysis.period_compare',
        'analysis.cohort_retention',
        'analysis.root_cause_breakdown',
        'analysis.validate_metric_mapping',
        'analysis.presentation_upgrade',

        // Card
        'card.refine',
        'card.aggregate_table',
        'card.add_calculated_column',
        'card.delete',
        'card.review',
        'card.suggestion.apply',
        'card.suggestion.dismiss',

        // UI
        'ui.highlight_card',
        'ui.change_chart_type',
        'ui.show_card_data',
        'ui.filter_card',

        // Cleaning
        'cleaning.resume',
        'cleaning.restart',

        // Data
        'data.mutate',
        'data.query',
        'data.describe',
        'data.value_counts',
        'data.outliers',
        'data.missing',

        // Spreadsheet
        'spreadsheet.filter',

        // Workspace
        'workspace.list',
        'workspace.tree',
        'workspace.read',
        'workspace.search',
        'workspace.grep',
        'workspace.head',
        'workspace.diff',
        'workspace.replace',
        'workspace.write',
        'workspace.append',

        // Conversation
        'conversation.request_clarification',
    ],
    deny: [
        'execute_js_code',
    ],
};

// --- Stage-group allowlist (which tool groups are exposed at each stage) ---

export const STAGE_GROUP_ALLOWLIST: Record<ToolStage, ToolGroup[]> = {
    cleaning: [
        'workspace.inspect', 'workspace.inspect.tree', 'workspace.inspect.diff',
        'workspace.edit',
        'data.mutation', 'data.query', 'data.diagnostic',
        'conversation.clarification',
        'cleaning.inspect', 'cleaning.edit', 'cleaning.verify', 'cleaning.verify.query',
    ],
    analysis: [
        'analysis.plan', 'analysis.validate', 'analysis.statistics',
        'analysis.matrix', 'analysis.compare', 'analysis.cohort', 'analysis.diagnose', 'analysis.presentation',
        'card.aggregate', 'card.mutate', 'card.review',
        'ui.interaction',
        'data.mutation', 'data.query', 'data.diagnostic',
        'spreadsheet.filter',
        'workspace.inspect', 'workspace.inspect.tree', 'workspace.inspect.diff',
        'conversation.clarification',
    ],
    debug: [
        'data.query',
        'workspace.inspect', 'workspace.inspect.tree', 'workspace.inspect.diff',
    ],
};
