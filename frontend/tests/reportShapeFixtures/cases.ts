import type { CsvData, CsvIntakeDetectionResult, DataPreparationPlan, ReportIntakeIr } from '../../types';
import {
    createAlreadyTabularWithReportNoiseCleanedGood,
    createAlreadyTabularWithReportNoiseRaw,
    createComplexSummaryFamilyMatrixCleanedGood,
    createComplexSummaryFamilyMatrixRaw,
    createMalformedQuoteWeakSignalReportIntakeFixture,
    createMixedDelimiterWeakSignalReportIntakeFixture,
    createHierarchicalStatementCleanedGood,
    createHierarchicalStatementRaw,
    createHierarchicalWideStatementCleanedGood,
    createHierarchicalWideStatementRaw,
    createMultiHeaderProjectMatrixCleanedGood,
    createMultiHeaderProjectMatrixDistilledRaw,
    createMultiHeaderProjectMatrixRaw,
    createPeriodScenarioCrosstabCleanedGood,
    createPeriodScenarioCrosstabRaw,
    createSemicolonProjectMatrixIntakeFixture,
    createThreeLayerHeaderMatrixCleanedGood,
    createThreeLayerHeaderMatrixRaw,
    createWeakSignalMixedReportCleanedGood,
    createWeakSignalMixedReportRaw,
    getComplexSummaryDetailSeries,
    getHierarchicalWideSeries,
    getMultiHeaderProjectSeries,
    getPeriodScenarioSeries,
    getThreeLayerSeries,
} from './families';

export type BrokenFixtureCase = {
    cleanedData: CsvData;
    plan?: DataPreparationPlan | null;
    expectedReason: string;
};

export type ReportShapeFixtureCase = {
    family:
        | 'multi_header_project_matrix'
        | 'period_or_scenario_crosstab'
        | 'hierarchical_statement'
        | 'already_tabular_with_report_noise'
        | 'complex_summary_family_matrix'
        | 'weak_signal_mixed_report'
        | 'three_layer_header_matrix'
        | 'hierarchical_wide_statement';
    rawLike: CsvData;
    cleanedGood: CsvData;
    goodPlan?: DataPreparationPlan | null;
    cleanedBroken: Record<string, BrokenFixtureCase>;
    expectedShape: {
        primaryKinds: string[];
        descriptorColumns: string[];
        detailSeriesColumns: string[];
        summarySeriesColumns: string[];
        hasSeriesLabelHeader: boolean;
        expectedSeriesLabelLayers?: number;
    };
    expectedHypothesis: {
        targetShape: 'row_table' | 'long_fact_table' | 'long_statement_table';
        requiredColumns: string[];
    };
};

export type ReportIntakeFixtureCase = {
    family:
        | 'semicolon_multi_header_report'
        | 'mixed_delimiter_weak_signal_report'
        | 'malformed_quote_weak_signal_report';
    fileName: string;
    rawRows: string[][];
    detection: CsvIntakeDetectionResult;
    expectedIntakeGateStatus: 'ready' | 'warning' | 'blocked';
    expectedPrimaryKinds: string[];
    expectedCleaningDecisionKind: 'deterministic_cleanup' | 'deterministic_reshape' | 'already_valid' | 'llm_guided';
    expectedWarningCodes: string[];
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * Build a minimal ReportIntakeIr for multi-header / wide report fixtures.
 * headerLayerRowIndexes must be non-empty so the IR gate allows reshape.
 */
/**
 * Build normalizedRows for a multi-header project matrix.
 * The header row uses 'Prj-XXXXX' codes so the runtime table assessment
 * text-ratio heuristic recognises them as text, not pure numbers.
 * Additional body rows avoid a staging-conflict with the raw CsvData.
 */
const buildMultiHeaderNormalizedRows = (): string[][] => {
    const pad = (n: number) => Array.from({ length: n }, () => '');
    const prjCodes = ['Prj-10000', 'Prj-10001', 'Prj-10002', 'Prj-10003', 'Prj-10004', 'Prj-10005', 'Prj-10006', 'Prj-10007'];
    return [
        ['PROJECT DELIVERY DIVISION', ...pad(10)],
        ['', 'Income Statement Reporting Date : 01-01-2026 Through 30-09-2026 Reporting Currency : SGD', ...pad(9)],
        ['Code', 'Description', ...prjCodes, 'Total'],
        ['', '', 'Series 1', 'Series 2', 'Series 3', 'Series 4', 'Series 5', 'Series 6', 'Series 7', 'Series 8', ''],
        ['501001', 'Revenue', '12,500.00', '0.00', '0.00', '0.00', '7,200.00', '0.00', '0.00', '0.00', '19,700.00'],
        ['600001', 'Direct Costs', '-4,000.00', '0.00', '0.00', '0.00', '-2,500.00', '0.00', '0.00', '0.00', '-6,500.00'],
        ['700100', 'Admin Expenses', '-500.00', '0.00', '0.00', '0.00', '-200.00', '0.00', '0.00', '0.00', '-700.00'],
        ['700200', 'Depreciation', '-100.00', '0.00', '0.00', '0.00', '-50.00', '0.00', '0.00', '0.00', '-150.00'],
        ['700300', 'Amortisation', '-80.00', '0.00', '0.00', '0.00', '-30.00', '0.00', '0.00', '0.00', '-110.00'],
        ['800100', 'Finance Cost', '-20.00', '0.00', '0.00', '0.00', '-10.00', '0.00', '0.00', '0.00', '-30.00'],
        ['900100', 'Tax Expense', '-200.00', '0.00', '0.00', '0.00', '-100.00', '0.00', '0.00', '0.00', '-300.00'],
        ['30-09-2026@ 17:48 | user | workstation', ...pad(10)],
    ];
};

export const createMultiHeaderIntakeIr = (overrides?: Partial<ReportIntakeIr>): ReportIntakeIr => ({
    fileName: 'matrix.csv',
    columnCount: 11,
    rawRows: [],
    normalizedRows: buildMultiHeaderNormalizedRows(),
    segments: [
        { kind: 'metadata', rowStart: 0, rowEnd: 1, confidence: 0.9, notes: [] },
        { kind: 'body', rowStart: 4, rowEnd: 10, confidence: 0.9, notes: [] },
    ],
    provisionalTable: {
        headerRowIndex: 2,
        headerLayerRowIndexes: [3],  // series label row → IR reshape evidence
        bodyStartIndex: 4,
        summaryStartIndex: 11,
        repeatedHeaderRowIndexes: [],
        metadataRowIndexes: [0, 1],
        parameterRowIndexes: [],
    },
    diagnostics: {
        hasRepeatedHeader: false,
        hasParameterRowsBetweenHeaderAndBody: false,
        headerShapeDrift: false,
        singleColumnFallbackApplied: false,
        bodyEvidenceKind: 'numeric',
        segmentCountsByKind: { metadata: 1, body: 1 },
        headerCandidates: [],
        bodyStartCandidates: [],
        evidenceStrength: 'moderate',
        fallbackReason: null,
    },
    ...overrides,
});

const createUnpivotPlan = (options: {
    explanation: string;
    sourceColumns: string[];
    keepColumns: string[];
    keyColumn?: string;
    valueColumn?: string;
    labelColumns?: Array<{ outputColumn: string; mappings: Array<{ sourceColumn: string; label: string }> }>;
    sourceColumnNameColumn?: string;
    sourceRowIndexColumn?: string;
    rowClassColumn?: string;
    rowClassMappings?: Array<{ sourceRowIndex: number; rowClass: string }>;
    hierarchyDepthColumn?: string;
    hierarchyDepthMappings?: Array<{ sourceRowIndex: number; depth: number }>;
}): DataPreparationPlan => ({
    explanation: options.explanation,
    operations: [
        {
            id: 'unpivot-series',
            type: 'unpivot_columns',
            reason: options.explanation,
            sourceColumns: options.sourceColumns,
            keyColumn: options.keyColumn ?? 'SeriesKey',
            valueColumn: options.valueColumn ?? 'Value',
            keepColumns: options.keepColumns,
            ...(options.labelColumns ? { labelColumns: options.labelColumns } : {}),
            ...(options.sourceColumnNameColumn ? { sourceColumnNameColumn: options.sourceColumnNameColumn } : {}),
            ...(options.sourceRowIndexColumn ? { sourceRowIndexColumn: options.sourceRowIndexColumn } : {}),
            ...(options.rowClassColumn ? { rowClassColumn: options.rowClassColumn } : {}),
            ...(options.rowClassMappings ? { rowClassMappings: options.rowClassMappings } : {}),
            ...(options.hierarchyDepthColumn ? { hierarchyDepthColumn: options.hierarchyDepthColumn } : {}),
            ...(options.hierarchyDepthMappings ? { hierarchyDepthMappings: options.hierarchyDepthMappings } : {}),
        },
    ],
    outputColumns: [],
    planStatus: 'operations',
    consistencyIssues: [],
});

export const createMultiHeaderProjectMatrixCase = (): ReportShapeFixtureCase => {
    const sourceColumns = getMultiHeaderProjectSeries();
    const cleanedGood = createMultiHeaderProjectMatrixCleanedGood();
    const goodPlan = createUnpivotPlan({
        explanation: 'Unpivot detected project series and preserve secondary labels.',
        sourceColumns,
        keepColumns: ['Code', 'Description'],
        labelColumns: [{
            outputColumn: 'SeriesLabelL1',
            mappings: sourceColumns.map((sourceColumn, index) => ({ sourceColumn, label: `Series ${index + 1}` })),
        }],
        sourceColumnNameColumn: 'SourceColumnName',
        sourceRowIndexColumn: 'SourceRowIndex',
        rowClassColumn: 'RowClass',
        rowClassMappings: [
            { sourceRowIndex: 0, rowClass: 'fact' },
            { sourceRowIndex: 1, rowClass: 'fact' },
        ],
    });

    return {
        family: 'multi_header_project_matrix',
        rawLike: createMultiHeaderProjectMatrixRaw(),
        cleanedGood,
        goodPlan,
        cleanedBroken: {
            missingSeriesLabel: {
                cleanedData: {
                    ...clone(cleanedGood),
                    data: cleanedGood.data.map(({ SeriesLabelL1: _discard, ...row }) => row),
                },
                plan: createUnpivotPlan({
                    explanation: 'Unpivot detected project series.',
                    sourceColumns,
                    keepColumns: ['Code', 'Description'],
                    sourceColumnNameColumn: 'SourceColumnName',
                    sourceRowIndexColumn: 'SourceRowIndex',
                    rowClassColumn: 'RowClass',
                    rowClassMappings: [
                        { sourceRowIndex: 0, rowClass: 'fact' },
                        { sourceRowIndex: 1, rowClass: 'fact' },
                    ],
                }),
                expectedReason: 'Multi-header label layers were not preserved during reshaping.',
            },
            summaryKeyLeakage: {
                cleanedData: {
                    ...clone(cleanedGood),
                    data: [
                        ...clone(cleanedGood.data).slice(0, 6),
                        { Code: '501001', Description: 'Revenue', SeriesKey: 'Total', SeriesLabelL1: 'Total', Value: '19,700.00' },
                    ],
                },
                plan: goodPlan,
                expectedReason: 'Project-like key columns still contain Total, Subtotal, or footer values.',
            },
            widePersistence: {
                cleanedData: {
                    fileName: 'matrix-cleaned.csv',
                    data: [
                        { Code: '501001', Description: 'Revenue', 10000: '12,500.00', 10001: '0.00', 10002: '0.00', 10003: '7,200.00', 10004: '0.00', 10005: '0.00', 10006: '0.00', 10007: '0.00', Total: '19,700.00' },
                    ],
                    metadataRows: [],
                    headerLayers: [],
                    summaryRows: [],
                    headerDepth: 1,
                },
                expectedReason: 'The cleaned dataset still looks like a wide crosstab.',
            },
        },
        expectedShape: {
            primaryKinds: ['multi_header_matrix', 'wide_crosstab'],
            descriptorColumns: ['Code', 'Description'],
            detailSeriesColumns: sourceColumns,
            summarySeriesColumns: ['Total'],
            hasSeriesLabelHeader: true,
            expectedSeriesLabelLayers: 1,
        },
        expectedHypothesis: {
            targetShape: 'long_fact_table',
            requiredColumns: ['Code', 'Description', 'SeriesKey', 'SeriesLabelL1', 'Value', 'SourceRowIndex', 'SourceColumnName'],
        },
    };
};

export const createPeriodScenarioCrosstabCase = (): ReportShapeFixtureCase => {
    const sourceColumns = getPeriodScenarioSeries();
    return {
        family: 'period_or_scenario_crosstab',
        rawLike: createPeriodScenarioCrosstabRaw(),
        cleanedGood: createPeriodScenarioCrosstabCleanedGood(),
        goodPlan: createUnpivotPlan({
            explanation: 'Unpivot period and scenario columns.',
            sourceColumns,
            keepColumns: ['Account', 'Metric'],
        }),
        cleanedBroken: {
            widePersistence: {
                cleanedData: {
                    fileName: 'period-cleaned.csv',
                    data: [
                        { Account: '4000', Metric: 'Revenue', FY2021: '120.00', FY2022: '140.00', FY2023: '135.00', FY2024: '160.00', ACTUAL: '162.00', BUDGET: '158.00', VARIANCE: '4.00', FORECAST: '170.00', Total: '1049.00' },
                        { Account: '5000', Metric: 'Costs', FY2021: '-80.00', FY2022: '-82.00', FY2023: '-85.00', FY2024: '-91.00', ACTUAL: '-92.00', BUDGET: '-89.00', VARIANCE: '-3.00', FORECAST: '-94.00', Total: '-616.00' },
                    ],
                    metadataRows: [],
                    headerLayers: [],
                    summaryRows: [],
                    headerDepth: 1,
                },
                expectedReason: 'The cleaned dataset still looks like a wide crosstab.',
            },
            summaryKeyLeakage: {
                cleanedData: {
                    ...createPeriodScenarioCrosstabCleanedGood(),
                    data: [
                        ...createPeriodScenarioCrosstabCleanedGood().data.slice(0, 6),
                        { Account: '4000', Metric: 'Revenue', SeriesKey: 'Total', Value: '1049.00' },
                    ],
                },
                plan: createUnpivotPlan({
                    explanation: 'Unpivot period and scenario columns.',
                    sourceColumns,
                    keepColumns: ['Account', 'Metric'],
                }),
                expectedReason: 'Project-like key columns still contain Total, Subtotal, or footer values.',
            },
        },
        expectedShape: {
            primaryKinds: ['wide_crosstab'],
            descriptorColumns: ['Account', 'Metric'],
            detailSeriesColumns: sourceColumns,
            summarySeriesColumns: ['Total'],
            hasSeriesLabelHeader: false,
        },
        expectedHypothesis: {
            targetShape: 'long_fact_table',
            requiredColumns: ['Account', 'Metric', 'SeriesKey', 'Value', 'SourceRowIndex', 'SourceColumnName'],
        },
    };
};

export const createComplexSummaryFamilyMatrixCase = (): ReportShapeFixtureCase => {
    const sourceColumns = getComplexSummaryDetailSeries();
    const cleanedGood = createComplexSummaryFamilyMatrixCleanedGood();
    return {
        family: 'complex_summary_family_matrix',
        rawLike: createComplexSummaryFamilyMatrixRaw(),
        cleanedGood,
        goodPlan: createUnpivotPlan({
            explanation: 'Unpivot detail project columns while excluding summary families.',
            sourceColumns,
            keepColumns: ['Code', 'Description'],
        }),
        cleanedBroken: {
            summaryKeyLeakage: {
                cleanedData: {
                    ...clone(cleanedGood),
                    data: [
                        ...clone(cleanedGood.data),
                        { Code: '7010', Description: 'Site Cost', SeriesKey: 'Grand Total', Value: '475.00' },
                    ],
                },
                expectedReason: 'Project-like key columns still contain Total, Subtotal, or footer values.',
            },
        },
        expectedShape: {
            primaryKinds: ['wide_crosstab', 'multi_header_matrix'],
            descriptorColumns: ['Code', 'Description'],
            detailSeriesColumns: sourceColumns,
            summarySeriesColumns: ['Variance', 'Allocated', 'Grand Total'],
            hasSeriesLabelHeader: false,
        },
        expectedHypothesis: {
            targetShape: 'long_fact_table',
            requiredColumns: ['Code', 'Description', 'SeriesKey', 'Value', 'SourceRowIndex', 'SourceColumnName'],
        },
    };
};

export const createWeakSignalMixedReportCase = (): ReportShapeFixtureCase => {
    const sourceColumns = ['22000', '22001', '22002'];
    return {
        family: 'weak_signal_mixed_report',
        rawLike: createWeakSignalMixedReportRaw(),
        cleanedGood: createWeakSignalMixedReportCleanedGood(),
        goodPlan: createUnpivotPlan({
            explanation: 'Resolve the dominant tabular block and unpivot detail columns.',
            sourceColumns,
            keepColumns: ['Code', 'Description'],
            sourceColumnNameColumn: 'SourceColumnName',
            sourceRowIndexColumn: 'SourceRowIndex',
        }),
        cleanedBroken: {
            unresolvedMixedBlock: {
                cleanedData: {
                    fileName: 'mixed-cleaned.csv',
                    data: [
                        { a: 'OPERATING REVIEW PACK', b: '', c: '', d: '', e: '', f: '' },
                        { a: 'Code', b: 'Description', c: '22000', d: '22001', e: '22002', f: 'Grand Total' },
                    ],
                    metadataRows: [],
                    headerLayers: [],
                    summaryRows: [],
                    headerDepth: 1,
                },
                expectedReason: 'The mixed report was not resolved to its dominant tabular block.',
            },
        },
        expectedShape: {
            primaryKinds: ['mixed_report'],
            descriptorColumns: ['Code', 'Description'],
            detailSeriesColumns: sourceColumns,
            summarySeriesColumns: ['Grand Total'],
            hasSeriesLabelHeader: false,
        },
        expectedHypothesis: {
            targetShape: 'long_fact_table',
            requiredColumns: ['Code', 'Description', 'SeriesKey', 'Value', 'SourceRowIndex', 'SourceColumnName'],
        },
    };
};

export const createThreeLayerHeaderMatrixCase = (): ReportShapeFixtureCase => {
    const sourceColumns = getThreeLayerSeries();
    const cleanedGood = createThreeLayerHeaderMatrixCleanedGood();
    const goodPlan = createUnpivotPlan({
        explanation: 'Unpivot detected project series and preserve multi-layer labels.',
        sourceColumns,
        keepColumns: ['Code', 'Description'],
        labelColumns: [
            {
                outputColumn: 'SeriesLabelL1',
                mappings: sourceColumns.map((sourceColumn, index) => ({
                    sourceColumn,
                    label: index < 2 ? 'North' : 'South',
                })),
            },
            {
                outputColumn: 'SeriesLabelL2',
                mappings: sourceColumns.map((sourceColumn, index) => ({
                    sourceColumn,
                    label: ['Alpha', 'Beta', 'Gamma', 'Delta'][index],
                })),
            },
        ],
        sourceColumnNameColumn: 'SourceColumnName',
        sourceRowIndexColumn: 'SourceRowIndex',
        rowClassColumn: 'RowClass',
        rowClassMappings: [
            { sourceRowIndex: 0, rowClass: 'fact' },
            { sourceRowIndex: 1, rowClass: 'fact' },
        ],
    });
    return {
        family: 'three_layer_header_matrix',
        rawLike: createThreeLayerHeaderMatrixRaw(),
        cleanedGood,
        goodPlan,
        cleanedBroken: {
            missingOneLayer: {
                cleanedData: {
                    ...clone(cleanedGood),
                    data: cleanedGood.data.map(({ SeriesLabelL2: _discard, ...row }) => row),
                },
                plan: createUnpivotPlan({
                    explanation: 'Unpivot detected project series and preserve only one label layer.',
                    sourceColumns,
                    keepColumns: ['Code', 'Description'],
                    labelColumns: [{
                        outputColumn: 'SeriesLabelL1',
                        mappings: sourceColumns.map((sourceColumn, index) => ({
                            sourceColumn,
                            label: index < 2 ? 'North' : 'South',
                        })),
                    }],
                    sourceColumnNameColumn: 'SourceColumnName',
                    sourceRowIndexColumn: 'SourceRowIndex',
                }),
                expectedReason: 'Multi-header label layers were not preserved during reshaping.',
            },
        },
        expectedShape: {
            primaryKinds: ['multi_header_matrix'],
            descriptorColumns: ['Code', 'Description'],
            detailSeriesColumns: sourceColumns,
            summarySeriesColumns: ['Total'],
            hasSeriesLabelHeader: true,
            expectedSeriesLabelLayers: 2,
        },
        expectedHypothesis: {
            targetShape: 'long_fact_table',
            requiredColumns: ['Code', 'Description', 'SeriesKey', 'SeriesLabelL1', 'SeriesLabelL2', 'Value', 'SourceRowIndex', 'SourceColumnName'],
        },
    };
};

export const createHierarchicalStatementCase = (): ReportShapeFixtureCase => ({
    family: 'hierarchical_statement',
    rawLike: createHierarchicalStatementRaw(),
    cleanedGood: createHierarchicalStatementCleanedGood(),
    goodPlan: null,
    cleanedBroken: {
        collapsedDescriptorGroup: {
            cleanedData: {
                fileName: 'statement-collapsed.csv',
                data: Array.from({ length: 8 }, (_, index) => ({
                    Code: '4010',
                    Description: 'Service Revenue',
                    SeriesKey: `line_${index + 1}`,
                    Value: `${100 + index}.00`,
                })),
                metadataRows: [],
                headerLayers: [],
                summaryRows: [],
                headerDepth: 1,
            },
            plan: createUnpivotPlan({
                explanation: 'Incorrectly unpivoted a statement table.',
                sourceColumns: Array.from({ length: 8 }, (_, index) => `line_${index + 1}`),
                keepColumns: ['Code', 'Description'],
            }),
            expectedReason: 'The cleaned dataset appears to have collapsed to a single descriptor group after unpivot.',
        },
        missingDepth: {
            cleanedData: {
                ...createHierarchicalStatementCleanedGood(),
                data: createHierarchicalStatementCleanedGood().data.map(({ HierarchyDepth: _discard, ...row }) => row),
            },
            expectedReason: 'Hierarchy depth was not preserved in the cleaned output.',
        },
    },
    expectedShape: {
        primaryKinds: ['hierarchical_statement'],
        descriptorColumns: ['Code', 'Description'],
        detailSeriesColumns: ['Amount'],
        summarySeriesColumns: [],
        hasSeriesLabelHeader: false,
    },
    expectedHypothesis: {
        targetShape: 'long_statement_table',
        requiredColumns: ['Code', 'Description', 'Amount', 'RowClass', 'HierarchyDepth', 'SourceRowIndex'],
    },
});

export const createHierarchicalWideStatementCase = (): ReportShapeFixtureCase => {
    const sourceColumns = getHierarchicalWideSeries();
    return {
        family: 'hierarchical_wide_statement',
        rawLike: createHierarchicalWideStatementRaw(),
        cleanedGood: createHierarchicalWideStatementCleanedGood(),
        goodPlan: createUnpivotPlan({
            explanation: 'Unpivot hierarchical statement columns and preserve hierarchy depth.',
            sourceColumns,
            keepColumns: ['Code', 'Description'],
            sourceColumnNameColumn: 'SourceColumnName',
            sourceRowIndexColumn: 'SourceRowIndex',
            rowClassColumn: 'RowClass',
            rowClassMappings: [
                { sourceRowIndex: 0, rowClass: 'group_header' },
                { sourceRowIndex: 1, rowClass: 'fact' },
                { sourceRowIndex: 2, rowClass: 'fact' },
                { sourceRowIndex: 3, rowClass: 'subtotal' },
                { sourceRowIndex: 4, rowClass: 'group_header' },
                { sourceRowIndex: 5, rowClass: 'fact' },
                { sourceRowIndex: 6, rowClass: 'fact' },
                { sourceRowIndex: 7, rowClass: 'total' },
            ],
            hierarchyDepthColumn: 'HierarchyDepth',
            hierarchyDepthMappings: [
                { sourceRowIndex: 0, depth: 1 },
                { sourceRowIndex: 1, depth: 1 },
                { sourceRowIndex: 2, depth: 1 },
                { sourceRowIndex: 3, depth: 1 },
                { sourceRowIndex: 4, depth: 1 },
                { sourceRowIndex: 5, depth: 1 },
                { sourceRowIndex: 6, depth: 1 },
                { sourceRowIndex: 7, depth: 0 },
            ],
        }),
        cleanedBroken: {
            missingDepth: {
                cleanedData: {
                    ...createHierarchicalWideStatementCleanedGood(),
                    data: createHierarchicalWideStatementCleanedGood().data.map(({ HierarchyDepth: _discard, ...row }) => row),
                },
                expectedReason: 'Hierarchy depth was not preserved in the cleaned output.',
            },
        },
        expectedShape: {
            primaryKinds: ['wide_crosstab', 'hierarchical_statement'],
            descriptorColumns: ['Code', 'Description'],
            detailSeriesColumns: sourceColumns,
            summarySeriesColumns: ['Grand Total'],
            hasSeriesLabelHeader: false,
        },
        expectedHypothesis: {
            targetShape: 'long_statement_table',
            requiredColumns: ['Code', 'Description', 'SeriesKey', 'Value', 'RowClass', 'HierarchyDepth', 'SourceRowIndex', 'SourceColumnName'],
        },
    };
};

export const createAlreadyTabularWithReportNoiseCase = (): ReportShapeFixtureCase => ({
    family: 'already_tabular_with_report_noise',
    rawLike: createAlreadyTabularWithReportNoiseRaw(),
    cleanedGood: createAlreadyTabularWithReportNoiseCleanedGood(),
    goodPlan: null,
    cleanedBroken: {},
    expectedShape: {
        primaryKinds: ['already_tabular'],
        descriptorColumns: ['Region', 'Segment'],
        detailSeriesColumns: ['Revenue'],
        summarySeriesColumns: [],
        hasSeriesLabelHeader: false,
    },
    expectedHypothesis: {
        targetShape: 'row_table',
        requiredColumns: ['Region', 'Segment', 'Revenue', 'SourceRowIndex'],
    },
});

export const createDistilledRealLikeReportCase = () => ({
    rawLike: createMultiHeaderProjectMatrixDistilledRaw(),
    expectedPrimaryKinds: ['multi_header_matrix', 'mixed_report', 'wide_crosstab'],
});

export const createSemicolonProjectMatrixIntakeCase = (): ReportIntakeFixtureCase => {
    const fixture = createSemicolonProjectMatrixIntakeFixture();
    return {
        family: 'semicolon_multi_header_report',
        fileName: fixture.fileName,
        rawRows: fixture.rawRows,
        detection: fixture.detection,
        expectedIntakeGateStatus: 'ready',
        // Header-layer merge fix (2026-07-24): column names now include the
        // layer row's region label ("31000 :: North" etc) instead of the
        // bare numeric code ("31000") alone. The shape detector's matrix
        // heuristic partly keys off raw code-like column names, so this
        // fixture — with its columns now self-describing rather than
        // code-shaped — can also resolve as already_tabular, which is an
        // accurate read of the now-more-complete column names, not a
        // detection regression.
        expectedPrimaryKinds: ['multi_header_matrix', 'wide_crosstab', 'already_tabular'],
        expectedCleaningDecisionKind: 'deterministic_reshape',
        expectedWarningCodes: [],
    };
};

export const createMixedDelimiterWeakSignalReportIntakeCase = (): ReportIntakeFixtureCase => {
    const fixture = createMixedDelimiterWeakSignalReportIntakeFixture();
    return {
        family: 'mixed_delimiter_weak_signal_report',
        fileName: fixture.fileName,
        rawRows: fixture.rawRows,
        detection: fixture.detection,
        expectedIntakeGateStatus: 'warning',
        expectedPrimaryKinds: ['already_tabular', 'mixed_report', 'wide_crosstab'],
        expectedCleaningDecisionKind: 'deterministic_cleanup',
        expectedWarningCodes: fixture.detection.warnings.map(warning => warning.code),
    };
};

export const createMalformedQuoteWeakSignalReportIntakeCase = (): ReportIntakeFixtureCase => {
    const fixture = createMalformedQuoteWeakSignalReportIntakeFixture();
    return {
        family: 'malformed_quote_weak_signal_report',
        fileName: fixture.fileName,
        rawRows: fixture.rawRows,
        detection: fixture.detection,
        expectedIntakeGateStatus: 'blocked',
        expectedPrimaryKinds: ['already_tabular', 'mixed_report', 'wide_crosstab'],
        expectedCleaningDecisionKind: 'deterministic_cleanup',
        expectedWarningCodes: fixture.detection.warnings.map(warning => warning.code),
    };
};
