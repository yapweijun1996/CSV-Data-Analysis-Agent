/**
 * Temporal grain preservation utilities for topic processing.
 *
 * Detects when SQL evidence queries collapse full-date columns to
 * day-of-month values and provides planning guardrails to prevent it.
 */

import type { AppStore } from '../../../store/useAppStore';
import type { CsvData, ColumnProfile, RuntimeSemanticUnderstanding } from '../../../types';
import type { buildEvidenceResultSummary } from '../execution/sqlCardExecutor';

// ─── Scalar normalization helpers ──────────────────────────────

const FULL_DATE_VALUE_PATTERN = /^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/;
const DAY_OF_MONTH_PATTERN = /^(?:[1-9]|[12]\d|3[01])$/;

export const normalizeScalarText = (value: unknown) => {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
};

export const isFullDateValue = (value: unknown) =>
    typeof value === 'string' && FULL_DATE_VALUE_PATTERN.test(value.trim());

export const isDayOfMonthValue = (value: unknown) =>
    DAY_OF_MONTH_PATTERN.test(normalizeScalarText(value) ?? '');

// ─── Core detection ────────────────────────────────────────────

/**
 * Detects when temporal data loses precision in evidence query results.
 * E.g. source has "2026-03-15" but preview collapsed to "15" (day of month).
 */
export const detectTemporalGrainCollapse = (
    data: CsvData,
    groupByColumns: string[],
    semanticUnderstanding: RuntimeSemanticUnderstanding,
    evidenceSummary: ReturnType<typeof buildEvidenceResultSummary>,
    columnProfiles: AppStore['columnProfiles'],
) => {
    if (groupByColumns.length === 0 || evidenceSummary.previewRows.length === 0) {
        return null;
    }

    for (const column of groupByColumns) {
        const profile = columnProfiles.find(candidate => candidate.name === column);
        const isTimeLike = semanticUnderstanding.timeGrains.includes(column)
            || evidenceSummary.timeColumns.includes(column)
            || profile?.type === 'date'
            || profile?.type === 'time';
        if (!isTimeLike) {
            continue;
        }

        const sourceSamples = data.data
            .map(row => row[column])
            .map(normalizeScalarText)
            .filter((value): value is string => Boolean(value))
            .slice(0, 50);
        const previewValues = evidenceSummary.previewRows
            .map(row => row[column])
            .map(normalizeScalarText)
            .filter((value): value is string => Boolean(value));

        if (sourceSamples.length === 0 || previewValues.length === 0) {
            continue;
        }

        const sourceHasFullDates = sourceSamples.some(isFullDateValue);
        const previewCollapsedToDay = previewValues.every(isDayOfMonthValue);
        const previewStillHasFullDates = previewValues.some(isFullDateValue);

        if (sourceHasFullDates && previewCollapsedToDay && !previewStillHasFullDates) {
            return {
                column,
                sourceExample: sourceSamples.find(isFullDateValue) ?? sourceSamples[0],
                previewExample: previewValues[0],
            };
        }
    }

    return null;
};

// ─── Planning guardrails ───────────────────────────────────────

/**
 * Creates guidance text to preserve temporal grain in SQL planning.
 * Injected into planner context when full-date columns are detected.
 */
export const buildTemporalPlanningGuardrail = (
    data: CsvData,
    semanticUnderstanding: RuntimeSemanticUnderstanding,
    columnProfiles: AppStore['columnProfiles'],
) => {
    const guardedColumns = columnProfiles
        .filter(profile =>
            (profile.type === 'date' || profile.type === 'time' || semanticUnderstanding.timeGrains.includes(profile.name))
            && data.data.some(row => isFullDateValue(row[profile.name])),
        )
        .map(profile => ({
            name: profile.name,
            example: data.data
                .map(row => row[profile.name])
                .find(isFullDateValue) ?? null,
        }))
        .filter(entry => entry.example);

    if (guardedColumns.length === 0) {
        return undefined;
    }

    const examples = guardedColumns
        .map(entry => `"${entry.name}" (e.g. "${entry.example}")`)
        .join(', ');

    return `Temporal columns ${examples} contain full date values. Preserve full-date grain in SQL planning and grouping. Do not collapse these columns to day-of-month values such as 1-31 unless the user explicitly asks for a monthly-cycle or day-of-month analysis.`;
};

/**
 * Rewrites topics referencing "day of month" to use a specific
 * full-date column name, preventing grain collapse.
 */
export const normalizeTemporalTopic = (
    topic: string,
    data: CsvData,
    semanticUnderstanding: RuntimeSemanticUnderstanding,
    columnProfiles: AppStore['columnProfiles'],
) => {
    if (!/\bday of (?:the )?month\b/i.test(topic)) {
        return null;
    }

    const fullDateColumn = columnProfiles.find(profile =>
        (profile.type === 'date' || profile.type === 'time' || semanticUnderstanding.timeGrains.includes(profile.name))
        && data.data.some(row => isFullDateValue(row[profile.name])),
    );
    if (!fullDateColumn) {
        return null;
    }

    const normalizedTopic = topic.replace(/\bday of (?:the )?month\b/ig, fullDateColumn.name);
    return normalizedTopic !== topic
        ? { topic: normalizedTopic, column: fullDateColumn.name }
        : null;
};
