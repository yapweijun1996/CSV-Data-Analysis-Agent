import type { CsvData, ReportIntakeIr, Settings } from '../../types';
import {
    buildCsvDataFromIntakeIr,
    buildReportIntakeIr,
    rebuildIntakeIrWithBoundary,
    validateAiBoundary,
} from './reportCsvIntake';
import { parseCsvTextWithDetection } from './csvDialectDetector';
import { detectIntakeStructureWithAi } from '../ai/intakeStructureDetector';
import type { ContextTelemetryTarget } from '../ai/contextManager';
import { detectReportShape } from '../agent/reportShapeDetector';
import { robustParseFloat } from './dataProfiler';
import { buildDatasetId } from '../../utils/datasetId';

const AI_TABULAR_REGRESSION_SHAPES = new Set(['wide_crosstab', 'multi_header_matrix', 'mixed_report']);
const UNNAMED_COLUMN_PATTERN = /^_unnamed_column_/i;
const ROW_NUMBER_VALUE_PATTERN = /^\d+(?:\.\d+)?\.?$/;
const UOM_VALUE_PATTERN = /^(?:PCS|EA|NOS|M3|SET|UNIT|KG|G|LTR|L|BOX|PACK|PAIR|ROLL|M|CM|MM)$/i;
const BUSINESS_NUMERIC_HEADER_PATTERN = /\b(total|amount|revenue|sales|cost|expense|profit|margin|balance|value|qty|quantity|price|spent|purchase|commission)\b/i;
const DATE_LIKE_HEADER_PATTERN = /\b(date|day|month|year|period|week|quarter|time)\b/i;
const isMeaningfulHeaderLayer = (row: unknown[] | null | undefined) =>
    Array.isArray(row) && row.some(value => String(value ?? '').trim().length > 0);

const countUnnamedColumns = (csvData: CsvData) =>
    Object.keys(csvData.data[0] ?? {}).filter(column => UNNAMED_COLUMN_PATTERN.test(column)).length;

const getAiTabularRegressionReason = (
    deterministicData: CsvData,
    aiData: CsvData,
) => {
    const deterministicShape = detectReportShape(deterministicData);
    const aiShape = detectReportShape(aiData);
    const aiHeaderLayerCount = aiData.headerLayers?.length ?? 0;

    if (
        deterministicShape.primaryKind === 'already_tabular'
        && AI_TABULAR_REGRESSION_SHAPES.has(aiShape.primaryKind)
        && aiHeaderLayerCount === 0
    ) {
        return `AI boundary regressed intake from already_tabular to ${aiShape.primaryKind} without preserving header layers.`;
    }

    const deterministicUnnamedColumns = countUnnamedColumns(deterministicData);
    const aiUnnamedColumns = countUnnamedColumns(aiData);
    if (
        deterministicShape.primaryKind === 'already_tabular'
        && aiShape.primaryKind !== 'already_tabular'
        && aiUnnamedColumns > deterministicUnnamedColumns
    ) {
        return `AI boundary increased unnamed columns from ${deterministicUnnamedColumns} to ${aiUnnamedColumns}.`;
    }

    return null;
};

type AiBoundaryQualityAssessment = {
    accepted: boolean;
    reason: string;
    improvedSignals: string[];
    regressionSignals: string[];
};

type BoundaryStabilityMetrics = {
    namedColumns: number;
    unnamedColumns: number;
    businessMetricColumns: number;
    headerLayers: number;
    score: number;
};

type BoundaryStabilizationAssessment = {
    retainDeterministic: boolean;
    reason: string | null;
    deterministic: BoundaryStabilityMetrics;
    ai: BoundaryStabilityMetrics;
};

const getBoundarySignalCounts = (intakeIr: ReportIntakeIr) => ({
    headerLayerCount: intakeIr.provisionalTable?.headerLayerRowIndexes.length ?? 0,
    repeatedHeaderCount: intakeIr.provisionalTable?.repeatedHeaderRowIndexes.length ?? 0,
    parameterRowCount: intakeIr.provisionalTable?.parameterRowIndexes.length ?? 0,
});

const countStableBusinessMetricColumns = (csvData: CsvData) => {
    const firstRow = csvData.data[0] ?? {};
    const headers = Object.keys(firstRow);
    if (headers.length === 0) {
        return 0;
    }

    return headers.filter(header => {
        if (UNNAMED_COLUMN_PATTERN.test(header) || DATE_LIKE_HEADER_PATTERN.test(header)) {
            return false;
        }
        if (!BUSINESS_NUMERIC_HEADER_PATTERN.test(header)) {
            return false;
        }

        const values = csvData.data
            .map(row => row[header])
            .filter(value => String(value ?? '').trim().length > 0);

        if (values.length < 3) {
            return false;
        }

        const parseRate = values.filter(value => robustParseFloat(value) !== null).length / values.length;
        return parseRate >= 0.8;
    }).length;
};

const buildBoundaryStabilityMetrics = (intakeIr: ReportIntakeIr): BoundaryStabilityMetrics => {
    const csvData = buildCsvDataFromIntakeIr(intakeIr);
    const headers = Object.keys(csvData.data[0] ?? {});
    const unnamedColumns = headers.filter(column => UNNAMED_COLUMN_PATTERN.test(column)).length;
    const namedColumns = headers.length - unnamedColumns;
    const businessMetricColumns = countStableBusinessMetricColumns(csvData);
    const headerLayers = csvData.headerLayers?.filter(isMeaningfulHeaderLayer).length ?? 0;

    return {
        namedColumns,
        unnamedColumns,
        businessMetricColumns,
        headerLayers,
        score: (namedColumns * 4) + (businessMetricColumns * 5) + (headerLayers * 3) - (unnamedColumns * 6),
    };
};

const areBoundaryCandidatesNearEquivalent = (
    deterministicIntakeIr: ReportIntakeIr,
    aiIntakeIr: ReportIntakeIr,
) => {
    if (!deterministicIntakeIr.provisionalTable || !aiIntakeIr.provisionalTable) {
        return false;
    }

    return Math.abs(deterministicIntakeIr.provisionalTable.headerRowIndex - aiIntakeIr.provisionalTable.headerRowIndex) <= 1
        && Math.abs(deterministicIntakeIr.provisionalTable.bodyStartIndex - aiIntakeIr.provisionalTable.bodyStartIndex) <= 1;
};

const shouldApplyBoundaryStabilization = (intakeIr: ReportIntakeIr) =>
    intakeIr.diagnostics.evidenceStrength !== 'strong'
    || (intakeIr.provisionalTable?.headerLayerRowIndexes.length ?? 0) > 0
    || (intakeIr.detection?.warnings.length ?? 0) > 0;

export const evaluateBoundaryStabilizationPreference = (
    deterministicIntakeIr: ReportIntakeIr,
    aiIntakeIr: ReportIntakeIr,
): BoundaryStabilizationAssessment => {
    const deterministic = buildBoundaryStabilityMetrics(deterministicIntakeIr);
    const ai = buildBoundaryStabilityMetrics(aiIntakeIr);
    if (
        !areBoundaryCandidatesNearEquivalent(deterministicIntakeIr, aiIntakeIr)
        || !shouldApplyBoundaryStabilization(deterministicIntakeIr)
    ) {
        return {
            retainDeterministic: false,
            reason: null,
            deterministic,
            ai,
        };
    }

    if (ai.score >= deterministic.score) {
        return {
            retainDeterministic: false,
            reason: null,
            deterministic,
            ai,
        };
    }

    const reasonParts: string[] = [];
    if (deterministic.namedColumns > ai.namedColumns) {
        reasonParts.push(`deterministic boundary keeps ${deterministic.namedColumns} named columns vs ${ai.namedColumns}`);
    }
    if (deterministic.unnamedColumns < ai.unnamedColumns) {
        reasonParts.push(`deterministic boundary keeps fewer unnamed columns (${deterministic.unnamedColumns} vs ${ai.unnamedColumns})`);
    }
    if (deterministic.businessMetricColumns > ai.businessMetricColumns) {
        reasonParts.push(`deterministic boundary preserves more stable business metrics (${deterministic.businessMetricColumns} vs ${ai.businessMetricColumns})`);
    }
    if (deterministic.headerLayers > ai.headerLayers) {
        reasonParts.push(`deterministic boundary preserves more header layers (${deterministic.headerLayers} vs ${ai.headerLayers})`);
    }

    return {
        retainDeterministic: true,
        reason: `Retained deterministic boundary after stability tie-break: ${reasonParts.join('; ')}.`,
        deterministic,
        ai,
    };
};

export const evaluateAiBoundaryQuality = (
    deterministicIntakeIr: ReportIntakeIr,
    aiIntakeIr: ReportIntakeIr,
): AiBoundaryQualityAssessment => {
    const deterministicData = buildCsvDataFromIntakeIr(deterministicIntakeIr);
    const aiData = buildCsvDataFromIntakeIr(aiIntakeIr);
    const regressionSignals: string[] = [];
    const improvedSignals: string[] = [];

    const tabularRegressionReason = getAiTabularRegressionReason(deterministicData, aiData);
    if (tabularRegressionReason) {
        regressionSignals.push(tabularRegressionReason);
    }

    const deterministicUnnamedColumns = countUnnamedColumns(deterministicData);
    const aiUnnamedColumns = countUnnamedColumns(aiData);
    if (aiUnnamedColumns > deterministicUnnamedColumns) {
        regressionSignals.push(`AI boundary increased unnamed columns from ${deterministicUnnamedColumns} to ${aiUnnamedColumns}.`);
    } else if (aiUnnamedColumns < deterministicUnnamedColumns) {
        improvedSignals.push(`AI boundary reduced unnamed columns from ${deterministicUnnamedColumns} to ${aiUnnamedColumns}.`);
    }

    if (!deterministicIntakeIr.diagnostics.headerShapeDrift && aiIntakeIr.diagnostics.headerShapeDrift) {
        regressionSignals.push('AI boundary introduced header/body width drift that deterministic intake did not have.');
    } else if (deterministicIntakeIr.diagnostics.headerShapeDrift && !aiIntakeIr.diagnostics.headerShapeDrift) {
        improvedSignals.push('AI boundary resolved header/body width drift.');
    }

    if (
        deterministicIntakeIr.diagnostics.bodyEvidenceKind !== 'unknown'
        && aiIntakeIr.diagnostics.bodyEvidenceKind === 'unknown'
    ) {
        regressionSignals.push(`AI boundary downgraded body evidence from ${deterministicIntakeIr.diagnostics.bodyEvidenceKind} to unknown.`);
    } else if (
        deterministicIntakeIr.diagnostics.bodyEvidenceKind === 'unknown'
        && aiIntakeIr.diagnostics.bodyEvidenceKind !== 'unknown'
    ) {
        improvedSignals.push(`AI boundary improved body evidence to ${aiIntakeIr.diagnostics.bodyEvidenceKind}.`);
    }

    const deterministicSignals = getBoundarySignalCounts(deterministicIntakeIr);
    const aiSignals = getBoundarySignalCounts(aiIntakeIr);
    if (deterministicSignals.headerLayerCount > 0 && aiSignals.headerLayerCount < deterministicSignals.headerLayerCount) {
        regressionSignals.push('AI boundary lost preserved header layers that deterministic intake already identified.');
    } else if (aiSignals.headerLayerCount > deterministicSignals.headerLayerCount) {
        improvedSignals.push(`AI boundary preserved ${aiSignals.headerLayerCount - deterministicSignals.headerLayerCount} additional header layer(s).`);
    }

    if (deterministicSignals.repeatedHeaderCount > 0 && aiSignals.repeatedHeaderCount < deterministicSignals.repeatedHeaderCount) {
        regressionSignals.push('AI boundary lost repeated header rows that deterministic intake had already identified.');
    } else if (aiSignals.repeatedHeaderCount > deterministicSignals.repeatedHeaderCount) {
        improvedSignals.push(`AI boundary preserved ${aiSignals.repeatedHeaderCount - deterministicSignals.repeatedHeaderCount} additional repeated header row(s).`);
    }

    if (deterministicSignals.parameterRowCount > 0 && aiSignals.parameterRowCount < deterministicSignals.parameterRowCount) {
        regressionSignals.push('AI boundary lost parameter rows that deterministic intake had already identified.');
    } else if (aiSignals.parameterRowCount > deterministicSignals.parameterRowCount) {
        improvedSignals.push(`AI boundary preserved ${aiSignals.parameterRowCount - deterministicSignals.parameterRowCount} additional parameter row(s).`);
    }

    if (!deterministicIntakeIr.provisionalTable && aiIntakeIr.provisionalTable) {
        improvedSignals.push('AI boundary recovered a provisional table boundary after deterministic fallback.');
    }

    const deterministicBodyRowCount = deterministicData.data.length;
    const aiBodyRowCount = aiData.data.length;
    if (deterministicBodyRowCount > 0 && aiBodyRowCount < deterministicBodyRowCount) {
        const lossRatio = (deterministicBodyRowCount - aiBodyRowCount) / deterministicBodyRowCount;
        if (lossRatio >= 0.05) {
            regressionSignals.push(
                `AI boundary loses ${deterministicBodyRowCount - aiBodyRowCount} body rows (${(lossRatio * 100).toFixed(1)}% of ${deterministicBodyRowCount}).`,
            );
        }
    }

    const accepted = regressionSignals.length === 0 && improvedSignals.length > 0;
    return {
        accepted,
        reason: accepted
            ? `AI boundary accepted: ${improvedSignals.join(' ')}`
            : regressionSignals.length > 0
                ? `AI boundary rejected: ${regressionSignals.join(' ')}`
                : 'AI boundary rejected: it did not improve deterministic intake quality.',
        improvedSignals,
        regressionSignals,
    };
};

const emitIntakeTelemetry = (
    telemetryTarget: ContextTelemetryTarget | undefined,
    responseType: 'intake_ai_boundary_accepted' | 'intake_ai_boundary_rejected' | 'intake_boundary_stabilized',
    detail: string,
    meta: Record<string, unknown>,
) => telemetryTarget?.logTelemetryEvent?.({
    stage: 'planner_ready',
    responseType,
    detail,
    meta,
});

const renameRowKey = (row: Record<string, unknown>, from: string, to: string) => {
    if (!(from in row) || from === to) {
        return row;
    }

    const nextRow: Record<string, unknown> = {};
    Object.entries(row).forEach(([key, value]) => {
        nextRow[key === from ? to : key] = value;
    });
    return nextRow;
};

const detectRowNumberAutoName = (columnName: string, rows: CsvData['data']) => {
    if (!UNNAMED_COLUMN_PATTERN.test(columnName)) {
        return null;
    }

    const nonEmptyValues = rows
        .map(row => String(row[columnName] ?? '').trim())
        .filter(Boolean);

    if (nonEmptyValues.length < 3) {
        return null;
    }

    const sequenceRatio = nonEmptyValues.filter(value => ROW_NUMBER_VALUE_PATTERN.test(value)).length / nonEmptyValues.length;
    if (sequenceRatio < 0.85) {
        return null;
    }

    return {
        from: columnName,
        to: 'RowNumber',
        reason: 'High-confidence row-sequence column auto-named from an empty header.',
    };
};

const detectUomAutoName = (headers: string[], index: number, rows: CsvData['data']) => {
    const columnName = headers[index];
    if (!UNNAMED_COLUMN_PATTERN.test(columnName)) {
        return null;
    }

    const previousHeader = headers[index - 1] ?? '';
    const nextHeader = headers[index + 1] ?? '';
    if (!/qty|quantity/i.test(previousHeader) || !/amount|price|cost|value/i.test(nextHeader)) {
        return null;
    }

    const nonEmptyValues = rows
        .map(row => String(row[columnName] ?? '').trim())
        .filter(Boolean);

    if (nonEmptyValues.length < 3) {
        return null;
    }

    const uomRatio = nonEmptyValues.filter(value => UOM_VALUE_PATTERN.test(value)).length / nonEmptyValues.length;
    if (uomRatio < 0.8) {
        return null;
    }

    return {
        from: columnName,
        to: 'UOM',
        reason: 'High-confidence unit-of-measure column auto-named from an empty header.',
    };
};

export const applyAnalysisHeaderAutoNaming = (
    csvData: CsvData,
): CsvData => {
    const headers = Object.keys(csvData.data[0] ?? {});
    if (headers.length === 0) {
        return csvData;
    }

    const proposedRenames = [
        detectRowNumberAutoName(headers[0] ?? '', csvData.data),
        ...headers.map((_header, index) => detectUomAutoName(headers, index, csvData.data)),
    ].filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));

    if (proposedRenames.length === 0) {
        return csvData;
    }

    const seenTargets = new Set(headers.map(header => header.toLowerCase()));
    const acceptedRenames = proposedRenames.filter(candidate => {
        const fromKey = candidate.from.toLowerCase();
        const toKey = candidate.to.toLowerCase();
        if (fromKey === toKey) {
            return false;
        }
        if (seenTargets.has(toKey)) {
            return false;
        }
        seenTargets.delete(fromKey);
        seenTargets.add(toKey);
        return true;
    });

    if (acceptedRenames.length === 0) {
        return csvData;
    }

    const renamedData = acceptedRenames.reduce(
        (rows, rename) => rows.map(row => renameRowKey(row, rename.from, rename.to) as CsvData['data'][number]),
        csvData.data,
    );
    const renamedSummaryRows = acceptedRenames.reduce(
        (rows, rename) => rows.map(row => renameRowKey(row, rename.from, rename.to) as CsvData['summaryRows'][number]),
        csvData.summaryRows ?? [],
    );

    return {
        ...csvData,
        data: renamedData,
        summaryRows: renamedSummaryRows,
        autoNamedColumns: acceptedRenames,
    };
};

/**
 * Backward-compatible desktop ceiling. Runtime imports should resolve the
 * device-specific capacity through importCapacity.ts.
 */
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/** Deterministic confidence threshold above which AI detection is skipped. */
const AI_SKIP_CONFIDENCE_THRESHOLD = 0.90;

export const processCsvWithIntakeIr = async (
    file: File,
    settings?: Settings,
    telemetryTarget?: ContextTelemetryTarget,
    options?: {
        onDatasetIdentified?: (datasetId: string) => void | Promise<void>;
    },
): Promise<{ csvData: CsvData; intakeIr: ReportIntakeIr }> => {
    const text = await file.text();
    const { rawRows, detection } = parseCsvTextWithDetection(text);
    if (detection.warnings.length > 0) {
        console.warn('CSV intake detection warnings:', detection.warnings);
    }
    let intakeIr = buildReportIntakeIr(file.name, rawRows, detection);
    const deterministicIntakeIr = intakeIr;
    if (options?.onDatasetIdentified) {
        const stagedDataset = buildCsvDataFromIntakeIr(intakeIr);
        await options.onDatasetIdentified(buildDatasetId(file.name, stagedDataset.data));
    }

    // If deterministic detection has low confidence, try AI boundary detection
    const preScanSignals = intakeIr.diagnostics.preScanSignals;
    const deterministicConfidence = preScanSignals?.deterministicConfidence ?? 0;
    const shouldTryAi = settings
        && (intakeIr.diagnostics.singleColumnFallbackApplied || deterministicConfidence < AI_SKIP_CONFIDENCE_THRESHOLD);

    if (shouldTryAi && preScanSignals) {
        try {
            const aiBoundary = await detectIntakeStructureWithAi(
                intakeIr.normalizedRows,
                preScanSignals,
                settings,
                telemetryTarget,
            );

            if (aiBoundary) {
                const validation = validateAiBoundary(aiBoundary, intakeIr.normalizedRows);
                if (validation.valid) {
                    const aiIntakeIr = rebuildIntakeIrWithBoundary(intakeIr, aiBoundary, 'ai');
                    const qualityAssessment = evaluateAiBoundaryQuality(deterministicIntakeIr, aiIntakeIr);
                    const stabilizationAssessment = qualityAssessment.accepted
                        ? evaluateBoundaryStabilizationPreference(deterministicIntakeIr, aiIntakeIr)
                        : null;

                    if (!qualityAssessment.accepted || stabilizationAssessment?.retainDeterministic) {
                        const rejectionReason = stabilizationAssessment?.retainDeterministic
                            ? stabilizationAssessment.reason ?? qualityAssessment.reason
                            : qualityAssessment.reason;
                        console.warn(`[CsvParser] ${rejectionReason}`);
                        intakeIr.diagnostics.aiStructureBoundary = aiBoundary;
                        intakeIr.diagnostics.aiRejectionReason = rejectionReason;
                        intakeIr.diagnostics.aiBoundaryAccepted = false;
                        intakeIr.diagnostics.aiBoundaryComparisonReason = rejectionReason;
                        intakeIr.diagnostics.boundaryStabilizationReason = stabilizationAssessment?.reason ?? null;
                        intakeIr.diagnostics.structureSource = 'ai_fallback_deterministic';
                        emitIntakeTelemetry(
                            telemetryTarget,
                            stabilizationAssessment?.retainDeterministic ? 'intake_boundary_stabilized' : 'intake_ai_boundary_rejected',
                            rejectionReason,
                            {
                            fileName: file.name,
                            improvedSignals: qualityAssessment.improvedSignals,
                            regressionSignals: qualityAssessment.regressionSignals,
                            stabilizationMetrics: stabilizationAssessment
                                ? {
                                    deterministic: stabilizationAssessment.deterministic,
                                    ai: stabilizationAssessment.ai,
                                }
                                : undefined,
                            retainedDeterministic: true,
                            },
                        );
                    } else {
                        console.log(
                            `[CsvParser] AI detected header at row ${aiBoundary.headerRowIndex}, body at ${aiBoundary.bodyStartIndex} (confidence: ${aiBoundary.confidence.toFixed(2)})`,
                        );
                        intakeIr = aiIntakeIr;
                        intakeIr.diagnostics.aiStructureBoundary = aiBoundary;
                        intakeIr.diagnostics.aiBoundaryAccepted = true;
                        intakeIr.diagnostics.aiBoundaryComparisonReason = qualityAssessment.reason;
                        intakeIr.diagnostics.boundaryStabilizationReason = null;
                        emitIntakeTelemetry(telemetryTarget, 'intake_ai_boundary_accepted', qualityAssessment.reason, {
                            fileName: file.name,
                            improvedSignals: qualityAssessment.improvedSignals,
                            regressionSignals: qualityAssessment.regressionSignals,
                            retainedDeterministic: false,
                        });
                    }
                } else {
                    console.warn(`[CsvParser] AI boundary rejected: ${validation.rejectionReason}`);
                    intakeIr.diagnostics.aiStructureBoundary = aiBoundary;
                    intakeIr.diagnostics.aiRejectionReason = validation.rejectionReason;
                    intakeIr.diagnostics.aiBoundaryAccepted = false;
                    intakeIr.diagnostics.aiBoundaryComparisonReason = validation.rejectionReason;
                    intakeIr.diagnostics.structureSource = 'ai_fallback_deterministic';
                    emitIntakeTelemetry(telemetryTarget, 'intake_ai_boundary_rejected', validation.rejectionReason ?? 'AI boundary failed hard validation.', {
                        fileName: file.name,
                        retainedDeterministic: true,
                        validationRejected: true,
                    });
                }
            }
        } catch (error) {
            console.warn('[CsvParser] AI structure detection failed, using deterministic.', error);
        }
    }

    const analysisCsvData = applyAnalysisHeaderAutoNaming(buildCsvDataFromIntakeIr(intakeIr));
    if ((analysisCsvData.autoNamedColumns?.length ?? 0) > 0) {
        intakeIr.diagnostics.autoNamedColumns = analysisCsvData.autoNamedColumns;
        emitIntakeTelemetry(
            telemetryTarget,
            'intake_ai_boundary_accepted',
            `Auto-named ${analysisCsvData.autoNamedColumns!.length} high-confidence empty header column(s) for analysis view.`,
            {
                fileName: file.name,
                autoNamedColumns: analysisCsvData.autoNamedColumns,
                reasonCode: 'data_prep_header_autonamed',
            },
        );
    }

    return {
        csvData: analysisCsvData,
        intakeIr,
    };
};

export const processCsv = async (file: File): Promise<CsvData> => {
    const { csvData } = await processCsvWithIntakeIr(file);
    return csvData;
};
