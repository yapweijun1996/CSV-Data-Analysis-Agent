import type { ReportChartPayload, ReportVisualChartType } from '../../types';
import { validateReportChartPayload } from './validateReportChartPayload';
import {
    renderBarChart,
    renderLineChart,
    renderCircularChart,
    renderFallbackSvg,
} from './chartSvgRenderers';

// ---------------------------------------------------------------------------
// Structural validation
// ---------------------------------------------------------------------------

export interface ChartPayloadValidationResult {
    /** True if the payload can be rendered without repair. */
    isValid: boolean;
    /** Human-readable descriptions of detected structural issues. */
    errors: string[];
    /** Non-fatal issues that do not block rendering but may affect quality. */
    warnings: string[];
}

/**
 * Structural validation for a ReportChartPayload.
 *
 * Checks array length consistency, non-empty data, finite numeric values, and
 * that the chart type is supported. These are pre-render safety checks — they
 * are separate from the chart-type downgrade logic in validateReportChartPayload.
 */
export const validateChartPayload = (
    payload: ReportChartPayload,
): ChartPayloadValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Must have at least one data point.
    if (!payload.numericValues || payload.numericValues.length === 0) {
        errors.push('numericValues is empty — no data to render.');
    }

    if (!payload.displayLabels || payload.displayLabels.length === 0) {
        errors.push('displayLabels is empty — chart would have no axis labels.');
    }

    // Array length consistency.
    const nLabels = payload.displayLabels?.length ?? 0;
    const nValues = payload.numericValues?.length ?? 0;
    const nFormatted = payload.formattedValues?.length ?? 0;

    if (nLabels > 0 && nValues > 0 && nLabels !== nValues) {
        errors.push(
            `displayLabels length (${nLabels}) does not match numericValues length (${nValues}).`,
        );
    }

    if (nValues > 0 && nFormatted > 0 && nValues !== nFormatted) {
        warnings.push(
            `formattedValues length (${nFormatted}) does not match numericValues length (${nValues}). ` +
            'Missing formatted values will be substituted with raw numbers.',
        );
    }

    // All values NaN or non-finite.
    if (nValues > 0) {
        const allNonFinite = payload.numericValues.every(v => !Number.isFinite(v));
        if (allNonFinite) {
            errors.push('All numericValues are non-finite (NaN / Infinity). Cannot render chart.');
        }
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
    };
};

// ---------------------------------------------------------------------------
// Deterministic local repair
// ---------------------------------------------------------------------------

export interface ChartPayloadRepairResult {
    /** Whether the repaired payload is structurally renderable. */
    success: boolean;
    /** The repaired payload (may be the same reference when no changes needed). */
    payload: ReportChartPayload;
    /** Description of each change applied. */
    changes: string[];
}

/**
 * Attempt deterministic structural repair of a ReportChartPayload.
 *
 * Repair rules (adapted from BettaFish chart_validator.py local-repair strategy):
 * 1. Replace NaN / Infinity in numericValues with 0.
 * 2. Align formattedValues length to numericValues (truncate or pad with raw
 *    number strings).
 * 3. Align displayLabels length to numericValues (truncate or pad with
 *    generated labels "Item N").
 * 4. Re-derive valueDomain from the repaired numeric values when it is
 *    inconsistent with the actual data.
 * 5. Apply chartType downgrade via validateReportChartPayload when the
 *    declared type is incompatible with the data shape.
 *
 * "Never change what does not need to change" — only touch fields that have
 * concrete structural errors.
 */
export const repairChartPayload = (
    payload: ReportChartPayload,
): ChartPayloadRepairResult => {
    const changes: string[] = [];

    // Work on a shallow copy so we do not mutate the caller's object.
    let numericValues = [...(payload.numericValues ?? [])];
    let formattedValues = [...(payload.formattedValues ?? [])];
    let displayLabels = [...(payload.displayLabels ?? [])];
    let labels = [...(payload.labels ?? payload.displayLabels ?? [])];
    let chartType: ReportVisualChartType = payload.chartType;
    let valueDomain = payload.valueDomain;

    // 1. Replace non-finite numerics with 0.
    const repairedNumerics = numericValues.map((v, i) => {
        if (!Number.isFinite(v)) {
            changes.push(`numericValues[${i}] (${v}) replaced with 0.`);
            return 0;
        }
        return v;
    });
    if (repairedNumerics.some((v, i) => v !== numericValues[i])) {
        numericValues = repairedNumerics;
    }

    // 2. Align formattedValues to numericValues length.
    const nValues = numericValues.length;
    if (formattedValues.length > nValues) {
        formattedValues = formattedValues.slice(0, nValues);
        changes.push(`formattedValues truncated to ${nValues} entries.`);
    } else if (formattedValues.length < nValues) {
        const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
        const padded = numericValues
            .slice(formattedValues.length)
            .map(v => fmt.format(v));
        formattedValues = [...formattedValues, ...padded];
        changes.push(`formattedValues padded to ${nValues} entries.`);
    }

    // 3. Align displayLabels to numericValues length.
    if (displayLabels.length > nValues) {
        displayLabels = displayLabels.slice(0, nValues);
        labels = labels.slice(0, nValues);
        changes.push(`displayLabels truncated to ${nValues} entries.`);
    } else if (displayLabels.length < nValues) {
        const start = displayLabels.length;
        const generated = numericValues
            .slice(start)
            .map((_, i) => `Item ${start + i + 1}`);
        displayLabels = [...displayLabels, ...generated];
        labels = [...labels, ...generated];
        changes.push(`displayLabels padded to ${nValues} entries with generated names.`);
    }

    // 4. Re-derive valueDomain if it mismatches actual values.
    const hasPositive = numericValues.some(v => v > 0);
    const hasNegative = numericValues.some(v => v < 0);
    const derivedDomain: ReportChartPayload['valueDomain'] =
        hasPositive && hasNegative ? 'mixed' :
        hasNegative ? 'negative' :
        'positive';

    if (derivedDomain !== valueDomain) {
        changes.push(
            `valueDomain corrected from '${valueDomain}' to '${derivedDomain}'.`,
        );
        valueDomain = derivedDomain;
    }

    // 5. Apply chart-type downgrade if needed.
    const validation = validateReportChartPayload({
        chartType,
        valueDomain,
        groupByColumn: payload.groupByColumn,
        displayLabels,
        labels,
        numericValues,
        originalLabelCount: displayLabels.length,
    });

    if (validation.chartType !== chartType) {
        changes.push(
            `chartType downgraded from '${chartType}' to '${validation.chartType}': ` +
            validation.chartWarnings.join('; '),
        );
        chartType = validation.chartType;
    }

    const repairedPayload: ReportChartPayload = {
        ...payload,
        numericValues,
        formattedValues,
        displayLabels,
        labels,
        valueDomain,
        chartType,
        chartWarnings: [
            ...payload.chartWarnings,
            ...validation.chartWarnings.filter(
                w => !payload.chartWarnings.includes(w),
            ),
        ],
    };

    return {
        success: nValues > 0,
        payload: repairedPayload,
        changes,
    };
};

// ---------------------------------------------------------------------------
// Chart-type normalisation (downgrade only, no array repairs)
// ---------------------------------------------------------------------------

/**
 * Apply chart-type downgrade rules via validateReportChartPayload without
 * altering array contents. Called on the fast path so that a structurally
 * valid pie payload with mixed-domain values is still downgraded to bar.
 */
const normaliseChartType = (payload: ReportChartPayload): ReportChartPayload => {
    const validation = validateReportChartPayload({
        chartType: payload.chartType,
        valueDomain: payload.valueDomain,
        groupByColumn: payload.groupByColumn,
        displayLabels: payload.displayLabels,
        labels: payload.labels,
        numericValues: payload.numericValues,
        originalLabelCount: payload.displayLabels.length,
    });

    if (validation.chartType === payload.chartType && validation.chartWarnings.length === 0) {
        // No changes needed — avoid creating a new object.
        return payload;
    }

    return {
        ...payload,
        chartType: validation.chartType,
        chartWarnings: [
            ...payload.chartWarnings,
            ...validation.chartWarnings.filter(w => !payload.chartWarnings.includes(w)),
        ],
    };
};

// ---------------------------------------------------------------------------
// Public render entry point (with validation + repair)
// ---------------------------------------------------------------------------

export const renderReportChartSvg = (payload: ReportChartPayload): string => {
    // 1. Structural validation.
    const initial = validateChartPayload(payload);

    // 2. If structurally valid, still apply chart-type normalisation (downgrade
    //    pie/line to bar when data shape requires it) before dispatching.
    if (initial.isValid) {
        const normalised = normaliseChartType(payload);
        return renderChartByType(normalised);
    }

    // 3. Attempt deterministic repair.
    const repaired = repairChartPayload(payload);

    // 4. Validate repaired payload.
    if (repaired.success) {
        const afterRepair = validateChartPayload(repaired.payload);
        if (afterRepair.isValid) {
            return renderChartByType(repaired.payload);
        }
    }

    // 5. Unrecoverable — return fallback SVG placeholder.
    const firstError = initial.errors[0] ?? 'Payload could not be repaired.';
    return renderFallbackSvg(payload.title, firstError);
};

/** Internal dispatch by chart type (no validation — callers must pre-validate). */
const renderChartByType = (payload: ReportChartPayload): string => {
    switch (payload.chartType) {
        case 'line':
            return renderLineChart(payload);
        case 'pie':
            return renderCircularChart(payload, 0);
        case 'doughnut':
            return renderCircularChart(payload, 48);
        case 'bar':
        default:
            return renderBarChart(payload);
    }
};
