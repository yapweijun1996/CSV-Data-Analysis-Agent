/**
 * Shared test factories for types that have required fields prone to drift.
 * Use these instead of inline object literals to prevent repeated breakage
 * when new required fields are added to core interfaces.
 */

import type {
    MetricQualityDecision,
    DatasetHeaderSemantics,
    RuntimeTableAssessment,
} from '../types';
import type { ActiveSpreadsheetFilter } from '../types/spreadsheet';
import type { AgentTurn, AgentBudgetStatus } from '../types/runtime';

// ---------------------------------------------------------------------------
// MetricQualityDecision
// ---------------------------------------------------------------------------

export const makeMetricQualityDecision = (
    overrides: Partial<MetricQualityDecision> & Pick<MetricQualityDecision, 'column'>,
): MetricQualityDecision => ({
    action: 'allow',
    reasonCodes: [],
    detail: '',
    missingRate: 0,
    hasFormattedNumbers: false,
    ...overrides,
});

// ---------------------------------------------------------------------------
// ActiveSpreadsheetFilter
// ---------------------------------------------------------------------------

export const makeActiveSpreadsheetFilter = (
    overrides: Partial<ActiveSpreadsheetFilter> & Pick<ActiveSpreadsheetFilter, 'requestId'>,
): ActiveSpreadsheetFilter => ({
    origin: 'chat',
    query: '',
    operation: { type: 'filter_rows', id: '', reason: '', predicates: [] },
    observation: {
        selectedColumn: null,
        operator: null,
        value: null,
        matchedRowCount: 0,
        previewRows: [],
    },
    finalReply: '',
    appliedAt: new Date(),
    ...overrides,
});

// ---------------------------------------------------------------------------
// AgentTurn
// ---------------------------------------------------------------------------

const DEFAULT_BUDGET_STATUS: AgentBudgetStatus = {
    maxSteps: 10,
    stepsUsed: 0,
    retryCounts: {},
    exhausted: false,
};

export const makeAgentTurn = (
    overrides: Partial<AgentTurn> & Pick<AgentTurn, 'turnId'>,
): AgentTurn => ({
    userMessage: '',
    status: 'running',
    startedAt: new Date(),
    budgetStatus: DEFAULT_BUDGET_STATUS,
    steps: [],
    ...overrides,
});

// ---------------------------------------------------------------------------
// DatasetHeaderSemantics
// ---------------------------------------------------------------------------

export const makeDatasetHeaderSemantics = (
    overrides: Partial<DatasetHeaderSemantics>,
): DatasetHeaderSemantics => ({
    reportTitle: null,
    reportType: 'unknown',
    headerRoleHints: [],
    scopeHints: {},
    businessTerminology: [],
    headerConfidence: 0,
    reason: '',
    ...overrides,
});

// ---------------------------------------------------------------------------
// RuntimeTableAssessment
// ---------------------------------------------------------------------------

export const makeRuntimeTableAssessment = (
    overrides: Partial<RuntimeTableAssessment>,
): RuntimeTableAssessment => ({
    source: 'raw_inspect',
    status: 'confirmed',
    headerRowIndex: 0,
    headerLayerRowIndexes: [],
    bodyStartIndex: 1,
    summaryStartIndex: -1,
    repeatedHeaderRowIndexes: [],
    parameterRowIndexes: [],
    noiseRowIndexes: [],
    requiresReshape: false,
    requiresCleanupOnly: false,
    reason: '',
    ...overrides,
});
