import type { AiAction, CsvData, ReportIntakeIr, RuntimeTableAssessment, ToolCallEnvelope, ToolExecutionResult, ToolGroup, ToolName } from '../../../types';
import { WORKSPACE_DATASET_CLEAN_CSV, WORKSPACE_DATASET_RAW_CSV } from '../workspaceFileUtils';
import { validateDataMutatePayload } from '../execution/dataMutateContract';
import { getOperationContractSummary } from '../execution/dataOperationManifest';
import { normalizeDataMutatePayload } from '../execution/dataOperationRunner';
import { buildBuiltinToolRegistry, type ResolvedToolRegistry } from '../tools/toolRegistry';
import { shouldRequireRawFirstInspection, validateOperationsAgainstRawReportContract } from './rawReportContract';

export type CleaningPhase = 'inspect' | 'edit' | 'verify' | 'done' | 'failed';

export type CleaningFailureCode =
    | 'failed_no_edit'
    | 'failed_stalled'
    | 'failed_verification'
    | 'failed_provider_contract';

type ActivePhase = Exclude<CleaningPhase, 'done' | 'failed'>;
type ProviderName = 'google' | 'openai' | 'default';

export type CleaningRuntimeState = {
    phase: CleaningPhase;
    phaseAttempts: Record<ActivePhase, number>;
    lastActionFingerprint: string | null;
    repeatedActionCount: number;
    inspectedRaw: boolean;
    inspectedCleaned: boolean;
    dominantBlockResolved: boolean;
    editApplied: boolean;
    inspectCycles: number;
    mutateCount: number;
    lastMutationSynced: boolean;
    readyForFinalVerify: boolean;
    requiresDiffReview: boolean;
    diffReviewed: boolean;
    verifyCompleted: boolean;
    noProgressReason: string | null;
    /** Whether the raw structure has been inspected by the runtime inspect phase. */
    rawStructureInspected: boolean;
    /** Runtime-confirmed table assessment — the only authority for structure decisions. */
    tableAssessment: RuntimeTableAssessment | null;
    /** Whether the intake provisional staging was accepted by runtime inspect. */
    stagingAccepted: boolean;
    /** Whether cleaned.csv was rebuilt from raw during runtime inspect. */
    stagingRebuiltFromRaw: boolean;
};

const ACTIVE_PHASES: ActivePhase[] = ['inspect', 'edit', 'verify'];
const MAX_PHASE_ATTEMPTS: Record<ActivePhase, number> = {
    inspect: 4,
    edit: 4,
    verify: 2,
};

const stableSerialize = (value: unknown): string => {
    if (value == null || typeof value !== 'object') {
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        return `[${value.map(item => stableSerialize(item)).join(',')}]`;
    }

    const entries = Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`);
    return `{${entries.join(',')}}`;
};

const getWorkspacePath = (action: AiAction) => {
    if (action.type !== 'tool_call') return null;
    const rawPath = action.args?.path;
    return typeof rawPath === 'string' && rawPath.trim() ? rawPath.trim() : null;
};

const getWorkspacePayload = (result: ToolExecutionResult) => {
    const payload = result.payload as { workspace?: Record<string, unknown> } | undefined;
    return payload?.workspace ?? null;
};

const buildEditPhaseOperationFeedback = (action: ToolCallEnvelope): string => {
    const operations = Array.isArray(action.args?.operations) ? action.args.operations : [];
    const missingType = operations.some(operation =>
        operation && typeof operation === 'object' && !Array.isArray(operation)
        && (typeof (operation as Record<string, unknown>).type !== 'string' || !(operation as Record<string, unknown>).type?.toString().trim()),
    );
    const missingReason = operations.some(operation =>
        operation && typeof operation === 'object' && !Array.isArray(operation)
        && (typeof (operation as Record<string, unknown>).reason !== 'string' || !(operation as Record<string, unknown>).reason?.toString().trim()),
    );

    const hints = [
        'Every operation object must include `id`, `type`, and `reason` before its type-specific fields.',
        missingType ? '`id` is only a unique step identifier; it does not replace `type`.' : '',
        missingReason ? 'Include a short `reason` on every operation.' : '',
        'Example: {"id":"drop-top","type":"drop_rows_by_index","reason":"Remove title rows.","indices":[0,1]}',
    ].filter(Boolean);

    return `Edit phase data.mutate must include at least one valid deterministic operation. ${hints.join(' ')}`;
};

const normalizeMutationActionPayload = (action: ToolCallEnvelope) =>
    normalizeDataMutatePayload({
        explanation: action.args?.explanation,
        operations: Array.isArray(action.args?.operations)
            ? action.args.operations
            : (action.args && 'operation' in action.args && action.args.operation !== undefined ? [action.args.operation] : undefined),
        outputColumns: action.args?.outputColumns,
        planStatus: 'operations',
        consistencyIssues: [],
    });

const getMutationOperationCount = (action: ToolCallEnvelope, result?: ToolExecutionResult) => {
    const normalizedPayload = normalizeMutationActionPayload(action);
        if (normalizedPayload.plan?.operations.length) {
            return normalizedPayload.plan.operations.length;
        }

    const observedCount = result?.observation?.detail
        && typeof result.observation.detail === 'object'
        && !Array.isArray(result.observation.detail)
        && typeof (result.observation.detail as Record<string, unknown>).operationCount === 'number'
        ? (result.observation.detail as Record<string, unknown>).operationCount as number
        : null;
    if (observedCount && observedCount > 0) {
        return observedCount;
    }

    const artifactOperations = Array.isArray(result?.artifactMetadata?.operations)
        ? result?.artifactMetadata?.operations.length
        : 0;
    return artifactOperations;
};

export const createCleaningRuntimeState = (): CleaningRuntimeState => ({
    phase: 'inspect',
    phaseAttempts: {
        inspect: 0,
        edit: 0,
        verify: 0,
    },
    lastActionFingerprint: null,
    repeatedActionCount: 0,
    inspectedRaw: false,
    inspectedCleaned: false,
    dominantBlockResolved: false,
    editApplied: false,
    inspectCycles: 0,
    mutateCount: 0,
    lastMutationSynced: false,
    readyForFinalVerify: false,
    requiresDiffReview: false,
    diffReviewed: false,
    verifyCompleted: false,
    noProgressReason: null,
    rawStructureInspected: false,
    tableAssessment: null,
    stagingAccepted: false,
    stagingRebuiltFromRaw: false,
});

const validateCleaningMutationAgainstRawReport = (
    action: AiAction,
    rawData: CsvData | null | undefined,
    rawIntakeIr?: ReportIntakeIr | null,
): string | null => {
    if (!rawData || action.type !== 'tool_call' || action.toolName !== 'data.mutate') {
        return null;
    }
    const normalizedPayload = normalizeMutationActionPayload(action);
    return validateOperationsAgainstRawReportContract(rawData, normalizedPayload.plan?.operations ?? [], rawIntakeIr);
};

export const getAllowedCleaningToolNames = (
    phase: ActivePhase,
    provider: ProviderName,
    registry?: Pick<ResolvedToolRegistry, 'groups'>,
): Set<ToolName> => {
    const resolvedRegistry = registry ?? buildBuiltinToolRegistry([]);
    return getAllowedCleaningToolNamesFromRegistry(resolvedRegistry, phase, provider);
};

export const getCleaningPhaseInstruction = (phase: ActivePhase, provider: ProviderName): string => {
    switch (phase) {
        case 'inspect':
            return `Current phase: inspect. Read ${WORKSPACE_DATASET_RAW_CSV} first to confirm the true table structure, then read ${WORKSPACE_DATASET_CLEAN_CSV} to compare against the provisional staging. cleaned.csv may only be an intake provisional result — do not trust it as canonical until runtime structure is confirmed. Do not edit files in this phase. Only use read-only workspace retrieval tools such as workspace.read, workspace.head, workspace.grep, workspace.search, or workspace.tree.`;
        case 'edit':
            return `Current phase: edit. You must apply one or more deterministic data.mutate operations to ${WORKSPACE_DATASET_CLEAN_CSV} this turn. Text-level file editing is forbidden in this phase. Do not read files in this phase.`;
        case 'verify':
            return provider === 'google'
                ? `Current phase: verify. Confirm the final cleaned result with a read-only inspection of ${WORKSPACE_DATASET_CLEAN_CSV}. Do not edit files.`
                : `Current phase: verify. Confirm the final cleaned result with a read-only inspection of ${WORKSPACE_DATASET_CLEAN_CSV}. You may use data.query if needed. Do not edit files.`;
    }
};

export const noteCleaningPhaseAttempt = (state: CleaningRuntimeState): CleaningRuntimeState => {
    if (!ACTIVE_PHASES.includes(state.phase as ActivePhase)) {
        return state;
    }

    const phase = state.phase as ActivePhase;
    return {
        ...state,
        phaseAttempts: {
            ...state.phaseAttempts,
            [phase]: state.phaseAttempts[phase] + 1,
        },
    };
};

export const exceedsCleaningPhaseAttempts = (state: CleaningRuntimeState): boolean => {
    if (!ACTIVE_PHASES.includes(state.phase as ActivePhase)) {
        return false;
    }
    const phase = state.phase as ActivePhase;
    return state.phaseAttempts[phase] > MAX_PHASE_ATTEMPTS[phase];
};

export const hasRemainingCleaningPhaseAttempts = (
    state: CleaningRuntimeState,
    phase: ActivePhase,
): boolean => state.phaseAttempts[phase] < MAX_PHASE_ATTEMPTS[phase];

export const getCleaningRetryTelemetry = (
    state: CleaningRuntimeState,
    turn: number,
    maxTurns: number,
): {
    phaseAttempt: number | null;
    maxPhaseAttempts: number | null;
    remainingPhaseAttempts: number | null;
    remainingTurns: number;
} => {
    if (!ACTIVE_PHASES.includes(state.phase as ActivePhase)) {
        return {
            phaseAttempt: null,
            maxPhaseAttempts: null,
            remainingPhaseAttempts: null,
            remainingTurns: Math.max(maxTurns - turn, 0),
        };
    }
    const phase = state.phase as ActivePhase;
    const phaseAttempt = state.phaseAttempts[phase];
    const maxPhaseAttempts = MAX_PHASE_ATTEMPTS[phase];
    return {
        phaseAttempt,
        maxPhaseAttempts,
        remainingPhaseAttempts: Math.max(maxPhaseAttempts - phaseAttempt, 0),
        remainingTurns: Math.max(maxTurns - turn, 0),
    };
};

export const validateCleaningActionForPhase = (
    action: AiAction,
    state: CleaningRuntimeState,
    provider: ProviderName,
    rawData?: CsvData | null,
    rawIntakeIr?: ReportIntakeIr | null,
): string | null => {
    if (action.type === 'assistant_message') {
        return state.phase === 'verify'
            ? null
            : `Summary messages are only allowed after verification. Stay in the ${state.phase} phase and use tools.`;
    }

    const allowed = getAllowedCleaningToolNames(state.phase as ActivePhase, provider);
    if (!allowed.has(action.toolName)) {
        return `Tool ${action.toolName} is not allowed during the ${state.phase} phase.`;
    }

    const path = getWorkspacePath(action);
    const requiresRawFirstInspection = shouldRequireRawFirstInspection(rawData, rawIntakeIr);
    if (state.phase === 'inspect') {
        if (requiresRawFirstInspection) {
            if (!state.inspectedRaw) {
                if (action.toolName !== 'workspace.read' || path !== WORKSPACE_DATASET_RAW_CSV) {
                    return `Inspect phase must begin by reading ${WORKSPACE_DATASET_RAW_CSV} for this report-shaped dataset before inspecting ${WORKSPACE_DATASET_CLEAN_CSV}.`;
                }
            } else if (!state.inspectedCleaned) {
                if (action.toolName !== 'workspace.read' || path !== WORKSPACE_DATASET_CLEAN_CSV) {
                    return `Inspect phase must read ${WORKSPACE_DATASET_CLEAN_CSV} immediately after ${WORKSPACE_DATASET_RAW_CSV} before using ${action.toolName}.`;
                }
            }
        } else {
            if (action.toolName === 'workspace.read' && !state.inspectedCleaned && path !== WORKSPACE_DATASET_CLEAN_CSV) {
                return `Inspect phase must begin by reading ${WORKSPACE_DATASET_CLEAN_CSV}. Do not inspect ${WORKSPACE_DATASET_RAW_CSV} first.`;
            }
            if (['workspace.search', 'workspace.grep', 'workspace.head', 'workspace.tree'].includes(action.toolName) && !state.inspectedCleaned) {
                return `Read ${WORKSPACE_DATASET_CLEAN_CSV} before using ${action.toolName}.`;
            }
        }
    }

    if (state.phase === 'edit' && action.toolName.startsWith('workspace.') && path !== WORKSPACE_DATASET_CLEAN_CSV) {
        return `Edit phase may only modify ${WORKSPACE_DATASET_CLEAN_CSV} through data.mutate.`;
    }

    if (state.phase === 'edit' && action.toolName === 'data.mutate') {
        const mutationErrors = validateDataMutatePayload(action.args ?? {});
        if (mutationErrors.length > 0) {
            return `Edit phase data.mutate validation errors: ${mutationErrors.join(' ')}`;
        }

        const normalizedPayload = normalizeMutationActionPayload(action);
        if (!normalizedPayload.plan || normalizedPayload.plan.operations.length === 0) {
            return buildEditPhaseOperationFeedback(action);
        }
        if (normalizedPayload.rawOperationCount !== normalizedPayload.plan.operations.length) {
            return `Edit phase data.mutate included malformed operations. Every operation must include \`id\`, \`type\`, and \`reason\`, then the type-specific fields. Supported operation contracts: ${getCleaningOperationContractSummary().join('; ')}.`;
        }

        // Runtime assessment enforcement: when a tableAssessment exists,
        // structural operations must respect its status.
        // When no tableAssessment exists (legacy/LLM-guided flow), skip this check.
        if (state.tableAssessment) {
            const hasStructuralOp = normalizedPayload.plan.operations.some(
                op => op.type === 'promote_header_row' || op.type === 'unpivot_columns',
            );
            if (hasStructuralOp && state.tableAssessment.status === 'ambiguous') {
                return 'RuntimeTableAssessment is ambiguous — structural operations blocked. Continue inspect phase to resolve ambiguity.';
            }
            if (hasStructuralOp && state.tableAssessment.status === 'rejected') {
                return 'RuntimeTableAssessment rejected the current table structure. Structural operations are blocked.';
            }
            // Block reshape when assessment says no reshape needed
            if (state.tableAssessment.status === 'confirmed'
                && !state.tableAssessment.requiresReshape
                && normalizedPayload.plan.operations.some(op => op.type === 'unpivot_columns')) {
                return 'RuntimeTableAssessment confirms requiresReshape=false. unpivot_columns is not allowed for this dataset.';
            }
        }

        const semanticValidationError = validateCleaningMutationAgainstRawReport(action, rawData, rawIntakeIr);
        if (semanticValidationError) {
            return semanticValidationError;
        }
    }

    if (state.phase === 'verify' && action.toolName.startsWith('workspace.') && path !== WORKSPACE_DATASET_CLEAN_CSV) {
        return `Verify phase may only inspect ${WORKSPACE_DATASET_CLEAN_CSV}.`;
    }

    return null;
};

export const trackCleaningProgress = (
    state: CleaningRuntimeState,
    action: AiAction,
    result: ToolExecutionResult,
): CleaningRuntimeState => {
    const fingerprint = action.type === 'tool_call'
        ? `${action.toolName}:${stableSerialize(action.args ?? {})}`
        : `assistant_message:${stableSerialize({ message: action.message })}`;
    const repeatedActionCount = state.lastActionFingerprint === fingerprint
        ? state.repeatedActionCount + 1
        : 1;

    let inspectedCleaned = state.inspectedCleaned;
    let inspectedRaw = state.inspectedRaw;
    let dominantBlockResolved = state.dominantBlockResolved;
    let editApplied = state.editApplied;
    let inspectCycles = state.inspectCycles;
    let mutateCount = state.mutateCount;
    let lastMutationSynced = state.lastMutationSynced;
    let readyForFinalVerify = state.readyForFinalVerify;
    let requiresDiffReview = state.requiresDiffReview;
    let diffReviewed = state.diffReviewed;
    let verifyCompleted = state.verifyCompleted;
    let noProgressReason: string | null = null;

    const workspace = getWorkspacePayload(result);
    const workspacePath = typeof workspace?.path === 'string' ? workspace.path : getWorkspacePath(action);

    if (action.type === 'tool_call' && result.status === 'success') {
        if (action.toolName === 'workspace.read' && workspacePath === WORKSPACE_DATASET_RAW_CSV) {
            inspectedRaw = true;
        }
        if (action.toolName === 'workspace.read' && workspacePath === WORKSPACE_DATASET_CLEAN_CSV) {
            inspectedCleaned = true;
            if (state.phase === 'inspect') {
                inspectCycles += 1;
            }
        }

        if (state.phase === 'verify' && (
            action.toolName === 'data.query'
            || (action.toolName === 'workspace.read' && workspacePath === WORKSPACE_DATASET_CLEAN_CSV)
            || (action.toolName === 'workspace.search' && workspacePath === WORKSPACE_DATASET_CLEAN_CSV)
            || (action.toolName === 'workspace.grep' && workspacePath === WORKSPACE_DATASET_CLEAN_CSV)
            || (action.toolName === 'workspace.head' && workspacePath === WORKSPACE_DATASET_CLEAN_CSV)
        )) {
            verifyCompleted = true;
        }

        if (action.toolName === 'data.mutate') {
            const operationCount = getMutationOperationCount(action, result);
            if (operationCount > 0) {
                dominantBlockResolved = dominantBlockResolved || Boolean(
                    normalizeMutationActionPayload(action).plan?.operations.some(operation => operation.type === 'promote_header_row'),
                );
                editApplied = true;
                mutateCount += 1;
                lastMutationSynced = true;
                readyForFinalVerify = false;
                requiresDiffReview = false;
                diffReviewed = false;
            } else {
                noProgressReason = 'data.mutate completed without deterministic operations.';
            }
        }

        if (repeatedActionCount >= 2 && action.toolName === 'workspace.read') {
            noProgressReason = workspacePath === WORKSPACE_DATASET_RAW_CSV
                ? `Repeated ${WORKSPACE_DATASET_RAW_CSV} inspection without moving to edits.`
                : 'Repeated identical workspace.read without cleaning progress.';
        }
    }

    // Track rawStructureInspected: set when both raw and cleaned have been inspected
    const rawStructureInspected = state.rawStructureInspected || (inspectedRaw && inspectedCleaned);

    return {
        ...state,
        lastActionFingerprint: fingerprint,
        repeatedActionCount,
        inspectedRaw,
        inspectedCleaned,
        dominantBlockResolved,
        editApplied,
        inspectCycles,
        mutateCount,
        lastMutationSynced,
        readyForFinalVerify,
        requiresDiffReview,
        diffReviewed,
        verifyCompleted,
        noProgressReason,
        rawStructureInspected,
    };
};

export const transitionCleaningPhase = (state: CleaningRuntimeState, phase: CleaningPhase): CleaningRuntimeState => ({
    ...state,
    phase,
    noProgressReason: null,
    lastActionFingerprint: null,
    repeatedActionCount: 0,
    inspectedRaw: state.inspectedRaw,
    inspectedCleaned: phase === 'inspect' ? false : state.inspectedCleaned,
    readyForFinalVerify: phase === 'verify' ? true : state.readyForFinalVerify,
    verifyCompleted: false,
});

export const shouldReinspectAfterReplaceFailure = (detail: string): boolean =>
    detail.includes(`replace target not found in ${WORKSPACE_DATASET_CLEAN_CSV}`);

export const restartCleaningFromInspect = (state: CleaningRuntimeState): CleaningRuntimeState => ({
    ...transitionCleaningPhase(state, 'inspect'),
    inspectedCleaned: false,
    phaseAttempts: {
        ...state.phaseAttempts,
        inspect: 0,
    },
});

/**
 * Build a RuntimeTableAssessment by cross-validating intake IR against the
 * actual raw and cleaned data observed during the inspect phase.
 *
 * This is NOT a copy of intake IR — it independently verifies:
 * 1. Whether the proposed header row in raw data actually looks like a header
 * 2. Whether the body region contains substantive data rows
 * 3. Whether cleaned.csv body count matches the raw body region
 * 4. Whether noise rows (blank, footer, title) are correctly identified
 * 5. Whether the raw data supports reshape vs cleanup-only
 *
 * The assessment may CONFIRM, mark as AMBIGUOUS, or REJECT the intake proposal.
 */
export const buildRuntimeTableAssessmentFromIr = (
    rawIntakeIr: ReportIntakeIr | null | undefined,
    rawData: CsvData | null | undefined,
    cleanedData: CsvData | null | undefined,
): RuntimeTableAssessment | null => {
    if (!rawIntakeIr) return null;

    const table = rawIntakeIr.provisionalTable;
    const rawRows = rawIntakeIr.normalizedRows;

    // No provisional table → ambiguous
    if (!table) {
        return {
            source: 'raw_inspect',
            status: 'ambiguous',
            headerRowIndex: -1,
            headerLayerRowIndexes: [],
            bodyStartIndex: -1,
            summaryStartIndex: -1,
            repeatedHeaderRowIndexes: [],
            parameterRowIndexes: [],
            noiseRowIndexes: [],
            requiresReshape: false,
            requiresCleanupOnly: false,
            reason: 'No provisional table boundary from intake; structure is ambiguous.',
        };
    }

    const reasons: string[] = [];

    // ── Cross-validate header row against raw data ──
    const proposedHeaderRow = rawRows[table.headerRowIndex];
    let headerConfirmed = false;
    if (proposedHeaderRow) {
        const nonEmptyCells = proposedHeaderRow.filter(v => String(v ?? '').trim().length > 0);
        const numericCells = nonEmptyCells.filter(v => /^-?\d[\d,]*(?:\.\d+)?$/.test(String(v).trim()));
        // A header row should be mostly non-numeric text
        const textRatio = nonEmptyCells.length > 0
            ? (nonEmptyCells.length - numericCells.length) / nonEmptyCells.length
            : 0;
        // Sparse report headers (e.g. ranking reports with spacer columns)
        // may have as few as 2 visible header cells — still valid.
        headerConfirmed = nonEmptyCells.length >= 2 && textRatio >= 0.45;
        if (headerConfirmed) {
            reasons.push(`Header row ${table.headerRowIndex} confirmed: ${nonEmptyCells.length} non-empty cells, ${Math.round(textRatio * 100)}% text`);
        } else {
            reasons.push(`Header row ${table.headerRowIndex} rejected: ${nonEmptyCells.length} cells, only ${Math.round(textRatio * 100)}% text`);
        }
    } else {
        reasons.push(`Header row ${table.headerRowIndex} out of bounds (${rawRows.length} raw rows)`);
    }

    // ── Cross-validate body region against raw data ──
    const bodyEndIndex = table.summaryStartIndex > table.bodyStartIndex
        ? table.summaryStartIndex
        : rawRows.length;
    const rawBodyRows = rawRows.slice(table.bodyStartIndex, bodyEndIndex);
    const substantiveBodyRows = rawBodyRows.filter(row => {
        const nonEmpty = row.filter(v => String(v ?? '').trim().length > 0);
        return nonEmpty.length >= 2;
    });
    const bodyConfirmed = substantiveBodyRows.length >= 1;
    reasons.push(`Body region rows ${table.bodyStartIndex}-${bodyEndIndex}: ${substantiveBodyRows.length} substantive of ${rawBodyRows.length} total`);

    // ── Detect staging conflict ──
    const cleanedBodyCount = cleanedData?.data.length ?? 0;
    const stagingConflict = substantiveBodyRows.length > 0 && cleanedBodyCount > 0
        && Math.abs(substantiveBodyRows.length - cleanedBodyCount) > Math.max(2, substantiveBodyRows.length * 0.15);
    if (stagingConflict) {
        reasons.push(`Staging conflict: raw body has ${substantiveBodyRows.length} substantive rows but cleaned has ${cleanedBodyCount}`);
    }

    // ── Re-detect noise rows from raw data directly ──
    const noiseRowSet = new Set<number>();
    rawRows.forEach((row, index) => {
        if (index === table.headerRowIndex) return;
        if (table.headerLayerRowIndexes.includes(index)) return;
        if (index >= table.bodyStartIndex && index < bodyEndIndex) return;
        const nonEmpty = row.filter(v => String(v ?? '').trim().length > 0);
        if (nonEmpty.length === 0) {
            noiseRowSet.add(index); // blank
            return;
        }
        if (index < table.bodyStartIndex) {
            noiseRowSet.add(index); // pre-header metadata/title/parameter
        }
        if (index >= bodyEndIndex) {
            noiseRowSet.add(index); // post-body summary/footer
        }
    });
    // Also add repeated headers within body as noise
    table.repeatedHeaderRowIndexes.forEach(i => noiseRowSet.add(i));
    const noiseRowIndexes = [...noiseRowSet].sort((a, b) => a - b);

    // ── Determine structure requirements from raw data ──
    const hasMultiHeader = table.headerLayerRowIndexes.length > 0;
    const hasRepeatedHeader = table.repeatedHeaderRowIndexes.length > 0;

    // Verify multi-header by checking that layer rows are actually non-numeric text bands
    let multiHeaderConfirmed = false;
    if (hasMultiHeader) {
        const layerRowsValid = table.headerLayerRowIndexes.every(idx => {
            const row = rawRows[idx];
            if (!row) return false;
            const nonEmpty = row.filter(v => String(v ?? '').trim().length > 0);
            const numericCount = nonEmpty.filter(v => /^-?\d[\d,]*(?:\.\d+)?$/.test(String(v).trim())).length;
            return nonEmpty.length >= 2 && numericCount < nonEmpty.length * 0.5;
        });
        multiHeaderConfirmed = layerRowsValid;
        reasons.push(multiHeaderConfirmed
            ? `Multi-header layers confirmed at rows [${table.headerLayerRowIndexes.join(', ')}]`
            : `Multi-header layers at [${table.headerLayerRowIndexes.join(', ')}] failed validation`);
    }

    // Verify repeated headers by checking that they match the header row pattern
    let repeatedHeaderConfirmed = false;
    if (hasRepeatedHeader && proposedHeaderRow) {
        const headerValues = new Set(proposedHeaderRow.map(v => String(v ?? '').trim().toLowerCase()).filter(Boolean));
        repeatedHeaderConfirmed = table.repeatedHeaderRowIndexes.some(idx => {
            const row = rawRows[idx];
            if (!row) return false;
            const rowValues = row.map(v => String(v ?? '').trim().toLowerCase()).filter(Boolean);
            const overlap = rowValues.filter(v => headerValues.has(v)).length;
            return overlap >= Math.max(2, Math.floor(headerValues.size * 0.4));
        });
        reasons.push(repeatedHeaderConfirmed
            ? `Repeated header confirmed at rows [${table.repeatedHeaderRowIndexes.join(', ')}]`
            : `Repeated header at [${table.repeatedHeaderRowIndexes.join(', ')}] could not be verified`);
    }

    const requiresReshape = multiHeaderConfirmed || repeatedHeaderConfirmed;
    const hasStructuralNoise = noiseRowIndexes.length > 0;
    const requiresCleanupOnly = hasStructuralNoise && !requiresReshape;

    // ── Determine overall status ──
    let status: RuntimeTableAssessment['status'];
    if (!headerConfirmed || !bodyConfirmed) {
        status = 'ambiguous';
        reasons.push('Assessment ambiguous: header or body not confirmed from raw data');
    } else if (stagingConflict) {
        status = 'ambiguous';
        reasons.push('Assessment ambiguous: staging conflict between raw and cleaned row counts');
    } else if (hasMultiHeader && !multiHeaderConfirmed) {
        status = 'ambiguous';
        reasons.push('Assessment ambiguous: intake claimed multi-header but raw data does not confirm');
    } else if (hasRepeatedHeader && !repeatedHeaderConfirmed) {
        status = 'ambiguous';
        reasons.push('Assessment ambiguous: intake claimed repeated headers but raw data does not confirm');
    } else {
        status = 'confirmed';
        reasons.push('Structure confirmed by cross-validation against raw data');
    }

    return {
        source: 'raw_inspect',
        status,
        headerRowIndex: table.headerRowIndex,
        headerLayerRowIndexes: multiHeaderConfirmed ? [...table.headerLayerRowIndexes] : [],
        bodyStartIndex: table.bodyStartIndex,
        summaryStartIndex: table.summaryStartIndex,
        repeatedHeaderRowIndexes: repeatedHeaderConfirmed ? [...table.repeatedHeaderRowIndexes] : [],
        parameterRowIndexes: [...table.parameterRowIndexes],
        noiseRowIndexes,
        requiresReshape,
        requiresCleanupOnly,
        reason: reasons.join('; ') + '.',
    };
};

export const buildCleaningFailureMessage = (
    code: CleaningFailureCode,
    detail?: string | null,
): { explanation: string; chatMessage: string } => {
    const suffix = detail ? ` ${detail}` : '';
    switch (code) {
        case 'failed_stalled':
            return {
                explanation: `AI cleaning stalled in runtime. cleaned.csv remains unchanged after repeated inspection-only actions.${suffix}`,
                chatMessage: `Cleaning failed because the runtime detected a repeated inspection loop. \`cleaned.csv\` remains unchanged.${suffix}`,
            };
        case 'failed_verification':
            return {
                explanation: `AI cleaning modified cleaned.csv but verification failed. Review the cleaned dataset before analysis.${suffix}`,
                chatMessage: `Cleaning failed verification. \`cleaned.csv\` was edited, but the final shape is still not acceptable.${suffix}`,
            };
        case 'failed_provider_contract':
            return {
                explanation: `AI cleaning could not start because the provider rejected the cleaning tool contract.${suffix}`,
                chatMessage: `Cleaning failed because the model provider rejected the cleaning tool contract.${suffix}`,
            };
        case 'failed_no_edit':
        default:
            return {
                explanation: `AI cleaning only performed inspection. No cleaning edits were applied to cleaned.csv.${suffix}`,
                chatMessage: `Cleaning stopped after inspection only. No edits were written to \`cleaned.csv\`.${suffix}`,
            };
    }
};

// --- Merged from cleaningToolContract.ts ---

const CLEANING_PHASE_GROUPS: Record<'inspect' | 'edit' | 'verify', ToolGroup[]> = {
    inspect: ['cleaning.inspect', 'data.diagnostic'],
    edit: ['cleaning.edit'],
    verify: ['cleaning.verify', 'data.diagnostic'],
};

const PROVIDER_VERIFY_GROUPS: Partial<Record<ProviderName, ToolGroup[]>> = {
    openai: ['cleaning.verify.query'],
    google: [],
};

export const getAllowedCleaningToolNamesFromRegistry = (
    registry: Pick<ResolvedToolRegistry, 'groups'>,
    phase: 'inspect' | 'edit' | 'verify',
    provider: ProviderName,
): Set<ToolName> => {
    const groups = [
        ...CLEANING_PHASE_GROUPS[phase],
        ...(phase === 'verify' ? (PROVIDER_VERIFY_GROUPS[provider] ?? []) : []),
    ];
    return new Set(groups.flatMap(group => registry.groups[group] ?? []));
};

export const getCleaningOperationContractSummary = () =>
    getOperationContractSummary(['cleaning']);

// --- Merged from cleaningOutcomeReducer.ts ---

const buildActionFingerprint = (action: AiAction) =>
    action.type === 'tool_call'
        ? `${action.toolName}:${JSON.stringify(action.args ?? {})}`
        : `assistant_message:${action.message}`;

export const reduceCleaningInvalidAction = (
    runtime: CleaningRuntimeState,
    action: AiAction,
): CleaningRuntimeState => {
    const fingerprint = buildActionFingerprint(action);
    return runtime.lastActionFingerprint === fingerprint
        ? {
            ...runtime,
            repeatedActionCount: runtime.repeatedActionCount + 1,
            noProgressReason: `Repeated invalid ${action.type === 'tool_call' ? action.toolName : 'assistant_message'} action during the ${runtime.phase} phase.`,
        }
        : {
            ...runtime,
            lastActionFingerprint: fingerprint,
            repeatedActionCount: 1,
            noProgressReason: null,
        };
};

export const reduceCleaningActionResult = (
    runtime: CleaningRuntimeState,
    action: AiAction,
    result: ToolExecutionResult,
) => trackCleaningProgress(runtime, action, result);
