import type { CorrelationFields } from '../../types';

type CorrelationState = {
    sessionId?: string;
    currentDatasetId?: string | null;
    activeTurn?: {
        runId?: string;
        turnId?: string;
        steps?: Array<{ stepId?: string; toolCallId?: string }>;
    } | null;
    cleaningRun?: {
        runId?: string;
    } | null;
    activeSpreadsheetFilter?: {
        requestId?: string;
    } | null;
};

const normalizeValue = <T extends string | null | undefined>(value: T): Exclude<T, undefined> | undefined => {
    if (value === undefined) return undefined;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return (trimmed ? trimmed : undefined) as Exclude<T, undefined> | undefined;
    }
    return value as Exclude<T, undefined>;
};

export const buildCorrelationFields = (
    state: CorrelationState,
    overrides: CorrelationFields = {},
): CorrelationFields => {
    const activeTurn = state.activeTurn ?? null;
    const activeStep = activeTurn?.steps?.at(-1);
    return {
        sessionId: normalizeValue(overrides.sessionId ?? state.sessionId),
        datasetId: normalizeValue(overrides.datasetId ?? state.currentDatasetId ?? undefined),
        runId: normalizeValue(overrides.runId ?? activeTurn?.runId),
        turnId: normalizeValue(overrides.turnId ?? activeTurn?.turnId),
        stepId: normalizeValue(overrides.stepId ?? activeStep?.stepId),
        toolCallId: normalizeValue(overrides.toolCallId ?? activeStep?.toolCallId ?? activeStep?.stepId),
        cleaningRunId: normalizeValue(overrides.cleaningRunId ?? state.cleaningRun?.runId),
        requestId: normalizeValue(overrides.requestId ?? state.activeSpreadsheetFilter?.requestId),
    };
};

export const toCorrelationRecord = (fields: CorrelationFields | null | undefined) => ({
    sessionId: fields?.sessionId ?? null,
    datasetId: fields?.datasetId ?? null,
    runId: fields?.runId ?? null,
    turnId: fields?.turnId ?? null,
    stepId: fields?.stepId ?? null,
    toolCallId: fields?.toolCallId ?? null,
    cleaningRunId: fields?.cleaningRunId ?? null,
    requestId: fields?.requestId ?? null,
});

export const extractCorrelationFields = (value: Partial<CorrelationFields> | null | undefined): CorrelationFields => ({
    sessionId: normalizeValue(value?.sessionId),
    datasetId: normalizeValue(value?.datasetId ?? undefined),
    runId: normalizeValue(value?.runId),
    turnId: normalizeValue(value?.turnId),
    stepId: normalizeValue(value?.stepId),
    toolCallId: normalizeValue(value?.toolCallId),
    cleaningRunId: normalizeValue(value?.cleaningRunId),
    requestId: normalizeValue(value?.requestId),
});

export type CorrelationGroupType = 'request' | 'cleaning_run' | 'step' | 'turn';

export const getCorrelationGroup = (
    fields: Partial<CorrelationFields> | null | undefined,
): { id: string; type: CorrelationGroupType } | null => {
    const correlation = extractCorrelationFields(fields);
    if (correlation.requestId) {
        return { id: correlation.requestId, type: 'request' };
    }
    if (correlation.cleaningRunId) {
        return { id: correlation.cleaningRunId, type: 'cleaning_run' };
    }
    if (correlation.stepId) {
        return { id: correlation.stepId, type: 'step' };
    }
    if (correlation.turnId) {
        return { id: correlation.turnId, type: 'turn' };
    }
    return null;
};
