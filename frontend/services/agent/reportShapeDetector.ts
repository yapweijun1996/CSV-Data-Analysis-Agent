import type {
    ColumnRoleCandidate,
    HeaderBandCandidate,
    ReportShapeCandidate,
    ReportShapeKind,
    ReportShapeProfile,
    RowRoleCandidate,
    ShapeSignal,
    SummarySeriesCandidate,
} from '../../types';
import type { CsvData } from '../../types';
import {
    PLACEHOLDER_PATTERN,
    getColumns,
    getDescriptorPriority,
    getNonEmptyValues,
    getRowCells,
    getRows,
    isCodeLike,
    isNumericLike,
    isSummaryLike,
    roundRatio,
    sortDescriptorColumns,
} from './reportShapeUtils';
import {
    HeaderLayoutCandidate,
    buildHeaderBands,
    detectHeaderLayoutCandidate,
    isMetadataRow,
    isReportTitleRow,
} from './reportShapeHeaderBands';
import { findDominantTabularSegment } from './reportShapeSegmentation';
import { assignHierarchyDepths, detectMatrixRowRole } from './reportShapeHierarchy';
import { detectTabularRowRole, inferTabularShapeContext } from './reportShapeTabular';
import { applyVerifiedCodeHierarchyRoles } from './reportShapeCodeHierarchy';
import { computeRowRoleSignals } from './runtime/rowRoleSignals';

const MAX_HEADER_SCAN_ROWS = 40;
const PARSER_HEADER_ROW_INDEX = -1;

// Month abbreviations only match a header spelled "JAN 2010"/"JAN" — a
// full spelled-out month name like "JANUARY" or "FEBRUARY" contains no word
// boundary between the abbreviation and the remaining letters, so \bjan\b
// never matches inside it. "MAY" is the sole exception (its full name IS
// its abbreviation), which is why an abbreviation-only pattern silently
// recognized only the May column of a full-month-name report as a detail
// series. Full names are listed explicitly alongside the abbreviations.
// ISO-style "YYYY-MM" period labels (e.g. "2010-01") carry no month name at
// all, so they need their own alternative; the year is anchored to 19xx/20xx
// and the month to 01-12 to avoid matching arbitrary dash-separated numbers.
const SERIES_HEADER_PATTERN = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|fy\d{2,4}|q[1-4]|corp_|corp\b|ec\b|re\b|project\b|office\b|capex\b)\b|\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])\b/i;

const buildParserMetadataBands = (data: CsvData | null): HeaderBandCandidate[] => {
    if (!data) return [];
    const bands: HeaderBandCandidate[] = [];
    (data.metadataRows ?? []).forEach((row, index) => {
        const values = row.map(value => String(value ?? '').trim()).filter(Boolean);
        if (values.length === 0) return;
        bands.push({
            rowIndexes: [-(index + 100)],
            role: index === 0 ? 'report_title' : 'report_metadata',
            confidence: index === 0 ? 0.88 : 0.82,
        });
    });
    return bands;
};

const buildParserResolvedHeaderBands = (
    data: CsvData | null,
    layout: HeaderLayoutCandidate | null,
): HeaderBandCandidate[] => {
    if (!data || !layout) return [];

    const bands: HeaderBandCandidate[] = buildParserMetadataBands(data);
    bands.push({
        rowIndexes: [PARSER_HEADER_ROW_INDEX],
        role: 'column_header',
        confidence: layout.score,
        layerIndex: 0,
    });
    (data.headerLayers ?? []).forEach((_, index) => {
        bands.push({
            rowIndexes: [-(index + 2)],
            role: 'series_label_header',
            confidence: roundRatio(0.76 + Math.min(index, 2) * 0.06),
            layerIndex: index + 1,
        });
    });
    return bands;
};

const buildExplicitHeaderLayoutCandidate = (
    data: CsvData | null,
    tabularContext: ReturnType<typeof inferTabularShapeContext>,
): HeaderLayoutCandidate | null => {
    if (!data || (data.headerLayers?.length ?? 0) === 0) return null;

    const columns = getColumns(data);
    if (columns.length < 5) return null;

    const descriptorColumns = tabularContext?.descriptorColumns?.length
        ? sortDescriptorColumns(tabularContext.descriptorColumns)
        : columns.filter(column => !isCodeLike(column) && !isNumericLike(column) && !isSummaryLike(column)).slice(0, 3);
    const descriptorColumnSet = new Set(descriptorColumns.map(column => column.toLowerCase()));
    const summarySeriesColumns = columns.filter(column => isSummaryLike(column));
    const summarySet = new Set(summarySeriesColumns.map(column => column.toLowerCase()));
    const detailSeriesColumns = columns.filter(column => {
        const normalized = column.toLowerCase();
        if (descriptorColumnSet.has(normalized) || summarySet.has(normalized)) return false;
        return isCodeLike(column) || SERIES_HEADER_PATTERN.test(column);
    });
    if (detailSeriesColumns.length < 4) return null;
    const detailSeriesCodeLikeRatio = detailSeriesColumns.filter(column => isCodeLike(column)).length / detailSeriesColumns.length;
    if (detailSeriesCodeLikeRatio < 0.35 && (data.headerLayers?.length ?? 0) < 1) {
        return null;
    }

    const columnIndexByName = new Map(columns.map((column, index) => [column, index]));
    return {
        rowIndex: PARSER_HEADER_ROW_INDEX,
        descriptorColumns,
        detailSeriesColumns,
        summarySeriesColumns,
        summarySeriesCandidates: summarySeriesColumns.map(columnName => ({
            columnName,
            summaryKind: 'total' as const,
            confidence: 0.9,
        })),
        descriptorColumnIndexes: descriptorColumns.map(column => columnIndexByName.get(column) ?? -1).filter(index => index >= 0),
        detailSeriesIndexes: detailSeriesColumns.map(column => columnIndexByName.get(column) ?? -1).filter(index => index >= 0),
        summarySeriesIndexes: summarySeriesColumns.map(column => columnIndexByName.get(column) ?? -1).filter(index => index >= 0),
        score: roundRatio(0.82 + Math.min(0.12, detailSeriesColumns.length / 48)),
    };
};

const buildSignals = (
    data: CsvData | null,
    layout: HeaderLayoutCandidate | null,
    headerBands: HeaderBandCandidate[],
    rowRoles: RowRoleCandidate[],
    tabularContext: ReturnType<typeof inferTabularShapeContext>,
): ShapeSignal[] => {
    const rows = getRows(data);
    const topRows = rows.slice(0, Math.min(12, rows.length));
    const topNonEmpty = topRows.map(row => getNonEmptyValues(row).length).filter(count => count > 0);
    const seriesLabelBands = headerBands.filter(candidate => candidate.role === 'series_label_header');
    const bodyRows = layout
        ? layout.rowIndex >= 0
            ? rows.slice(layout.rowIndex + 1 + seriesLabelBands.length)
            : rows
        : rows;
    const bodyNonEmpty = bodyRows.map(row => getNonEmptyValues(row).length).filter(count => count > 0);
    const topAverage = topNonEmpty.length > 0 ? topNonEmpty.reduce((sum, count) => sum + count, 0) / topNonEmpty.length : 0;
    const bodyAverage = bodyNonEmpty.length > 0 ? bodyNonEmpty.reduce((sum, count) => sum + count, 0) / bodyNonEmpty.length : topAverage;
    const topBandIrregularityRatio = bodyAverage > 0 ? roundRatio(Math.abs(bodyAverage - topAverage) / bodyAverage) : 0;
    const detailSeriesColumns = layout?.detailSeriesColumns ?? tabularContext?.valueColumns ?? [];
    const descriptorColumns = layout?.descriptorColumns ?? tabularContext?.descriptorColumns ?? [];
    const detailNumericCells = layout
        ? bodyRows.reduce((count, row) => (
            count + layout.detailSeriesIndexes.filter(index => isNumericLike(getRowCells(row)[index]?.value ?? '')).length
        ), 0)
        : tabularContext
            ? bodyRows.reduce((count, row) => (
                count + tabularContext.valueColumns.filter(column => isNumericLike(String(row[column] ?? ''))).length
            ), 0)
            : 0;
    const detailSeriesNumericDensity = detailSeriesColumns.length > 0 && bodyRows.length > 0
        ? roundRatio(detailNumericCells / (detailSeriesColumns.length * bodyRows.length))
        : 0;
    const detailSeriesCodeLikeRatio = detailSeriesColumns.length > 0
        ? roundRatio(detailSeriesColumns.filter(isCodeLike).length / detailSeriesColumns.length)
        : 0;
    const descriptorStabilityRatio = descriptorColumns.length > 0 && bodyRows.length > 0
        ? roundRatio(bodyRows.filter(row =>
            descriptorColumns.some(column => Boolean(String(row[column] ?? '').trim()))
        ).length / bodyRows.length)
        : 0;
    const hierarchyHits = rowRoles.filter(candidate => ['group_header', 'subtotal', 'total'].includes(candidate.role)).length;
    const hierarchyRatio = rowRoles.length > 0 ? roundRatio(hierarchyHits / rowRoles.length) : 0;
    const placeholderColumnRatio = (() => {
        const columns = getColumns(data);
        if (columns.length === 0) return 0;
        return roundRatio(columns.filter(column => PLACEHOLDER_PATTERN.test(column)).length / columns.length);
    })();
    const repeatedHeaderRisk = headerBands.some(candidate => candidate.role === 'repeated_header')
        || rowRoles.some(candidate => candidate.role === 'noise');

    return [
        { key: 'top_band_irregularity_ratio', kind: 'ratio', value: topBandIrregularityRatio, confidence: 0.72 },
        { key: 'header_row_repeat_pattern', kind: 'boolean', value: repeatedHeaderRisk, confidence: 0.6 },
        { key: 'descriptor_column_stability_ratio', kind: 'ratio', value: descriptorStabilityRatio, confidence: layout ? 0.84 : 0.5 },
        { key: 'detail_series_code_like_ratio', kind: 'ratio', value: detailSeriesCodeLikeRatio, confidence: layout ? 0.86 : 0.35 },
        { key: 'detail_series_numeric_density', kind: 'ratio', value: detailSeriesNumericDensity, confidence: layout ? 0.86 : 0.35 },
        {
            key: 'summary_series_separability',
            kind: 'ratio',
            value: layout ? roundRatio(layout.summarySeriesColumns.length > 0 ? 1 : 0) : 0,
            confidence: layout ? 0.74 : 0.2,
        },
        { key: 'row_hierarchy_signature', kind: 'ratio', value: hierarchyRatio, confidence: 0.8 },
        { key: 'placeholder_column_ratio', kind: 'ratio', value: placeholderColumnRatio, confidence: 0.52 },
        { key: 'repeated_header_leakage_risk', kind: 'boolean', value: repeatedHeaderRisk, confidence: 0.58 },
    ];
};

const buildCandidate = (
    id: string,
    kind: ReportShapeKind,
    score: number,
    headerBands: HeaderBandCandidate[],
    descriptorColumns: string[],
    detailSeriesColumns: string[],
    summarySeriesColumns: string[],
    summarySeriesCandidates: SummarySeriesCandidate[],
    requiredSignalKeys: string[],
): ReportShapeCandidate => ({
    id,
    kind,
    score: roundRatio(score),
    headerBands,
    descriptorColumns,
    detailSeriesColumns,
    summarySeriesColumns,
    summarySeriesCandidates,
    requiredSignalKeys,
});

const buildHeaderLayoutCandidates = (rows: ReturnType<typeof getRows>) =>
    rows
        .slice(0, Math.min(MAX_HEADER_SCAN_ROWS, rows.length))
        .map((_, rowIndex) => detectHeaderLayoutCandidate(rows, rowIndex))
        .filter((candidate): candidate is HeaderLayoutCandidate => Boolean(candidate));

const buildRowRoles = (
    data: CsvData | null,
    layout: HeaderLayoutCandidate | null,
    headerBands: HeaderBandCandidate[],
    dominantSegment: ReturnType<typeof findDominantTabularSegment>,
    tabularContext: ReturnType<typeof inferTabularShapeContext>,
): RowRoleCandidate[] => {
    const rows = getRows(data);
    const repeatedHeaderValues = new Set(
        layout
            ? [...layout.descriptorColumns, ...layout.detailSeriesColumns, ...layout.summarySeriesColumns]
                .map(value => value.trim().toLowerCase())
            : [],
    );
    // Structural sum-verification signal (same pattern as rowInspectionService.ts):
    // a row whose fact values match the running sum of preceding detail rows is a
    // subtotal/total even with zero identity text in its descriptor columns — a
    // pattern regex-only detection (SUBTOTAL_ROW_PATTERN/SUMMARY_TOKEN_PATTERN)
    // cannot see. Only relevant for the no-layout (plain tabular) row-role path.
    const signalMap = (!layout && tabularContext && tabularContext.valueColumns.length >= 2)
        ? computeRowRoleSignals({
            rows: rows as Record<string, unknown>[],
            factColumns: tabularContext.valueColumns,
            descriptorColumns: tabularContext.descriptorColumns,
            bodyStartIndex: 0,
            summaryStartIndex: null,
            totalRowCount: rows.length,
        })
        : null;
    const protectedHeaderRows = new Set<number>([
        ...(layout ? [layout.rowIndex] : []),
        ...headerBands
            .filter(candidate => candidate.role === 'series_label_header')
            .flatMap(candidate => candidate.rowIndexes),
    ]);
    const rowRoles = rows.map((row, rowIndex) => {
        if (protectedHeaderRows.has(rowIndex)) {
            return { rowIndex, role: 'noise' as const, confidence: 0.99 };
        }
        if (layout && rowIndex < layout.rowIndex && getNonEmptyValues(row).length > 0) {
            return {
                rowIndex,
                role: 'comment' as const,
                confidence: isReportTitleRow(row) || isMetadataRow(row) ? 0.95 : 0.82,
            };
        }
        if (layout) {
            const rowValues = getNonEmptyValues(row).map(value => value.trim().toLowerCase());
            const repeatedHeaderOverlap = rowValues.filter(value => repeatedHeaderValues.has(value)).length;
            if (repeatedHeaderOverlap >= Math.max(2, Math.floor(repeatedHeaderValues.size * 0.45))) {
                return { rowIndex, role: 'noise' as const, confidence: 0.9 };
            }
        }
        if (dominantSegment && rowIndex > dominantSegment.endRowIndex && getNonEmptyValues(row).length > 0) {
            return { rowIndex, role: 'comment' as const, confidence: 0.76 };
        }
        const role = layout
            ? detectMatrixRowRole(row, layout)
            : detectTabularRowRole(row, tabularContext, signalMap?.get(rowIndex) ?? null);
        return {
            rowIndex,
            ...role,
        };
    });
    return applyVerifiedCodeHierarchyRoles({
        data,
        rowRoles: assignHierarchyDepths(rowRoles),
        descriptorColumns: layout?.descriptorColumns ?? tabularContext?.descriptorColumns ?? [],
        valueColumns: layout?.detailSeriesColumns ?? tabularContext?.valueColumns ?? [],
    });
};

export const detectReportShape = (data: CsvData | null): ReportShapeProfile => {
    const rows = getRows(data);
    if (rows.length === 0) {
        return {
            primaryKind: 'unknown',
            confidence: 0,
            candidates: [],
            signals: [],
            headerBands: [],
            columnRoles: [],
            rowRoles: [],
        };
    }

    const tabularContext = inferTabularShapeContext(data);
    const explicitHeaderLayout = buildExplicitHeaderLayoutCandidate(data, tabularContext);
    // A flat schema is confirmed when the parser identified metadata rows (strong structural evidence),
    // OR when the schema's column names are clearly human-readable labels (contain spaces or metric-style
    // special characters like parentheses/percent signs). Label-style headers indicate a well-parsed
    // ad-platform export or similar fact table, and running in-body header detection on such files
    // causes false positives: data rows with 4-8 digit metric values (e.g. Reach=43993) match
    // CODE_LIKE_PATTERN and incorrectly register as wide-crosstab header candidates.
    const schemaColumnNames = getColumns(data);
    const labelStyleColumnCount = schemaColumnNames.filter(col => /\s/.test(col) || /[()%]/.test(col)).length;
    const columnNamesAreLabelStyle = schemaColumnNames.length >= 5
        && (labelStyleColumnCount / schemaColumnNames.length) >= 0.5;
    const parserResolvedFlatSchema = Boolean(
        data
        && (data.headerDepth ?? 0) === 1
        && (data.headerLayers?.length ?? 0) === 0
        && (
            (data.metadataRows?.length ?? 0) > 0
            || columnNamesAreLabelStyle
        ),
    );
    const headerLayoutCandidates = parserResolvedFlatSchema ? [] : buildHeaderLayoutCandidates(rows);
    const dominantSegment = (explicitHeaderLayout || parserResolvedFlatSchema)
        ? null
        : findDominantTabularSegment(rows, headerLayoutCandidates);
    const headerLayout = explicitHeaderLayout
        ?? (parserResolvedFlatSchema ? null : (dominantSegment?.headerLayout ?? headerLayoutCandidates[0] ?? null));
    const parserMetadataBands = buildParserMetadataBands(data);
    const headerBands = explicitHeaderLayout
        ? buildParserResolvedHeaderBands(data, explicitHeaderLayout)
        : [
            ...parserMetadataBands,
            ...buildHeaderBands(rows, headerLayout).filter(candidate =>
                parserMetadataBands.length === 0 || !['report_title', 'report_metadata'].includes(candidate.role),
            ),
        ];
    const rowRoles = buildRowRoles(data, headerLayout, headerBands, dominantSegment, tabularContext);
    const signals = buildSignals(data, headerLayout, headerBands, rowRoles, tabularContext);
    const hierarchySignal = Number(signals.find(signal => signal.key === 'row_hierarchy_signature')?.value ?? 0);
    const descriptorColumns = sortDescriptorColumns(headerLayout?.descriptorColumns ?? tabularContext?.descriptorColumns ?? []);
    const detailSeriesColumns = headerLayout?.detailSeriesColumns ?? tabularContext?.valueColumns ?? [];
    const summarySeriesColumns = headerLayout?.summarySeriesColumns ?? [];
    const summarySeriesCandidates = headerLayout?.summarySeriesCandidates ?? [];
    const detailSeriesCount = detailSeriesColumns.length;
    const seriesLabelBands = headerBands.filter(candidate => candidate.role === 'series_label_header');
    const hasMatrix = Boolean(headerLayout && seriesLabelBands.length > 0);
    const hasHeader = Boolean(headerLayout);
    const hasTabularContext = Boolean(tabularContext);
    const dominantConfidence = dominantSegment?.confidence ?? 0;
    const mixedSignal = Boolean(dominantSegment?.mixedSignal && dominantSegment.businessRowCount >= 6 && dominantConfidence >= 0.62);

    const candidates = [
        buildCandidate(
            'candidate-matrix',
            'multi_header_matrix',
            hasMatrix
                ? 0.66 + Math.min(0.18, detailSeriesCount / 40) + Math.min(0.12, seriesLabelBands.length * 0.06)
                : 0.1,
            headerBands,
            descriptorColumns,
            detailSeriesColumns,
            summarySeriesColumns,
            summarySeriesCandidates,
            ['top_band_irregularity_ratio', 'detail_series_code_like_ratio'],
        ),
        buildCandidate(
            'candidate-wide',
            'wide_crosstab',
            hasHeader ? 0.56 + Math.min(0.24, detailSeriesCount / 32) + (hasMatrix ? 0 : 0.1) : 0.1,
            headerBands,
            descriptorColumns,
            detailSeriesColumns,
            summarySeriesColumns,
            summarySeriesCandidates,
            ['detail_series_numeric_density', 'summary_series_separability'],
        ),
        buildCandidate(
            'candidate-hierarchical',
            'hierarchical_statement',
            hierarchySignal > 0
                ? 0.44 + Math.min(0.4, hierarchySignal) + (hasHeader ? 0.05 : 0) + (hasTabularContext ? 0.08 : 0)
                : 0.05,
            headerBands,
            descriptorColumns,
            detailSeriesColumns,
            summarySeriesColumns,
            summarySeriesCandidates,
            ['row_hierarchy_signature', 'descriptor_column_stability_ratio'],
        ),
        buildCandidate(
            'candidate-mixed',
            'mixed_report',
            mixedSignal ? 0.56 + Math.min(0.18, dominantConfidence * 0.2) + Math.min(0.14, detailSeriesCount / 40) : 0.08,
            headerBands,
            descriptorColumns,
            detailSeriesColumns,
            summarySeriesColumns,
            summarySeriesCandidates,
            ['top_band_irregularity_ratio', 'placeholder_column_ratio'],
        ),
        buildCandidate(
            'candidate-tabular',
            'already_tabular',
            hasHeader
                ? 0.05
                : 0.74
                    - Math.min(0.25, rows.slice(0, 5).filter(row => isMetadataRow(row) || isReportTitleRow(row)).length / 10)
                    - Math.min(0.2, hierarchySignal * 0.35)
                    + (hasTabularContext ? 0.06 : 0),
            [],
            descriptorColumns.length > 0
                ? descriptorColumns
                : (() => {
                    const schemaColumns = getColumns(data);
                    const positional = schemaColumns.filter(column =>
                        !isCodeLike(column) && !isNumericLike(column) && !isSummaryLike(column),
                    );
                    return positional.length > 0 ? positional.slice(0, 3) : schemaColumns.slice(0, 2);
                })(),
            detailSeriesColumns,
            summarySeriesColumns,
            summarySeriesCandidates,
            ['descriptor_column_stability_ratio'],
        ),
    ]
        .sort((left, right) => right.score - left.score)
        .slice(0, 3);

    const primary = candidates[0];
    const columnRoles: ColumnRoleCandidate[] = [
        ...descriptorColumns.map(columnName => ({ columnName, role: 'descriptor' as const, confidence: hasHeader ? 0.92 : 0.78 })),
        ...detailSeriesColumns.map(columnName => ({ columnName, role: 'detail_series' as const, confidence: hasHeader ? 0.9 : 0.74 })),
        ...summarySeriesCandidates.map(candidate => ({
            columnName: candidate.columnName,
            role: 'summary_series' as const,
            confidence: candidate.confidence,
        })),
    ];

    return {
        primaryKind: primary?.kind ?? 'unknown',
        confidence: primary?.score ?? 0,
        candidates,
        signals,
        headerBands,
        columnRoles,
        rowRoles,
    };
};

export const getPrimaryShapeCandidate = (profile: ReportShapeProfile) =>
    profile.candidates[0] ?? null;

export const getHeaderBandByRole = (profile: ReportShapeProfile, role: HeaderBandCandidate['role']) =>
    getHeaderBandsByRole(profile, role)[0] ?? null;

export const getHeaderBandsByRole = (profile: ReportShapeProfile, role: HeaderBandCandidate['role']) =>
    profile.headerBands
        .filter(candidate => candidate.role === role)
        .sort((left, right) => (left.layerIndex ?? 0) - (right.layerIndex ?? 0) || right.confidence - left.confidence);

export const isWideReportShape = (profile: ReportShapeProfile) =>
    ['wide_crosstab', 'multi_header_matrix', 'mixed_report'].includes(profile.primaryKind);
