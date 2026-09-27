import type {
    AiCleaningStep,
    CsvRow,
    NumericDestructiveImpact,
    NumericFingerprint,
    NumericReconciliationFailure,
    NumericReconciliationReport,
    NumericStepReconciliation,
    UnpivotColumnsOperation,
} from '../../../types';
import { robustParseFloat } from '../../data/dataProfiler';
import { isStructuralMetadataColumn } from '../structuralMetadata';

const NUMERIC_PROFILE_TYPES = new Set(['numerical', 'currency', 'percentage']);
const FINGERPRINT_PRECISION = 12;
// Structural: unnamed/auto-generated column name detection.
const UNNAMED_COLUMN_PATTERN = /^_unnamed_column_/i;
// Descriptor column detection for numeric reconciliation exclusion.
// Split into high-confidence (always safe to exclude) and weak (may be numeric
// in financial/accounting contexts — "number", "account", "code" can be numeric).
// Weak matches only exclude when the column profile type is categorical, not numeric.
const DESCRIPTOR_HIGH_CONFIDENCE_PATTERN = /\b(description|name|label|category|brand|customer|vendor|supplier|item|stock[ _-]?code|document)\b/i;
const DESCRIPTOR_WEAK_PATTERN = /\b(code|number|account|acct)\b/i;
// Structural: unit-of-measure column detection for numeric reconciliation exclusion.
const UNIT_MIXED_COLUMN_PATTERN = /\b(uom|unit|pcs|ea|nos|kg|ltr|litre|pair|pack|box|roll)\b/i;

type FingerprintMap = Map<string, NumericFingerprint>;

const roundNumeric = (value: number) => Number(value.toFixed(FINGERPRINT_PRECISION));

const fingerprintEquals = (
    expected: NumericFingerprint,
    actual: NumericFingerprint,
) => expected.parsedCount === actual.parsedCount
    && expected.zeroCount === actual.zeroCount
    && expected.negativeCount === actual.negativeCount
    && roundNumeric(expected.sum) === roundNumeric(actual.sum)
    && roundNumeric(expected.absoluteSum) === roundNumeric(actual.absoluteSum)
    && roundNumeric(expected.min ?? 0) === roundNumeric(actual.min ?? 0)
    && roundNumeric(expected.max ?? 0) === roundNumeric(actual.max ?? 0);

const buildFingerprint = (column: string, rows: CsvRow[]): NumericFingerprint => {
    let parsedCount = 0;
    let nullCount = 0;
    let blankCount = 0;
    let zeroCount = 0;
    let negativeCount = 0;
    let sum = 0;
    let absoluteSum = 0;
    let min: number | null = null;
    let max: number | null = null;
    const distinct = new Set<string>();

    for (const row of rows) {
        const rawValue = row[column];
        if (rawValue === null || rawValue === undefined) {
            nullCount += 1;
            continue;
        }
        if (typeof rawValue === 'string' && rawValue.trim() === '') {
            blankCount += 1;
            continue;
        }
        const parsed = robustParseFloat(rawValue);
        if (parsed === null) {
            continue;
        }
        parsedCount += 1;
        sum += parsed;
        absoluteSum += Math.abs(parsed);
        if (parsed === 0) zeroCount += 1;
        if (parsed < 0) negativeCount += 1;
        min = min === null ? parsed : Math.min(min, parsed);
        max = max === null ? parsed : Math.max(max, parsed);
        distinct.add(String(roundNumeric(parsed)));
    }

    const nonBlankCount = rows.length - nullCount - blankCount;
    return {
        column,
        parsedCount,
        parseRate: nonBlankCount > 0 ? roundNumeric(parsedCount / nonBlankCount) : 0,
        nullCount,
        blankCount,
        zeroCount,
        negativeCount,
        min: min === null ? null : roundNumeric(min),
        max: max === null ? null : roundNumeric(max),
        sum: roundNumeric(sum),
        absoluteSum: roundNumeric(absoluteSum),
        distinctCount: distinct.size,
    };
};

const buildFingerprintMap = (fingerprints: NumericFingerprint[]): FingerprintMap =>
    new Map(fingerprints.map(fingerprint => [fingerprint.column.toLowerCase(), fingerprint]));

const collectRowsForToken = (rows: CsvRow[], column: string, token: string) =>
    rows.filter(row => String(row[column] ?? '') === token);

const buildDestructiveImpact = (
    step: AiCleaningStep,
    beforeRows: CsvRow[],
    afterRows: CsvRow[],
    beforeFingerprints: NumericFingerprint[],
    afterFingerprints: NumericFingerprint[],
): NumericDestructiveImpact => {
    const afterMap = buildFingerprintMap(afterFingerprints);
    return {
        stepId: step.id,
        rowsRemoved: Math.max(0, beforeRows.length - afterRows.length),
        affectedColumns: beforeFingerprints.map(fingerprint => {
            const after = afterMap.get(fingerprint.column.toLowerCase());
            return {
                column: fingerprint.column,
                sumDelta: roundNumeric((after?.sum ?? 0) - fingerprint.sum),
                absoluteSumDelta: roundNumeric((after?.absoluteSum ?? 0) - fingerprint.absoluteSum),
                parsedCountDelta: (after?.parsedCount ?? 0) - fingerprint.parsedCount,
            };
        }).filter(entry => entry.sumDelta !== 0 || entry.absoluteSumDelta !== 0 || entry.parsedCountDelta !== 0),
    };
};

const getRenameMappings = (step: AiCleaningStep) => {
    const mappings = new Map<string, string>();
    step.operations.forEach(operation => {
        if (operation.type !== 'rename_columns') return;
        operation.mappings.forEach(mapping => {
            if (mapping.from.trim() && mapping.to.trim()) {
                mappings.set(mapping.from.toLowerCase(), mapping.to);
            }
        });
    });
    return mappings;
};

const resolveUnpivotToken = (
    sourceColumn: string,
    operation: UnpivotColumnsOperation,
): string | null => {
    if (operation.sourceColumnNameColumn) {
        return sourceColumn;
    }
    const directMapping = operation.labelMappings?.find(mapping => mapping.sourceColumn === sourceColumn);
    if (directMapping) {
        return String(directMapping.label ?? '');
    }
    for (const labelColumn of operation.labelColumns ?? []) {
        const labelMapping = labelColumn.mappings.find(mapping => mapping.sourceColumn === sourceColumn);
        if (labelMapping) {
            return String(labelMapping.label ?? '');
        }
    }
    return sourceColumn;
};

// Structural: columns whose names strongly suggest date/time components should not be
// subject to strict numeric reconciliation. AI cleaning may legitimately
// reformat these (e.g. day-of-month 1–31 → proper date string) without
// implying data loss.
const DATE_COMPONENT_PATTERN = /\b(date|day|month|year|time|period|week|quarter|yr|mo|dt)\b/i;
const isLikelyDateComponent = (column: string, fingerprint: NumericFingerprint): boolean => {
    if (!DATE_COMPONENT_PATTERN.test(column)) return false;
    // Day-of-month (1–31), month (1–12), year (1900–2100), or small ordinals
    if (fingerprint.min !== null && fingerprint.max !== null) {
        const isDay = fingerprint.min >= 1 && fingerprint.max <= 31;
        const isMonth = fingerprint.min >= 1 && fingerprint.max <= 12;
        const isYear = fingerprint.min >= 1900 && fingerprint.max <= 2100;
        if (isDay || isMonth || isYear) return true;
    }
    return false;
};

const isAmbiguousNumericColumn = (column: string, declaredType?: string) => {
    if (UNNAMED_COLUMN_PATTERN.test(column)) return true;
    if (DESCRIPTOR_HIGH_CONFIDENCE_PATTERN.test(column)) return true;
    if (UNIT_MIXED_COLUMN_PATTERN.test(column)) return true;
    // Weak descriptor patterns only exclude when the column is NOT declared numeric
    // by the profiler — "account", "number", "code" are often numeric in financial data.
    if (DESCRIPTOR_WEAK_PATTERN.test(column) && (!declaredType || !NUMERIC_PROFILE_TYPES.has(declaredType))) {
        return true;
    }
    return false;
};

const collectNumericFingerprints = (
    rows: CsvRow[],
    profiles?: Array<{ name: string; type: string }>,
): NumericFingerprint[] => {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const columns = new Set<string>();
    rows.forEach(row => Object.keys(row ?? {}).forEach(column => columns.add(column)));
    const profileMap = new Map((profiles ?? []).map(profile => [profile.name.toLowerCase(), profile.type]));

    return [...columns]
        .map(column => buildFingerprint(column, rows))
        .filter(fingerprint => {
            if (isStructuralMetadataColumn(fingerprint.column)) {
                return false;
            }
            if (isLikelyDateComponent(fingerprint.column, fingerprint)) {
                return false;
            }
            const declaredType = profileMap.get(fingerprint.column.toLowerCase());
            if (isAmbiguousNumericColumn(fingerprint.column, declaredType ?? undefined)) {
                return false;
            }
            if (declaredType && NUMERIC_PROFILE_TYPES.has(declaredType)) {
                return fingerprint.parsedCount > 0 && fingerprint.parseRate >= 0.75;
            }
            if (UNNAMED_COLUMN_PATTERN.test(fingerprint.column)) {
                return false;
            }
            if (declaredType && !NUMERIC_PROFILE_TYPES.has(declaredType)) {
                return false;
            }
            return false;
        });
};

export const reconcileAiCleaningStep = (
    step: AiCleaningStep,
    beforeRows: CsvRow[],
    afterRows: CsvRow[],
    profiles?: Array<{ name: string; type: string }>,
): NumericStepReconciliation => {
    const beforeFingerprints = collectNumericFingerprints(beforeRows, profiles);
    const afterFingerprints = collectNumericFingerprints(afterRows, profiles);
    const failures: NumericReconciliationFailure[] = [];

    if (step.mode === 'reshape') {
        const unpivotOperation = step.operations.find(operation => operation.type === 'unpivot_columns') as UnpivotColumnsOperation | undefined;
        if (!unpivotOperation) {
            failures.push({
                stepId: step.id,
                column: '*',
                reason: 'unsupported_reshape',
                detail: 'Only unpivot-based reshape steps are currently supported for deterministic numeric reconciliation.',
            });
        } else {
            const metricColumn = unpivotOperation.valueColumn;
            for (const sourceColumn of unpivotOperation.sourceColumns) {
                const expected = beforeFingerprints.find(fingerprint => fingerprint.column === sourceColumn);
                if (!expected) continue;
                const discriminatorColumn = unpivotOperation.sourceColumnNameColumn ?? unpivotOperation.keyColumn;
                const token = resolveUnpivotToken(sourceColumn, unpivotOperation);
                if (!token) {
                    failures.push({
                        stepId: step.id,
                        column: sourceColumn,
                        reason: 'unsupported_reshape',
                        detail: `Unable to resolve a source token for "${sourceColumn}".`,
                    });
                    continue;
                }
                const bucketRows = collectRowsForToken(afterRows, discriminatorColumn, token)
                    .map(row => ({ [metricColumn]: row[metricColumn] }));
                const actual = buildFingerprint(metricColumn, bucketRows);
                if (!fingerprintEquals(expected, { ...actual, column: sourceColumn })) {
                    failures.push({
                        stepId: step.id,
                        column: sourceColumn,
                        reason: 'numeric_mismatch',
                        expected,
                        actual: {
                            ...actual,
                            column: sourceColumn,
                        },
                        detail: `Reshape step changed the numeric total for source column "${sourceColumn}".`,
                    });
                }
            }
        }

        return {
            stepId: step.id,
            mode: step.mode,
            passed: failures.length === 0,
            failures,
        };
    }

    if (step.mode === 'destructive') {
        const destructiveImpact = buildDestructiveImpact(step, beforeRows, afterRows, beforeFingerprints, afterFingerprints);
        return {
            stepId: step.id,
            mode: step.mode,
            passed: true,
            failures,
            destructiveImpact,
        };
    }

    const renameMappings = getRenameMappings(step);
    const afterMap = buildFingerprintMap(afterFingerprints);
    for (const expected of beforeFingerprints) {
        const targetColumn = renameMappings.get(expected.column.toLowerCase()) ?? expected.column;
        const actual = afterMap.get(targetColumn.toLowerCase());
        if (!actual) {
            failures.push({
                stepId: step.id,
                column: expected.column,
                reason: 'missing_after_lossless',
                expected,
                detail: `Lossless step removed numeric column "${expected.column}".`,
            });
            continue;
        }
        if (!fingerprintEquals(expected, actual)) {
            failures.push({
                stepId: step.id,
                column: expected.column,
                reason: 'numeric_mismatch',
                expected,
                actual,
                detail: `Lossless step changed numeric values for "${expected.column}".`,
            });
        }
    }

    return {
        stepId: step.id,
        mode: step.mode,
        passed: failures.length === 0,
        failures,
    };
};

export const buildNumericReconciliationReport = (
    baselineRows: CsvRow[],
    finalRows: CsvRow[],
    stepReports: NumericStepReconciliation[],
    profiles?: Array<{ name: string; type: string }>,
): NumericReconciliationReport => {
    const failures = stepReports.flatMap(report => report.failures);
    const destructiveImpacts = stepReports
        .map(report => report.destructiveImpact)
        .filter((impact): impact is NumericDestructiveImpact => Boolean(impact));

    return {
        passed: failures.length === 0,
        baselineFingerprints: collectNumericFingerprints(baselineRows, profiles),
        finalFingerprints: collectNumericFingerprints(finalRows, profiles),
        steps: stepReports,
        failures,
        destructiveImpacts,
    };
};
