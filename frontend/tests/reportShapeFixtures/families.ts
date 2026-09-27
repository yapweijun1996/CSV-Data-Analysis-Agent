import type { CsvData, CsvIntakeDetectionResult } from '../../types';

export type ReportIntakeFixture = {
    fileName: string;
    rawRows: string[][];
    detection: CsvIntakeDetectionResult;
};

const withCsvData = (fileName: string, data: CsvData['data']): CsvData => ({
    fileName,
    data,
    metadataRows: [],
    headerLayers: [],
    summaryRows: [],
    headerDepth: 1,
});

const cloneRawRows = (rows: string[][]): string[][] => rows.map(row => [...row]);

const projectSeries = ['10000', '10001', '10002', '10003', '10004', '10005', '10006', '10007'];
const periodSeries = ['FY2021', 'FY2022', 'FY2023', 'FY2024', 'ACTUAL', 'BUDGET', 'VARIANCE', 'FORECAST'];
const summarySeries = ['11000', '11001', '11002', '11003'];
const threeLayerSeries = ['31000', '31001', '31002', '31003'];
const hierarchicalSeries = ['21000', '21001'];

export const getMultiHeaderProjectSeries = () => [...projectSeries];
export const getPeriodScenarioSeries = () => [...periodSeries];
export const getComplexSummaryDetailSeries = () => [...summarySeries];
export const getThreeLayerSeries = () => [...threeLayerSeries];
export const getHierarchicalWideSeries = () => [...hierarchicalSeries];

export const createWeakSignalMixedReportRawRows = (): string[][] => cloneRawRows([
    ['OPERATING REVIEW PACK', '', '', '', '', ''],
    ['', 'Extracted on 2026-09-30', '', '', '', ''],
    ['Section: Delivery Snapshot', '', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['Code', 'Description', '22000', '22001', '22002', 'Grand Total'],
    ['8100', 'Reactive Jobs', '150.00', '120.00', '110.00', '380.00'],
    ['8110', 'Call-Out Jobs', '90.00', '100.00', '80.00', '270.00'],
    ['8120', 'Standby Jobs', '70.00', '65.00', '75.00', '210.00'],
    ['Code', 'Description', '22000', '22001', '22002', 'Grand Total'],
    ['8200', 'Planned Jobs', '100.00', '105.00', '115.00', '320.00'],
    ['8210', 'Shutdown Work', '110.00', '115.00', '95.00', '320.00'],
    ['8220', 'Retrofit Jobs', '85.00', '88.00', '92.00', '265.00'],
    ['Printed by runtime', '', '', '', '', ''],
]);

export const createSemicolonProjectMatrixIntakeFixture = (): ReportIntakeFixture => ({
    fileName: 'report-semicolon.csv',
    rawRows: [
        ['BOUSTEAD PROJECTS E&C PTE LTD', '', '', '', '', '', ''],
        ['Income Statement By Project', '', '', '', '', '', ''],
        ['Code', 'Description', '31000', '31001', '31002', '31003', 'Total'],
        ['Labels', '', 'North', 'South', 'East', 'West', ''],
        ['501001', 'Revenue', '10.00', '12.00', '9.00', '11.00', '42.00'],
        ['Generated on 2026-03-13', '', '', '', '', '', ''],
    ],
    detection: {
        strategy: 'scored_candidate',
        confidence: 'high',
        delimiter: ';',
        quoteChar: null,
        warnings: [],
    },
});

export const createMixedDelimiterWeakSignalReportIntakeFixture = (): ReportIntakeFixture => ({
    fileName: 'mixed-delimiter-report.csv',
    rawRows: createWeakSignalMixedReportRawRows(),
    detection: {
        strategy: 'papaparse_auto_fallback',
        confidence: 'low',
        delimiter: ',',
        quoteChar: '"',
        warnings: [
            {
                code: 'mixed_delimiter',
                message: 'Multiple delimiter patterns were detected in the CSV sample, so the imported structure should be reviewed.',
            },
            {
                code: 'low_confidence',
                message: 'CSV dialect detection confidence is limited, so the imported structure should be reviewed in diagnostics.',
            },
        ],
    },
});

export const createMalformedQuoteWeakSignalReportIntakeFixture = (): ReportIntakeFixture => ({
    fileName: 'malformed-quote-report.csv',
    rawRows: createWeakSignalMixedReportRawRows(),
    detection: {
        strategy: 'papaparse_auto_fallback',
        confidence: 'low',
        delimiter: ',',
        quoteChar: '"',
        warnings: [
            {
                code: 'malformed_quote',
                message: 'Quoted fields appeared malformed while sampling the CSV dialect, so the imported structure may be unreliable.',
            },
            {
                code: 'parse_errors',
                message: 'Parser reported 2 issues while evaluating the selected CSV dialect.',
            },
        ],
        parserErrorCount: 2,
    },
});

export const createMultiHeaderProjectMatrixRaw = (): CsvData =>
    withCsvData('matrix.csv', [
        Object.fromEntries([
            ['col_1', 'PROJECT DELIVERY DIVISION'],
            ...projectSeries.map((_, index) => [`col_${index + 2}`, '']),
            ['col_10', ''],
        ]),
        Object.fromEntries([
            ['col_1', ''],
            ['col_2', 'Income Statement Reporting Date : 01-01-2026 Through 30-09-2026 Reporting Currency : SGD'],
            ...projectSeries.map((_, index) => [`col_${index + 3}`, '']),
        ]),
        Object.fromEntries([
            ['col_1', 'Code'],
            ['col_2', 'Description'],
            ...projectSeries.map((column, index) => [`col_${index + 3}`, column]),
            ['col_11', 'Total'],
        ]),
        Object.fromEntries([
            ['col_1', ''],
            ['col_2', ''],
            ...projectSeries.map((_, index) => [`col_${index + 3}`, `Series ${index + 1}`]),
            ['col_11', ''],
        ]),
        Object.fromEntries([
            ['col_1', '501001'],
            ['col_2', 'Revenue'],
            ...projectSeries.map((_, index) => [`col_${index + 3}`, index === 0 ? '12,500.00' : index === 3 ? '7,200.00' : '0.00']),
            ['col_11', '19,700.00'],
        ]),
        Object.fromEntries([
            ['col_1', '600001'],
            ['col_2', 'Direct Costs'],
            ...projectSeries.map((_, index) => [`col_${index + 3}`, index === 0 ? '-4,000.00' : index === 3 ? '-2,500.00' : '0.00']),
            ['col_11', '-6,500.00'],
        ]),
        { col_1: '30-09-2026@ 17:48 | user | workstation' },
    ]);

export const createMultiHeaderProjectMatrixDistilledRaw = (): CsvData =>
    withCsvData('distilled-matrix.csv', [
        { a: 'OPERATIONS SUMMARY', b: '', c: '', d: '', e: '', f: '', g: '', h: '', i: '', j: '' },
        { a: '', b: 'Statement Through 30-09-2026 Currency : SGD', c: '', d: '', e: '', f: '', g: '', h: '', i: '', j: '' },
        { a: 'Code', b: 'Description', c: '17164', d: '17165', e: '18180', f: 'CORP_A', g: 'REGION_B', h: 'Total', i: '', j: '' },
        { a: '', b: '', c: 'Client 1', d: 'Client 2', e: 'Client 3', f: 'Shared Cost', g: 'Regional Cost', h: '', i: '', j: '' },
        { a: '700100', b: 'Administrative Fees', c: '100.00', d: '0.00', e: '80.00', f: '40.00', g: '15.00', h: '235.00', i: '', j: '' },
    ]);

export const createPeriodScenarioCrosstabRaw = (): CsvData =>
    withCsvData('period-crosstab.csv', [
        { Account: 'Performance Summary', Metric: '', FY2021: '', FY2022: '', FY2023: '', FY2024: '', ACTUAL: '', BUDGET: '', VARIANCE: '', FORECAST: '', Total: '' },
        { Account: '', Metric: 'Period Comparison Through 2026-09', FY2021: '', FY2022: '', FY2023: '', FY2024: '', ACTUAL: '', BUDGET: '', VARIANCE: '', FORECAST: '', Total: '' },
        { Account: 'Account', Metric: 'Metric', FY2021: 'FY2021', FY2022: 'FY2022', FY2023: 'FY2023', FY2024: 'FY2024', ACTUAL: 'ACTUAL', BUDGET: 'BUDGET', VARIANCE: 'VARIANCE', FORECAST: 'FORECAST', Total: 'Total' },
        { Account: '4000', Metric: 'Revenue', FY2021: '120.00', FY2022: '140.00', FY2023: '135.00', FY2024: '160.00', ACTUAL: '162.00', BUDGET: '158.00', VARIANCE: '4.00', FORECAST: '170.00', Total: '1049.00' },
        { Account: '5000', Metric: 'Costs', FY2021: '-80.00', FY2022: '-82.00', FY2023: '-85.00', FY2024: '-91.00', ACTUAL: '-92.00', BUDGET: '-89.00', VARIANCE: '-3.00', FORECAST: '-94.00', Total: '-616.00' },
        { Account: '6000', Metric: 'Gross Margin', FY2021: '40.00', FY2022: '58.00', FY2023: '50.00', FY2024: '69.00', ACTUAL: '70.00', BUDGET: '69.00', VARIANCE: '1.00', FORECAST: '76.00', Total: '433.00' },
        { Account: 'Printed by runtime', Metric: '', FY2021: '', FY2022: '', FY2023: '', FY2024: '', ACTUAL: '', BUDGET: '', VARIANCE: '', FORECAST: '', Total: '' },
    ]);

export const createComplexSummaryFamilyMatrixRaw = (): CsvData =>
    withCsvData('summary-matrix.csv', [
        { c1: 'DELIVERY COST REVIEW', c2: '', c3: '', c4: '', c5: '', c6: '', c7: '', c8: '', c9: '' },
        { c1: '', c2: 'Reporting Period 2026-09', c3: '', c4: '', c5: '', c6: '', c7: '', c8: '', c9: '' },
        { c1: 'Code', c2: 'Description', c3: '11000', c4: '11001', c5: '11002', c6: '11003', c7: 'Variance', c8: 'Allocated', c9: 'Grand Total' },
        { c1: '7010', c2: 'Site Cost', c3: '120.00', c4: '90.00', c5: '140.00', c6: '100.00', c7: '10.00', c8: '25.00', c9: '475.00' },
        { c1: '7020', c2: 'Shared Labour', c3: '80.00', c4: '75.00', c5: '95.00', c6: '70.00', c7: '-5.00', c8: '20.00', c9: '335.00' },
        { c1: '7030', c2: 'Equipment', c3: '45.00', c4: '60.00', c5: '55.00', c6: '40.00', c7: '5.00', c8: '10.00', c9: '215.00' },
        { c1: 'Printed by runtime', c2: '', c3: '', c4: '', c5: '', c6: '', c7: '', c8: '', c9: '' },
    ]);

export const createWeakSignalMixedReportRaw = (): CsvData =>
    withCsvData('mixed-report.csv', [
        { a: 'OPERATING REVIEW PACK', b: '', c: '', d: '', e: '', f: '' },
        { a: '', b: 'Extracted on 2026-09-30', c: '', d: '', e: '', f: '' },
        { a: 'Section: Delivery Snapshot', b: '', c: '', d: '', e: '', f: '' },
        { a: '', b: '', c: '', d: '', e: '', f: '' },
        { a: 'Code', b: 'Description', c: '22000', d: '22001', e: '22002', f: 'Grand Total' },
        { a: '8100', b: 'Reactive Jobs', c: '150.00', d: '120.00', e: '110.00', f: '380.00' },
        { a: '8110', b: 'Call-Out Jobs', c: '90.00', d: '100.00', e: '80.00', f: '270.00' },
        { a: '8120', b: 'Standby Jobs', c: '70.00', d: '65.00', e: '75.00', f: '210.00' },
        { a: 'Code', b: 'Description', c: '22000', d: '22001', e: '22002', f: 'Grand Total' },
        { a: '8200', b: 'Planned Jobs', c: '100.00', d: '105.00', e: '115.00', f: '320.00' },
        { a: '8210', b: 'Shutdown Work', c: '110.00', d: '115.00', e: '95.00', f: '320.00' },
        { a: '8220', b: 'Retrofit Jobs', c: '85.00', d: '88.00', e: '92.00', f: '265.00' },
        { a: 'Printed by runtime', b: '', c: '', d: '', e: '', f: '' },
    ]);

export const createThreeLayerHeaderMatrixRaw = (): CsvData =>
    withCsvData('three-layer-matrix.csv', [
        { c1: 'PROJECT REGION MATRIX', c2: '', c3: '', c4: '', c5: '', c6: '', c7: '' },
        { c1: '', c2: 'As of 2026-09', c3: '', c4: '', c5: '', c6: '', c7: '' },
        { c1: 'Code', c2: 'Description', c3: '31000', c4: '31001', c5: '31002', c6: '31003', c7: 'Total' },
        { c1: '', c2: '', c3: 'North', c4: 'North', c5: 'South', c6: 'South', c7: '' },
        { c1: '', c2: '', c3: 'Alpha', c4: 'Beta', c5: 'Gamma', c6: 'Delta', c7: '' },
        { c1: '9010', c2: 'Revenue', c3: '120.00', c4: '130.00', c5: '90.00', c6: '110.00', c7: '450.00' },
        { c1: '9020', c2: 'Costs', c3: '-50.00', c4: '-45.00', c5: '-30.00', c6: '-35.00', c7: '-160.00' },
        { c1: 'Printed by runtime', c2: '', c3: '', c4: '', c5: '', c6: '', c7: '' },
    ]);

export const createHierarchicalStatementRaw = (): CsvData =>
    withCsvData('statement.csv', [
        { Code: '', Description: 'Management Statement', Amount: '' },
        { Code: '', Description: 'Reporting Period 2026-09', Amount: '' },
        { Code: '', Description: 'Revenue', Amount: '' },
        { Code: '4010', Description: 'Service Revenue', Amount: '1200.00' },
        { Code: '4020', Description: 'Recurring Revenue', Amount: '800.00' },
        { Code: '4030', Description: 'Professional Services', Amount: '450.00' },
        { Code: '', Description: 'Cost of Sales', Amount: '' },
        { Code: '5010', Description: 'Materials', Amount: '-300.00' },
        { Code: '5020', Description: 'Subcontractors', Amount: '-200.00' },
        { Code: '5030', Description: 'Travel', Amount: '-90.00' },
        { Code: '', Description: 'Subtotal', Amount: '1860.00' },
        { Code: '', Description: 'Net Profit', Amount: '1860.00' },
        { Code: '', Description: 'Printed by runtime', Amount: '' },
    ]);

export const createHierarchicalWideStatementRaw = (): CsvData =>
    withCsvData('hierarchical-wide.csv', [
        { a: 'PROJECT FINANCIAL STACK', b: '', c: '', d: '', e: '' },
        { a: '', b: 'Reporting Period 2026-09', c: '', d: '', e: '' },
        { a: 'Code', b: 'Description', c: '21000', d: '21001', e: 'Grand Total' },
        { a: '', b: 'Revenue', c: '', d: '', e: '' },
        { a: '4010', b: 'Service Revenue', c: '600.00', d: '500.00', e: '1100.00' },
        { a: '4020', b: 'Recurring Revenue', c: '400.00', d: '300.00', e: '700.00' },
        { a: '', b: 'Subtotal', c: '1000.00', d: '800.00', e: '1800.00' },
        { a: '', b: 'Cost of Sales', c: '', d: '', e: '' },
        { a: '5010', b: 'Materials', c: '-200.00', d: '-180.00', e: '-380.00' },
        { a: '5020', b: 'Travel', c: '-50.00', d: '-40.00', e: '-90.00' },
        { a: '', b: 'Net Profit', c: '750.00', d: '580.00', e: '1330.00' },
        { a: 'Printed by runtime', b: '', c: '', d: '', e: '' },
    ]);

export const createAlreadyTabularWithReportNoiseRaw = (): CsvData =>
    withCsvData('tidy-noisy.csv', [
        { Region: 'Regional Sales Summary', Segment: '', Revenue: '' },
        { Region: 'Reporting Currency SGD', Segment: '', Revenue: '' },
        { Region: 'East', Segment: 'Enterprise', Revenue: '1200.00' },
        { Region: 'West', Segment: 'SMB', Revenue: '900.00' },
        { Region: 'Region', Segment: 'Segment', Revenue: 'Revenue' },
        { Region: 'South', Segment: 'Public', Revenue: '750.00' },
        { Region: 'Printed by runtime', Segment: '', Revenue: '' },
    ]);

export const createMultiHeaderProjectMatrixCleanedGood = (): CsvData =>
    withCsvData('matrix-cleaned.csv', projectSeries.flatMap((seriesKey, index) => ([
        {
            Code: '501001',
            Description: 'Revenue',
            SeriesKey: seriesKey,
            SeriesLabelL1: `Series ${index + 1}`,
            Value: index === 0 ? '12,500.00' : index === 3 ? '7,200.00' : '0.00',
            SourceRowIndex: 0,
            SourceColumnName: seriesKey,
            RowClass: 'fact',
        },
        {
            Code: '600001',
            Description: 'Direct Costs',
            SeriesKey: seriesKey,
            SeriesLabelL1: `Series ${index + 1}`,
            Value: index === 0 ? '-4,000.00' : index === 3 ? '-2,500.00' : '0.00',
            SourceRowIndex: 1,
            SourceColumnName: seriesKey,
            RowClass: 'fact',
        },
    ])));

export const createPeriodScenarioCrosstabCleanedGood = (): CsvData =>
    withCsvData('period-cleaned.csv', periodSeries.flatMap(seriesKey => ([
        { Account: '4000', Metric: 'Revenue', SeriesKey: seriesKey, Value: seriesKey === 'ACTUAL' ? '162.00' : seriesKey === 'BUDGET' ? '158.00' : seriesKey === 'VARIANCE' ? '4.00' : '120.00' },
        { Account: '5000', Metric: 'Costs', SeriesKey: seriesKey, Value: seriesKey === 'ACTUAL' ? '-92.00' : seriesKey === 'BUDGET' ? '-89.00' : seriesKey === 'VARIANCE' ? '-3.00' : '-80.00' },
    ])));

export const createComplexSummaryFamilyMatrixCleanedGood = (): CsvData =>
    withCsvData('summary-cleaned.csv', summarySeries.flatMap(seriesKey => ([
        { Code: '7010', Description: 'Site Cost', SeriesKey: seriesKey, Value: seriesKey === '11000' ? '120.00' : seriesKey === '11001' ? '90.00' : seriesKey === '11002' ? '140.00' : '100.00' },
        { Code: '7020', Description: 'Shared Labour', SeriesKey: seriesKey, Value: seriesKey === '11000' ? '80.00' : seriesKey === '11001' ? '75.00' : seriesKey === '11002' ? '95.00' : '70.00' },
    ])));

export const createWeakSignalMixedReportCleanedGood = (): CsvData =>
    withCsvData('mixed-cleaned.csv', [
        { Code: '8100', Description: 'Reactive Jobs', SeriesKey: '22000', Value: '150.00', SourceRowIndex: 0, SourceColumnName: '22000' },
        { Code: '8100', Description: 'Reactive Jobs', SeriesKey: '22001', Value: '120.00', SourceRowIndex: 0, SourceColumnName: '22001' },
        { Code: '8100', Description: 'Reactive Jobs', SeriesKey: '22002', Value: '110.00', SourceRowIndex: 0, SourceColumnName: '22002' },
        { Code: '8110', Description: 'Call-Out Jobs', SeriesKey: '22000', Value: '90.00', SourceRowIndex: 1, SourceColumnName: '22000' },
        { Code: '8110', Description: 'Call-Out Jobs', SeriesKey: '22001', Value: '100.00', SourceRowIndex: 1, SourceColumnName: '22001' },
        { Code: '8110', Description: 'Call-Out Jobs', SeriesKey: '22002', Value: '80.00', SourceRowIndex: 1, SourceColumnName: '22002' },
        { Code: '8120', Description: 'Standby Jobs', SeriesKey: '22000', Value: '70.00', SourceRowIndex: 2, SourceColumnName: '22000' },
        { Code: '8120', Description: 'Standby Jobs', SeriesKey: '22001', Value: '65.00', SourceRowIndex: 2, SourceColumnName: '22001' },
        { Code: '8120', Description: 'Standby Jobs', SeriesKey: '22002', Value: '75.00', SourceRowIndex: 2, SourceColumnName: '22002' },
        { Code: '8200', Description: 'Planned Jobs', SeriesKey: '22000', Value: '100.00', SourceRowIndex: 3, SourceColumnName: '22000' },
        { Code: '8200', Description: 'Planned Jobs', SeriesKey: '22001', Value: '105.00', SourceRowIndex: 3, SourceColumnName: '22001' },
        { Code: '8200', Description: 'Planned Jobs', SeriesKey: '22002', Value: '115.00', SourceRowIndex: 3, SourceColumnName: '22002' },
        { Code: '8210', Description: 'Shutdown Work', SeriesKey: '22000', Value: '110.00', SourceRowIndex: 4, SourceColumnName: '22000' },
        { Code: '8210', Description: 'Shutdown Work', SeriesKey: '22001', Value: '115.00', SourceRowIndex: 4, SourceColumnName: '22001' },
        { Code: '8210', Description: 'Shutdown Work', SeriesKey: '22002', Value: '95.00', SourceRowIndex: 4, SourceColumnName: '22002' },
        { Code: '8220', Description: 'Retrofit Jobs', SeriesKey: '22000', Value: '85.00', SourceRowIndex: 5, SourceColumnName: '22000' },
        { Code: '8220', Description: 'Retrofit Jobs', SeriesKey: '22001', Value: '88.00', SourceRowIndex: 5, SourceColumnName: '22001' },
        { Code: '8220', Description: 'Retrofit Jobs', SeriesKey: '22002', Value: '92.00', SourceRowIndex: 5, SourceColumnName: '22002' },
    ]);

export const createThreeLayerHeaderMatrixCleanedGood = (): CsvData =>
    withCsvData('three-layer-cleaned.csv', threeLayerSeries.flatMap((seriesKey, index) => ([
        {
            Code: '9010',
            Description: 'Revenue',
            SeriesKey: seriesKey,
            SeriesLabelL1: index < 2 ? 'North' : 'South',
            SeriesLabelL2: ['Alpha', 'Beta', 'Gamma', 'Delta'][index],
            Value: ['120.00', '130.00', '90.00', '110.00'][index],
            SourceRowIndex: 0,
            SourceColumnName: seriesKey,
            RowClass: 'fact',
        },
        {
            Code: '9020',
            Description: 'Costs',
            SeriesKey: seriesKey,
            SeriesLabelL1: index < 2 ? 'North' : 'South',
            SeriesLabelL2: ['Alpha', 'Beta', 'Gamma', 'Delta'][index],
            Value: ['-50.00', '-45.00', '-30.00', '-35.00'][index],
            SourceRowIndex: 1,
            SourceColumnName: seriesKey,
            RowClass: 'fact',
        },
    ])));

export const createHierarchicalStatementCleanedGood = (): CsvData =>
    withCsvData('statement-cleaned.csv', [
        { Code: '', Description: 'Revenue', Amount: null, RowClass: 'group_header', HierarchyDepth: 1, SourceRowIndex: 0 },
        { Code: '4010', Description: 'Service Revenue', Amount: '1200.00', RowClass: 'fact', HierarchyDepth: 1, SourceRowIndex: 1 },
        { Code: '4020', Description: 'Recurring Revenue', Amount: '800.00', RowClass: 'fact', HierarchyDepth: 1, SourceRowIndex: 2 },
        { Code: '4030', Description: 'Professional Services', Amount: '450.00', RowClass: 'fact', HierarchyDepth: 1, SourceRowIndex: 3 },
        { Code: '', Description: 'Cost of Sales', Amount: null, RowClass: 'group_header', HierarchyDepth: 1, SourceRowIndex: 4 },
        { Code: '5010', Description: 'Materials', Amount: '-300.00', RowClass: 'fact', HierarchyDepth: 1, SourceRowIndex: 5 },
        { Code: '5020', Description: 'Subcontractors', Amount: '-200.00', RowClass: 'fact', HierarchyDepth: 1, SourceRowIndex: 6 },
        { Code: '5030', Description: 'Travel', Amount: '-90.00', RowClass: 'fact', HierarchyDepth: 1, SourceRowIndex: 7 },
        { Code: '', Description: 'Subtotal', Amount: '1860.00', RowClass: 'subtotal', HierarchyDepth: 1, SourceRowIndex: 8 },
        { Code: '', Description: 'Net Profit', Amount: '1860.00', RowClass: 'total', HierarchyDepth: 0, SourceRowIndex: 9 },
    ]);

export const createHierarchicalWideStatementCleanedGood = (): CsvData =>
    withCsvData('hierarchical-wide-cleaned.csv', [
        { Code: '', Description: 'Revenue', SeriesKey: '21000', Value: null, RowClass: 'group_header', HierarchyDepth: 1, SourceRowIndex: 0, SourceColumnName: '21000' },
        { Code: '', Description: 'Revenue', SeriesKey: '21001', Value: null, RowClass: 'group_header', HierarchyDepth: 1, SourceRowIndex: 0, SourceColumnName: '21001' },
        { Code: '4010', Description: 'Service Revenue', SeriesKey: '21000', Value: '600.00', RowClass: 'fact', HierarchyDepth: 1, SourceRowIndex: 1, SourceColumnName: '21000' },
        { Code: '4010', Description: 'Service Revenue', SeriesKey: '21001', Value: '500.00', RowClass: 'fact', HierarchyDepth: 1, SourceRowIndex: 1, SourceColumnName: '21001' },
        { Code: '', Description: 'Subtotal', SeriesKey: '21000', Value: '1000.00', RowClass: 'subtotal', HierarchyDepth: 1, SourceRowIndex: 3, SourceColumnName: '21000' },
        { Code: '', Description: 'Cost of Sales', SeriesKey: '21000', Value: null, RowClass: 'group_header', HierarchyDepth: 1, SourceRowIndex: 4, SourceColumnName: '21000' },
        { Code: '5010', Description: 'Materials', SeriesKey: '21000', Value: '-200.00', RowClass: 'fact', HierarchyDepth: 1, SourceRowIndex: 5, SourceColumnName: '21000' },
        { Code: '', Description: 'Net Profit', SeriesKey: '21001', Value: '580.00', RowClass: 'total', HierarchyDepth: 0, SourceRowIndex: 7, SourceColumnName: '21001' },
    ]);

export const createAlreadyTabularWithReportNoiseCleanedGood = (): CsvData =>
    withCsvData('tidy-cleaned.csv', [
        { Region: 'East', Segment: 'Enterprise', Revenue: '1200.00' },
        { Region: 'West', Segment: 'SMB', Revenue: '900.00' },
        { Region: 'South', Segment: 'Public', Revenue: '750.00' },
    ]);
