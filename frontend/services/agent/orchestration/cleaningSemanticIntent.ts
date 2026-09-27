import type {
    CleaningSemanticIntent,
    CsvData,
    DatasetSemanticSnapshot,
    ReportShapeProfile,
} from '../../../types';
import { getPrimaryShapeCandidate } from '../reportShapeDetector';

const COMPLEX_REPORT_KINDS = new Set([
    'multi_header_matrix',
    'wide_crosstab',
    'hierarchical_statement',
    'mixed_report',
]);

export const isComplexReportShape = (data: CsvData | null, profile: ReportShapeProfile): boolean =>
    (data?.headerDepth ?? 1) > 1 || COMPLEX_REPORT_KINDS.has(profile.primaryKind);

export const buildCleaningSemanticIntent = ({
    data,
    profile,
    snapshot,
}: {
    data: CsvData;
    profile: ReportShapeProfile;
    snapshot: DatasetSemanticSnapshot;
}): CleaningSemanticIntent => {
    const primaryCandidate = getPrimaryShapeCandidate(profile);
    const identifierColumns = snapshot.columnAnnotations
        .filter(annotation => ['entity', 'business_entity', 'business_dimension', 'code'].includes(annotation.semanticRole) && annotation.confidence >= 0.5)
        .map(annotation => annotation.columnName);
    const descriptorColumns = primaryCandidate?.descriptorColumns ?? identifierColumns;
    const labelLayers = data.headerLayers?.map((_, index) => `SeriesLabelL${index + 1}`) ?? [];
    const hierarchySignals = profile.rowRoles.filter(candidate => ['group_header', 'subtotal', 'total'].includes(candidate.role));

    return {
        reportShape: profile.primaryKind,
        headerDepth: data.headerDepth ?? 1,
        descriptorColumns,
        identifierColumns,
        valueSeriesColumns: primaryCandidate?.detailSeriesColumns ?? [],
        labelLayers,
        summaryRowPolicy: snapshot.recommendedAnalysisView.excludedRowCount > 0 ? 'exclude_non_detail_rows' : 'preserve_all_rows',
        targetShape: primaryCandidate?.kind === 'hierarchical_statement' ? 'long_statement_table' : 'long_fact_table',
        preserveHierarchy: hierarchySignals.length > 0,
        preserveSourceCoordinates: true,
        summary: snapshot.summary,
    };
};
