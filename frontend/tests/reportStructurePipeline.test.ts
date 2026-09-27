import { describe, expect, it } from 'vitest';
import type { ReportBoundary, ReportStructureResolution } from '../types';
import { canonicalizeReportTable } from '../services/agent/canonicalizeReportTable';
import { resolvePipelineOutcome } from '../services/agent/pipelineOutcomeResolver';
import { resolveReportStructure } from '../services/agent/reportStructureResolver';
import { resolveReportStructureArtifacts } from '../services/agent/reportStructureState';
import { buildRuntimeTableAssessmentFromIr } from '../services/agent/orchestration/cleaningRuntimePolicy';
import { createMultiHeaderIntakeIr } from './reportShapeFixtures/cases';
import { buildCsvDataFromIntakeIr, rebuildIntakeIrWithBoundary } from '../services/data/reportCsvIntake';
import { makeRuntimeTableAssessment } from './testFactories';

const createResolvedStructure = (overrides: Partial<ReportStructureResolution> = {}): ReportStructureResolution => ({
    headerRowIndex: 0,
    headerLayerRowIndexes: [],
    bodyStartIndex: 0,
    summaryStartIndex: null,
    parameterRowIndexes: [],
    repeatedHeaderRowIndexes: [],
    rowRoles: [],
    confidence: {
        header: 0.9,
        body: 0.9,
        summary: 0.9,
        overall: 0.9,
        sourceAgreement: 0.9,
    },
    blockingReasons: [],
    requiresHumanReview: false,
    source: 'runtime_resolved',
    decision: {
        targetShape: 'row_table',
        shouldCanonicalize: true,
        reason: 'resolved',
    },
    rawIntakeBoundary: null,
    runtimeBoundary: null,
    humanBoundary: null,
    runtimeTableAssessment: null,
    rowInspection: null,
    proposalSource: 'none',
    structureProposal: null,
    proposalVerification: null,
    normalizationPlan: {
        mergedHeaders: [],
        carryForwardColumns: [],
        sectionLabelColumns: [],
        detailInclusionRoles: ['detail'],
        excludedRoles: ['blank', 'header', 'summary', 'footer', 'group_header', 'note', 'subtotal'],
        rawRowRoleOverrides: [],
    },
    resolvedRawRowRoles: [],
    verificationSummary: null,
    ...overrides,
});

describe('report structure pipeline', () => {
    it('does not treat raw repeated-header metadata as prepared-data leakage after removal', () => {
        const csvData = {
            fileName: 'categorical-report.csv',
            data: [
                { Customer: 'Alpha', 'Effective Date': '2026-01-01', Status: 'Active' },
                { Customer: 'Beta', 'Effective Date': '2026-01-02', Status: 'Expired' },
            ],
            metadataRows: [],
            summaryRows: [],
            headerLayers: [],
            headerDepth: 1,
        };
        const rawIntakeIr = {
            fileName: 'categorical-report.csv',
            columnCount: 3,
            rawRows: [
                ['Customer', 'Effective Date', 'Status'],
                ['Alpha', '2026-01-01', 'Active'],
                ['Beta', '2026-01-02', 'Expired'],
                ['Customer', 'Effective Date', 'Status'],
            ],
            normalizedRows: [
                ['Customer', 'Effective Date', 'Status'],
                ['Alpha', '2026-01-01', 'Active'],
                ['Beta', '2026-01-02', 'Expired'],
                ['Customer', 'Effective Date', 'Status'],
            ],
            detection: {
                strategy: 'scored_candidate',
                confidence: 'high',
                delimiter: ',',
                quoteChar: '"',
                warnings: [],
            },
            segments: [],
            provisionalTable: {
                headerRowIndex: 0,
                headerLayerRowIndexes: [],
                bodyStartIndex: 1,
                summaryStartIndex: null,
                repeatedHeaderRowIndexes: [3],
                metadataRowIndexes: [],
                parameterRowIndexes: [],
            },
            diagnostics: {
                headerShapeDrift: false,
                hasRepeatedHeader: true,
            },
        };

        const structure = resolveReportStructure({
            rawCsvData: csvData as never,
            csvData: csvData as never,
            rawIntakeIr: rawIntakeIr as never,
            shapeVerificationPassed: true,
        });

        expect(structure.repeatedHeaderRowIndexes).toEqual([3]);
        expect(structure.blockingReasons).not.toContain('repeated_header_leakage');
        expect(structure.requiresHumanReview).toBe(false);
    });

    it('still blocks when a raw repeated header remains in the prepared rows above tolerance', () => {
        const csvData = {
            fileName: 'leaking-report.csv',
            data: [
                { Customer: 'Alpha', Status: 'Active' },
                { Customer: 'Customer', Status: 'Status' },
            ],
            metadataRows: [],
            summaryRows: [],
            headerLayers: [],
            headerDepth: 1,
        };
        const rawIntakeIr = {
            fileName: 'leaking-report.csv',
            columnCount: 2,
            rawRows: [
                ['Customer', 'Status'],
                ['Alpha', 'Active'],
                ['Customer', 'Status'],
            ],
            normalizedRows: [
                ['Customer', 'Status'],
                ['Alpha', 'Active'],
                ['Customer', 'Status'],
            ],
            detection: {
                strategy: 'scored_candidate',
                confidence: 'high',
                delimiter: ',',
                quoteChar: '"',
                warnings: [],
            },
            segments: [],
            provisionalTable: {
                headerRowIndex: 0,
                headerLayerRowIndexes: [],
                bodyStartIndex: 1,
                summaryStartIndex: null,
                repeatedHeaderRowIndexes: [2],
                metadataRowIndexes: [],
                parameterRowIndexes: [],
            },
            diagnostics: {
                headerShapeDrift: false,
                hasRepeatedHeader: true,
            },
        };

        const structure = resolveReportStructure({
            rawCsvData: csvData as never,
            csvData: csvData as never,
            rawIntakeIr: rawIntakeIr as never,
            shapeVerificationPassed: true,
        });

        expect(structure.blockingReasons).toContain('repeated_header_leakage');
        expect(structure.requiresHumanReview).toBe(true);
    });

    it('resolves multi-header project matrix into a canonical long fact table', () => {
        const fixture = {
            fileName: 'matrix.csv',
            data: [
                { Code: '501001', Description: 'Revenue', 'Prj-10000': '12,500.00', 'Prj-10001': '0.00', 'Prj-10002': '0.00', Total: '12,500.00' },
                { Code: '600001', Description: 'Direct Costs', 'Prj-10000': '-4,000.00', 'Prj-10001': '0.00', 'Prj-10002': '0.00', Total: '-4,000.00' },
            ],
            headerLayers: [['', '', 'Series 1', 'Series 2', 'Series 3', '']],
            metadataRows: [],
            summaryRows: [],
            headerDepth: 2,
        };
        const intakeIr = createMultiHeaderIntakeIr();
        const runtimeAssessment = buildRuntimeTableAssessmentFromIr(intakeIr, fixture as never, fixture as never);
        const humanBoundary: ReportBoundary = {
            headerRowIndex: intakeIr.provisionalTable!.headerRowIndex,
            headerLayerRowIndexes: [...intakeIr.provisionalTable!.headerLayerRowIndexes],
            bodyStartIndex: intakeIr.provisionalTable!.bodyStartIndex,
            summaryStartIndex: intakeIr.provisionalTable!.summaryStartIndex,
            parameterRowIndexes: [...intakeIr.provisionalTable!.parameterRowIndexes],
            repeatedHeaderRowIndexes: [...intakeIr.provisionalTable!.repeatedHeaderRowIndexes],
        };

        const structure = resolveReportStructure({
            rawCsvData: fixture as never,
            csvData: fixture as never,
            rawIntakeIr: intakeIr,
            runtimeTableAssessment: runtimeAssessment,
            humanBoundary,
            shapeVerificationPassed: true,
        });
        const canonical = canonicalizeReportTable({
            csvData: fixture as never,
            rawCsvData: fixture as never,
            rawIntakeIr: intakeIr,
            reportStructureResolution: structure,
        });

        expect(['confirmed', 'ambiguous']).toContain(runtimeAssessment?.status);
        expect(structure.source).toBe('human_confirmed');
        expect(structure.requiresHumanReview).toBe(false);
        expect(structure.decision.targetShape).toBe('long_fact_table');
        expect(canonical.status).toBe('ready');
        expect(canonical.artifact?.canonicalBuildMeta.shape).toBe('long_fact_table');
        expect(canonical.artifact?.canonicalSchema).toContain('SeriesKey');
        expect(canonical.artifact?.canonicalSchema).toContain('Value');
        expect(canonical.artifact?.canonicalCsvData.data.length ?? 0).toBeGreaterThan(0);
    });

    it('excludes reshaped subtotal rows from the default canonical analysis dataset', () => {
        const fixture = {
            fileName: 'delivery-location-summary.csv',
            data: [
                { Location: 'North', RowClass: 'fact', HierarchyDepth: 1, 'Jan 2026': '120.00', 'Feb 2026': '80.00', Total: '200.00' },
                { Location: 'Sub Total', RowClass: 'subtotal', HierarchyDepth: 0, 'Jan 2026': '120.00', 'Feb 2026': '80.00', Total: '200.00' },
            ],
            headerLayers: [['', '', '', 'Jan 2026', 'Feb 2026', '']],
            metadataRows: [['SALES SUMMARY BY DELIVERY LOCATION']],
            summaryRows: [],
            headerDepth: 2,
            summaryRowCount: 0,
        };
        const intakeIr = createMultiHeaderIntakeIr();
        const runtimeAssessment = buildRuntimeTableAssessmentFromIr(intakeIr, fixture as never, fixture as never);
        const humanBoundary: ReportBoundary = {
            headerRowIndex: intakeIr.provisionalTable!.headerRowIndex,
            headerLayerRowIndexes: [...intakeIr.provisionalTable!.headerLayerRowIndexes],
            bodyStartIndex: intakeIr.provisionalTable!.bodyStartIndex,
            summaryStartIndex: intakeIr.provisionalTable!.summaryStartIndex,
            parameterRowIndexes: [...intakeIr.provisionalTable!.parameterRowIndexes],
            repeatedHeaderRowIndexes: [...intakeIr.provisionalTable!.repeatedHeaderRowIndexes],
        };

        const structure = resolveReportStructure({
            rawCsvData: fixture as never,
            csvData: fixture as never,
            rawIntakeIr: intakeIr,
            runtimeTableAssessment: runtimeAssessment,
            humanBoundary,
            shapeVerificationPassed: true,
        });
        const canonical = canonicalizeReportTable({
            csvData: fixture as never,
            rawCsvData: fixture as never,
            rawIntakeIr: intakeIr,
            reportStructureResolution: structure,
        });

        expect(structure.decision.targetShape).toBe('long_fact_table');
        expect(canonical.status).toBe('ready');
        expect(canonical.artifact?.canonicalCsvData.data.length ?? 0).toBeGreaterThan(0);
        expect(canonical.artifact?.canonicalCsvData.data.every(row => row.RowRole === 'fact')).toBe(true);
        expect(canonical.artifact?.canonicalCsvData.data.every(row => row.Location === 'North')).toBe(true);
        expect(canonical.artifact?.canonicalBuildMeta.excludedRowCounts.subtotal ?? 0).toBeGreaterThan(0);
    });

    it('recovers business identities containing total without admitting aggregate rows', () => {
        const fixture = {
            fileName: 'ambiguous-total-business-name.csv',
            data: [
                { Customer: 'TOTAL FACILITY ENGINEERING PTE LTD', RowClass: 'subtotal', 'Jan 2026': '120.00', 'Feb 2026': '80.00' },
                { Customer: 'CISCO RECALL TOTAL INFORMATION', RowClass: 'subtotal', 'Jan 2026': '40.00', 'Feb 2026': '10.00' },
                { Customer: 'Grand Total SGD', RowClass: 'subtotal', 'Jan 2026': '160.00', 'Feb 2026': '90.00' },
            ],
            headerLayers: [['', '', 'Jan 2026', 'Feb 2026']],
            metadataRows: [['SALES BY CUSTOMER']],
            summaryRows: [],
            headerDepth: 2,
            summaryRowCount: 0,
        };
        const intakeIr = createMultiHeaderIntakeIr();
        const runtimeAssessment = buildRuntimeTableAssessmentFromIr(intakeIr, fixture as never, fixture as never);
        const humanBoundary: ReportBoundary = {
            headerRowIndex: intakeIr.provisionalTable!.headerRowIndex,
            headerLayerRowIndexes: [...intakeIr.provisionalTable!.headerLayerRowIndexes],
            bodyStartIndex: intakeIr.provisionalTable!.bodyStartIndex,
            summaryStartIndex: intakeIr.provisionalTable!.summaryStartIndex,
            parameterRowIndexes: [...intakeIr.provisionalTable!.parameterRowIndexes],
            repeatedHeaderRowIndexes: [...intakeIr.provisionalTable!.repeatedHeaderRowIndexes],
        };
        const structure = resolveReportStructure({
            rawCsvData: fixture as never,
            csvData: fixture as never,
            rawIntakeIr: intakeIr,
            runtimeTableAssessment: runtimeAssessment,
            humanBoundary,
            shapeVerificationPassed: true,
        });
        const canonical = canonicalizeReportTable({
            csvData: fixture as never,
            rawCsvData: fixture as never,
            rawIntakeIr: intakeIr,
            reportStructureResolution: structure,
        });
        const customers = new Set(canonical.artifact?.canonicalCsvData.data.map(row => row.Customer));

        expect(customers).toContain('TOTAL FACILITY ENGINEERING PTE LTD');
        expect(customers).toContain('CISCO RECALL TOTAL INFORMATION');
        expect(customers).not.toContain('Grand Total SGD');
    });

    it('filters non-detail rows when canonicalizing a row table with group headers and totals', () => {
        const fixture = {
            fileName: 'tabular.csv',
            data: [
                { Region: null, Segment: 'Retail Performance', Revenue: null },
                { Region: 'North', Segment: 'Retail', Revenue: 10 },
                { Region: 'South', Segment: 'Retail', Revenue: 20 },
                { Region: null, Segment: 'Grand Total', Revenue: 30 },
            ],
            metadataRows: [],
            summaryRows: [],
            headerLayers: [],
            headerDepth: 1,
        };
        const structure = resolveReportStructure({
            rawCsvData: fixture as never,
            csvData: fixture as never,
            rawIntakeIr: null,
            shapeVerificationPassed: true,
        });
        const canonical = canonicalizeReportTable({
            csvData: fixture as never,
            rawCsvData: fixture as never,
            reportStructureResolution: structure,
        });

        expect(structure.decision.targetShape).toBe('row_table');
        expect(canonical.status).toBe('ready');
        expect(canonical.artifact?.canonicalCsvData.data.length ?? 0).toBe(2);
        expect(canonical.artifact?.canonicalSchema).toContain('SourceRowIndex');
        expect(canonical.artifact?.canonicalSchema).toContain('RowRole');
    });

    it('excludes a leading aggregate row when multiple additive facts reconcile to the detail rows', () => {
        const headers = ['Reporting starts', 'Ad name', 'Ad delivery', 'Ad ID', 'Amount spent (SGD)', 'Reach', 'Impressions', 'CTR'];
        const rawRows = [
            headers,
            ['2025-03-01', '', '0', '0', '60', '600', '900', '1.5'],
            ['2025-03-01', 'Ad A', 'not_delivering', '101', '10', '100', '200', '1.0'],
            ['2025-03-01', 'Ad B', 'not_delivering', '102', '20', '200', '300', '2.0'],
            ['2025-03-01', 'Ad C', 'not_delivering', '103', '30', '300', '400', '1.5'],
        ];
        const rawCsvData = {
            fileName: 'advertising-export.csv',
            data: rawRows.slice(1).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]]))),
            metadataRows: [],
            summaryRows: [],
            headerLayers: [headers],
            headerDepth: 1,
            summaryRowCount: 0,
        };
        const rawIntakeIr = {
            fileName: rawCsvData.fileName,
            columnCount: headers.length,
            rawRows,
            normalizedRows: rawRows,
            segments: [],
            provisionalTable: null,
            diagnostics: {
                totalRows: rawRows.length,
                emptyRowCount: 0,
                repeatedHeaderRowIndexes: [],
                parameterRowIndexes: [],
                parserWarnings: [],
                headerCandidateRowIndex: 0,
                bodyStartRowIndex: 1,
                summaryStartRowIndex: null,
                boundaryConfidence: 0.98,
                headerShapeDrift: false,
                notes: [],
            },
        };
        const structure = createResolvedStructure({
            headerRowIndex: 0,
            bodyStartIndex: 1,
            normalizationPlan: {
                mergedHeaders: headers,
                carryForwardColumns: [],
                sectionLabelColumns: [],
                detailInclusionRoles: ['detail'],
                excludedRoles: ['blank', 'header', 'summary', 'footer', 'group_header', 'note', 'subtotal'],
                rawRowRoleOverrides: [],
            },
        });

        const canonical = canonicalizeReportTable({
            csvData: rawCsvData as never,
            rawCsvData: rawCsvData as never,
            rawIntakeIr: rawIntakeIr as never,
            reportStructureResolution: structure,
        });

        expect(canonical.status).toBe('ready');
        expect(canonical.artifact?.canonicalCsvData.data).toHaveLength(3);
        expect(canonical.artifact?.canonicalBuildMeta.excludedRowCounts.summary).toBe(1);
        const spendTotal = canonical.artifact?.canonicalCsvData.data.reduce(
            (sum, row) => sum + Number(row['Amount spent (SGD)'] ?? 0),
            0,
        );
        expect(spendTotal).toBe(60);
    });

    it('preserves cleaned shared column values when raw row-table canonicalization rebuilds detail rows', () => {
        const rawCsvData = {
            fileName: 'brand-report.csv',
            data: [
                { RowNumber: '1.', BRAND: "'-", 'AMOUNT (SGD)': '120.00' },
                { RowNumber: '2.', BRAND: 'Bosch', 'AMOUNT (SGD)': '95.00' },
            ],
            metadataRows: [['Brand Sales Report']],
            headerLayers: [['RowNumber', 'BRAND', 'AMOUNT (SGD)']],
            summaryRows: [],
            headerDepth: 1,
            summaryRowCount: 0,
        };
        const cleanedCsvData = {
            ...rawCsvData,
            data: [
                { RowNumber: '1.', BRAND: null, 'AMOUNT (SGD)': 120 },
                { RowNumber: '2.', BRAND: 'Bosch', 'AMOUNT (SGD)': 95 },
            ],
        };
        const rawIntakeIr = {
            fileName: 'brand-report.csv',
            columnCount: 3,
            rawRows: [
                ['Brand Sales Report'],
                ['RowNumber', 'BRAND', 'AMOUNT (SGD)'],
                ['1.', "'-", '120.00'],
                ['2.', 'Bosch', '95.00'],
            ],
            normalizedRows: [
                ['Brand Sales Report'],
                ['RowNumber', 'BRAND', 'AMOUNT (SGD)'],
                ['1.', "'-", '120.00'],
                ['2.', 'Bosch', '95.00'],
            ],
            segments: [],
            provisionalTable: null,
            diagnostics: {
                totalRows: 4,
                emptyRowCount: 0,
                repeatedHeaderRowIndexes: [],
                parameterRowIndexes: [0],
                parserWarnings: [],
                headerCandidateRowIndex: 1,
                bodyStartRowIndex: 2,
                summaryStartRowIndex: null,
                boundaryConfidence: 0.95,
                headerShapeDrift: false,
                notes: [],
            },
        };
        const structure = createResolvedStructure({
            headerRowIndex: 1,
            bodyStartIndex: 2,
            parameterRowIndexes: [0],
            normalizationPlan: {
                mergedHeaders: ['RowNumber', 'BRAND', 'AMOUNT (SGD)'],
                carryForwardColumns: [],
                sectionLabelColumns: [],
                detailInclusionRoles: ['detail'],
                excludedRoles: ['blank', 'header', 'summary', 'footer', 'group_header', 'note', 'subtotal'],
                rawRowRoleOverrides: [],
            },
        });

        const canonical = canonicalizeReportTable({
            csvData: cleanedCsvData as never,
            rawCsvData: rawCsvData as never,
            rawIntakeIr: rawIntakeIr as never,
            reportStructureResolution: structure,
        });

        expect(canonical.status).toBe('ready');
        expect(canonical.artifact?.canonicalCsvData.data[0]?.BRAND).toBeNull();
        expect(canonical.artifact?.canonicalCsvData.data[1]?.BRAND).toBe('Bosch');
        expect(canonical.artifact?.canonicalCsvData.data[0]?.['AMOUNT (SGD)']).toBe(120);
    });

    it('preserves full day-first dates during row-table canonicalization', () => {
        const rawCsvData = {
            fileName: 'daily-sales-summary.csv',
            data: [
                { No: '1', DATE: '08-01-2010', 'NET AMOUNT LOCAL': '52,602.50' },
                { No: '2', DATE: '20-01-2010', 'NET AMOUNT LOCAL': '104,460.00' },
                { No: '3', DATE: '01-02-2010', 'NET AMOUNT LOCAL': '45,550.00' },
            ],
            metadataRows: [['DAILY SALES SUMMARY REPORT']],
            headerLayers: [['No', 'DATE', 'NET AMOUNT LOCAL']],
            summaryRows: [],
            headerDepth: 1,
            summaryRowCount: 0,
        };
        const cleanedCsvData = {
            ...rawCsvData,
            data: [
                { No: '1', DATE: '08-01-2010', 'NET AMOUNT LOCAL': 52602.5 },
                { No: '2', DATE: '20-01-2010', 'NET AMOUNT LOCAL': 104460 },
                { No: '3', DATE: '01-02-2010', 'NET AMOUNT LOCAL': 45550 },
            ],
        };
        const rawIntakeIr = {
            fileName: 'daily-sales-summary.csv',
            columnCount: 3,
            rawRows: [
                ['DAILY SALES SUMMARY REPORT'],
                ['No', 'DATE', 'NET AMOUNT LOCAL'],
                ['1', '08-01-2010', '52,602.50'],
                ['2', '20-01-2010', '104,460.00'],
                ['3', '01-02-2010', '45,550.00'],
            ],
            normalizedRows: [
                ['DAILY SALES SUMMARY REPORT'],
                ['No', 'DATE', 'NET AMOUNT LOCAL'],
                ['1', '08-01-2010', '52,602.50'],
                ['2', '20-01-2010', '104,460.00'],
                ['3', '01-02-2010', '45,550.00'],
            ],
            segments: [],
            provisionalTable: null,
            diagnostics: {
                totalRows: 5,
                emptyRowCount: 0,
                repeatedHeaderRowIndexes: [],
                parameterRowIndexes: [0],
                parserWarnings: [],
                headerCandidateRowIndex: 1,
                bodyStartRowIndex: 2,
                summaryStartRowIndex: null,
                boundaryConfidence: 0.95,
                headerShapeDrift: false,
                notes: [],
            },
        };
        const structure = createResolvedStructure({
            headerRowIndex: 1,
            bodyStartIndex: 2,
            parameterRowIndexes: [0],
            normalizationPlan: {
                mergedHeaders: ['No', 'DATE', 'NET AMOUNT LOCAL'],
                carryForwardColumns: [],
                sectionLabelColumns: [],
                detailInclusionRoles: ['detail'],
                excludedRoles: ['blank', 'header', 'summary', 'footer', 'group_header', 'note', 'subtotal'],
                rawRowRoleOverrides: [],
            },
        });

        const canonical = canonicalizeReportTable({
            csvData: cleanedCsvData as never,
            rawCsvData: rawCsvData as never,
            rawIntakeIr: rawIntakeIr as never,
            reportStructureResolution: structure,
        });

        expect(canonical.status).toBe('ready');
        expect(canonical.artifact?.canonicalCsvData.data.map(row => row.DATE)).toEqual([
            '08-01-2010',
            '20-01-2010',
            '01-02-2010',
        ]);
    });

    it('normalizes apostrophe-prefixed negative numbers in fact columns during canonicalization', () => {
        const rawCsvData = {
            fileName: 'sales-report.csv',
            data: [
                { 'SALES EXEC': 'AF', SALES: '5,780.00', COST: "'-852.81", 'GROSS PROFIT': '6,632.81' },
                { 'SALES EXEC': 'GBC', SALES: "'-260.00", COST: "'-763.80", 'GROSS PROFIT': '503.80' },
                { 'SALES EXEC': 'JC', SALES: '0.00', COST: "'-1,281.83", 'GROSS PROFIT': '1,281.83' },
            ],
            metadataRows: [['SALES REPORT BY SALES EXECUTIVE']],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
            summaryRowCount: 0,
        };
        const rawIntakeIr = {
            fileName: 'sales-report.csv',
            columnCount: 4,
            rawRows: [
                ['SALES REPORT BY SALES EXECUTIVE'],
                ['SALES EXEC', 'SALES', 'COST', 'GROSS PROFIT'],
                ['AF', '5,780.00', "'-852.81", '6,632.81'],
                ['GBC', "'-260.00", "'-763.80", '503.80'],
                ['JC', '0.00', "'-1,281.83", '1,281.83'],
            ],
            normalizedRows: [
                ['SALES REPORT BY SALES EXECUTIVE'],
                ['SALES EXEC', 'SALES', 'COST', 'GROSS PROFIT'],
                ['AF', '5,780.00', "'-852.81", '6,632.81'],
                ['GBC', "'-260.00", "'-763.80", '503.80'],
                ['JC', '0.00', "'-1,281.83", '1,281.83'],
            ],
            segments: [],
            provisionalTable: null,
            diagnostics: {
                totalRows: 5,
                emptyRowCount: 0,
                repeatedHeaderRowIndexes: [],
                parameterRowIndexes: [0],
                parserWarnings: [],
                headerCandidateRowIndex: 1,
                bodyStartRowIndex: 2,
                summaryStartRowIndex: null,
                boundaryConfidence: 0.95,
                headerShapeDrift: false,
                notes: [],
            },
        };
        const structure = createResolvedStructure({
            headerRowIndex: 1,
            bodyStartIndex: 2,
            parameterRowIndexes: [0],
            normalizationPlan: {
                mergedHeaders: ['SALES EXEC', 'SALES', 'COST', 'GROSS PROFIT'],
                carryForwardColumns: [],
                sectionLabelColumns: [],
                detailInclusionRoles: ['detail'],
                excludedRoles: ['blank', 'header', 'summary', 'footer', 'group_header', 'note', 'subtotal'],
                rawRowRoleOverrides: [],
            },
        });

        const canonical = canonicalizeReportTable({
            csvData: rawCsvData as never,
            rawCsvData: rawCsvData as never,
            rawIntakeIr: rawIntakeIr as never,
            reportStructureResolution: structure,
        });

        expect(canonical.status).toBe('ready');
        const rows = canonical.artifact?.canonicalCsvData.data ?? [];
        expect(rows.length).toBe(3);

        // Fact columns must contain actual numbers, not apostrophe-prefixed strings
        expect(typeof rows[0]?.COST).toBe('number');
        expect(rows[0]?.COST).toBe(-852.81);
        expect(typeof rows[1]?.COST).toBe('number');
        expect(rows[1]?.COST).toBe(-763.80);
        expect(typeof rows[2]?.COST).toBe('number');
        expect(rows[2]?.COST).toBe(-1281.83);

        // Verify no apostrophe-prefixed strings leak through
        for (const row of rows) {
            for (const [key, value] of Object.entries(row)) {
                if (typeof value === 'string' && /^['\u2018\u2019]-?\d/.test(value)) {
                    throw new Error(`Apostrophe-prefixed number leaked in column ${key}: ${value}`);
                }
            }
        }
    });

    it('prefers structure review over cleaning success and degrades when SQL precheck is blocked', () => {
        const needsReviewOutcome = resolvePipelineOutcome({
            reportStructureResolution: createResolvedStructure({
                requiresHumanReview: true,
                blockingReasons: ['header_shape_drift'],
                decision: {
                    targetShape: 'row_table',
                    shouldCanonicalize: false,
                    reason: 'review required',
                },
            }),
            intakeGuard: {
                shouldBlockAutomaticAnalysis: false,
                severity: 'warning',
            },
            cleaningRun: null,
            sqlPrecheckStatus: 'passed',
            verificationReport: null,
            hasCanonicalData: false,
        });
        const degradedOutcome = resolvePipelineOutcome({
            reportStructureResolution: createResolvedStructure(),
            intakeGuard: {
                shouldBlockAutomaticAnalysis: false,
                severity: 'clear',
            },
            cleaningRun: {
                runId: 'run-1',
                status: 'completed',
                currentStep: 0,
                steps: [],
                lastModelResponse: null,
                startedAt: new Date('2026-03-19T00:00:00.000Z'),
                updatedAt: new Date('2026-03-19T00:00:00.000Z'),
                targetPath: '/workspace/cleaned.csv',
                sqlPrecheckStatus: 'blocked',
            },
            sqlPrecheckStatus: 'blocked',
            verificationReport: null,
            hasCanonicalData: true,
        });

        expect(needsReviewOutcome.status).toBe('needs_structure_review');
        expect(needsReviewOutcome.canAutoAnalyze).toBe(false);
        expect(degradedOutcome.status).toBe('degraded_but_usable');
        expect(degradedOutcome.canAutoAnalyze).toBe(true);
    });

    it('relaxes gate when sqlPrecheckStatus is warning and post-cleaning evidence is strong', () => {
        const outcome = resolvePipelineOutcome({
            reportStructureResolution: createResolvedStructure({
                blockingReasons: ['runtime_boundary_ambiguous'],
            }),
            intakeGuard: {
                shouldBlockAutomaticAnalysis: false,
                severity: 'clear',
            },
            cleaningRun: {
                runId: 'run-warning',
                status: 'completed',
                currentStep: 0,
                steps: [],
                lastModelResponse: null,
                startedAt: new Date('2026-03-26T00:00:00.000Z'),
                updatedAt: new Date('2026-03-26T00:00:00.000Z'),
                targetPath: '/workspace/cleaned.csv',
                sqlPrecheckStatus: 'warning',
            },
            sqlPrecheckStatus: 'warning',
            verificationReport: null,
            hasCanonicalData: false,
            columnProfiles: [
                { name: 'Country', type: 'categorical' },
                { name: 'Net Sales SGD', type: 'numerical' },
                { name: 'Percentage', type: 'percentage' },
            ] as any,
            cleanedRowCount: 10,
        });

        // warning + strong evidence should degrade, not block
        expect(outcome.status).toBe('degraded_but_usable');
        expect(outcome.canAutoAnalyze).toBe(true);
        expect(outcome.severity).toBe('warning');
    });

    it('continues with count-based analysis when cleaned categorical data still needs structure review', () => {
        const outcome = resolvePipelineOutcome({
            reportStructureResolution: createResolvedStructure({
                requiresHumanReview: true,
                blockingReasons: ['complex_report_requires_confirmation'],
                decision: {
                    targetShape: 'row_table',
                    shouldCanonicalize: false,
                    reason: 'Review recommended',
                },
            }),
            intakeGuard: {
                shouldBlockAutomaticAnalysis: false,
                severity: 'warning',
            },
            cleaningRun: {
                runId: 'run-categorical',
                status: 'completed',
                currentStep: 0,
                steps: [],
                lastModelResponse: null,
                startedAt: new Date('2026-07-27T00:00:00.000Z'),
                updatedAt: new Date('2026-07-27T00:00:00.000Z'),
                targetPath: '/workspace/cleaned.csv',
                sqlPrecheckStatus: 'warning',
                residualUnknownRowCount: 0,
            },
            sqlPrecheckStatus: 'warning',
            verificationReport: null,
            hasCanonicalData: false,
            columnProfiles: [
                { name: 'Customer', type: 'categorical' },
                { name: 'Effective Date', type: 'date' },
            ] as any,
            cleanedRowCount: 44,
        });

        expect(outcome.status).toBe('degraded_but_usable');
        expect(outcome.canAutoAnalyze).toBe(true);
        expect(outcome.reasonCode).toBe('complex_report_requires_confirmation');
        expect(outcome.message).toContain('count-based aggregation');
    });

    it('lets ai-confirmed structure clear the label-layer verification alias after canonicalization', () => {
        const outcome = resolvePipelineOutcome({
            reportStructureResolution: createResolvedStructure({
                source: 'ai_confirmed',
                blockingReasons: ['label_layer_retention_complete'],
            }),
            intakeGuard: {
                shouldBlockAutomaticAnalysis: false,
                severity: 'clear',
            },
            cleaningRun: {
                runId: 'run-ai-confirmed',
                status: 'completed',
                currentStep: 0,
                steps: [],
                lastModelResponse: null,
                startedAt: new Date('2026-03-26T00:00:00.000Z'),
                updatedAt: new Date('2026-03-26T00:00:00.000Z'),
                targetPath: '/workspace/cleaned.csv',
                sqlPrecheckStatus: 'passed',
            },
            sqlPrecheckStatus: 'passed',
            verificationReport: {
                passed: false,
                signalKey: 'label_layer_retention_complete',
            },
            hasCanonicalData: true,
        });

        expect(outcome.status).toBe('ready');
        expect(outcome.canAutoAnalyze).toBe(true);
        expect(outcome.reasonCode).toBe('ready');
    });

    it('rebuilds staging from the human-confirmed boundary before canonicalization', () => {
        const intakeIr = createMultiHeaderIntakeIr();
        const wrongStageIr = rebuildIntakeIrWithBoundary(
            intakeIr,
            {
                headerRowIndex: 3,
                headerLayerIndexes: [],
                bodyStartIndex: 4,
                summaryStartIndex: 11,
                parameterRowIndexes: [],
                repeatedHeaderRowIndexes: [],
            },
            'ai_fallback_deterministic',
        );
        const rawCsvData = buildCsvDataFromIntakeIr(intakeIr);
        const wrongCsvData = buildCsvDataFromIntakeIr(wrongStageIr);
        const artifacts = resolveReportStructureArtifacts({
            rawCsvData,
            csvData: wrongCsvData,
            rawIntakeIr: intakeIr,
            cleaningRun: null,
            dataPreparationPlan: {
                explanation: 'boundary override regression',
                operations: [],
                outputColumns: [],
                planStatus: 'schema_only',
                consistencyIssues: [],
            },
            humanBoundary: {
                headerRowIndex: intakeIr.provisionalTable!.headerRowIndex,
                headerLayerRowIndexes: [...intakeIr.provisionalTable!.headerLayerRowIndexes],
                bodyStartIndex: intakeIr.provisionalTable!.bodyStartIndex,
                summaryStartIndex: intakeIr.provisionalTable!.summaryStartIndex,
                parameterRowIndexes: [...intakeIr.provisionalTable!.parameterRowIndexes],
                repeatedHeaderRowIndexes: [...intakeIr.provisionalTable!.repeatedHeaderRowIndexes],
            },
        });

        expect(wrongCsvData.headerDepth).toBe(1);
        expect(artifacts.reportStructureResolution?.source).toBe('human_confirmed');
        expect(artifacts.canonicalizationStatus).toBe('ready');
        expect(artifacts.pipelineOutcome?.status).toBe('ready');
        expect(artifacts.canonicalBuildMeta?.shape).toBe('long_fact_table');
        expect(artifacts.canonicalCsvData?.data.length ?? 0).toBeGreaterThan(0);
        expect(Object.keys(artifacts.canonicalCsvData?.data[0] ?? {})).toContain('SeriesKey');
        expect(Object.keys(artifacts.canonicalCsvData?.data[0] ?? {})).toContain('Value');
    });

    it('normalizes runtime boundaries so the top header row stays primary and unresolved drift still requires review', () => {
        const intakeIr = createMultiHeaderIntakeIr();
        const csvData = buildCsvDataFromIntakeIr(intakeIr);

        const structure = resolveReportStructure({
            rawCsvData: csvData,
            csvData,
            rawIntakeIr: {
                ...intakeIr,
                diagnostics: {
                    ...intakeIr.diagnostics,
                    headerShapeDrift: true,
                },
            },
            runtimeTableAssessment: makeRuntimeTableAssessment({
                status: 'confirmed',
                headerRowIndex: 5,
                headerLayerRowIndexes: [4],
                bodyStartIndex: 6,
                summaryStartIndex: 11,
                requiresReshape: true,
            }),
            shapeVerificationPassed: true,
        });

        expect(structure.headerRowIndex).toBe(4);
        expect(structure.headerLayerRowIndexes).toEqual([5]);
        expect(structure.bodyStartIndex).toBe(6);
        expect(structure.requiresHumanReview).toBe(true);
        expect(structure.blockingReasons).toContain('header_shape_drift');
    });

    it('auto-confirms only a pass-band AI proposal that agrees with deterministic shape evidence', () => {
        const intakeIr = createMultiHeaderIntakeIr();
        const csvData = buildCsvDataFromIntakeIr(intakeIr);
        const baseline = resolveReportStructure({
            rawCsvData: csvData,
            csvData,
            rawIntakeIr: intakeIr,
            shapeVerificationPassed: true,
        });
        const firstHeader = baseline.normalizationPlan.mergedHeaders[0];
        const pivotShape = baseline.decision.targetShape === 'long_fact_table'
            ? 'wide_pivot' as const
            : baseline.decision.targetShape === 'long_statement_table'
                ? 'statement_table' as const
                : 'row_table' as const;

        const structure = resolveReportStructure({
            rawCsvData: csvData,
            csvData,
            rawIntakeIr: intakeIr,
            shapeVerificationPassed: true,
            structureProposal: {
                purpose: { summary: 'Prepare the visible report for analysis.', confidence: 0.92 },
                grain: {
                    columns: [firstHeader],
                    description: `One row per ${firstHeader}.`,
                    confidence: 0.91,
                },
                fields: [{
                    columnName: firstHeader,
                    role: 'descriptor',
                    confidence: 0.9,
                    reasoning: 'Visible descriptive field.',
                }],
                pivot: {
                    shape: pivotShape,
                    dimensionColumns: [firstHeader],
                    measureColumns: [],
                    labelColumns: [],
                    confidence: 0.93,
                },
                bodyRowRoles: [{
                    rowIndex: intakeIr.provisionalTable!.bodyStartIndex,
                    role: 'detail',
                    confidence: 0.9,
                }],
                carryForwardColumns: [],
                sectionLabelColumns: [],
                detailInclusionRoles: ['detail'],
                confidence: 0.92,
                reasoning: 'Model and deterministic structure evidence agree.',
            },
        });

        expect(structure.proposalVerification?.tier).toBe('pass');
        expect(structure.proposalVerification?.autoApplySafe).toBe(true);
        expect(structure.source).toBe('ai_confirmed');
        expect(structure.requiresHumanReview).toBe(false);
    });

    it('keeps a low-confidence high-impact AI proposal in human review', () => {
        const intakeIr = createMultiHeaderIntakeIr();
        const csvData = buildCsvDataFromIntakeIr(intakeIr);
        const baseline = resolveReportStructure({
            rawCsvData: csvData,
            csvData,
            rawIntakeIr: intakeIr,
            shapeVerificationPassed: true,
        });
        const firstHeader = baseline.normalizationPlan.mergedHeaders[0];
        const pivotShape = baseline.decision.targetShape === 'long_fact_table'
            ? 'wide_pivot' as const
            : baseline.decision.targetShape === 'long_statement_table'
                ? 'statement_table' as const
                : 'row_table' as const;

        const structure = resolveReportStructure({
            rawCsvData: csvData,
            csvData,
            rawIntakeIr: intakeIr,
            shapeVerificationPassed: true,
            structureProposal: {
                purpose: { summary: 'Prepare the visible report for analysis.', confidence: 0.7 },
                grain: {
                    columns: [firstHeader],
                    description: `Possible row grain: ${firstHeader}.`,
                    confidence: 0.68,
                },
                fields: [{
                    columnName: firstHeader,
                    role: 'descriptor',
                    confidence: 0.7,
                    reasoning: 'Possible descriptive field.',
                }],
                pivot: {
                    shape: pivotShape,
                    dimensionColumns: [firstHeader],
                    measureColumns: [],
                    labelColumns: [],
                    confidence: 0.69,
                },
                bodyRowRoles: [{
                    rowIndex: intakeIr.provisionalTable!.bodyStartIndex,
                    role: 'note',
                    confidence: 0.68,
                }],
                carryForwardColumns: [],
                sectionLabelColumns: [],
                detailInclusionRoles: ['detail'],
                confidence: 0.7,
                reasoning: 'The structure remains ambiguous.',
            },
        });

        expect(structure.proposalVerification?.tier).toBe('warn');
        expect(structure.proposalVerification?.requiresHumanConfirmation).toBe(true);
        expect(structure.source).not.toBe('ai_confirmed');
        expect(structure.requiresHumanReview).toBe(true);
        expect(structure.blockingReasons).toContain('complex_report_requires_confirmation');
    });

    it('prefers a validated AI normalization proposal without overriding human boundary precedence', () => {
        const intakeIr = createMultiHeaderIntakeIr();
        const csvData = buildCsvDataFromIntakeIr(intakeIr);
        const artifacts = resolveReportStructureArtifacts({
            rawCsvData: csvData,
            csvData,
            rawIntakeIr: intakeIr,
            cleaningRun: null,
            dataPreparationPlan: {
                explanation: 'proposal merge regression',
                operations: [],
                outputColumns: [],
                planStatus: 'schema_only',
                consistencyIssues: [],
            },
            humanBoundary: {
                headerRowIndex: intakeIr.provisionalTable!.headerRowIndex,
                headerLayerRowIndexes: [...intakeIr.provisionalTable!.headerLayerRowIndexes],
                bodyStartIndex: intakeIr.provisionalTable!.bodyStartIndex,
                summaryStartIndex: intakeIr.provisionalTable!.summaryStartIndex,
                parameterRowIndexes: [...intakeIr.provisionalTable!.parameterRowIndexes],
                repeatedHeaderRowIndexes: [...intakeIr.provisionalTable!.repeatedHeaderRowIndexes],
            },
            structureProposal: {
                purpose: {
                    summary: 'Prepare order-line progress for analysis.',
                    confidence: 0.9,
                },
                grain: {
                    columns: ['Buyer Confirmation'],
                    description: 'One row per buyer-confirmation line.',
                    confidence: 0.88,
                },
                fields: [{
                    columnName: 'Buyer Confirmation',
                    role: 'identifier',
                    confidence: 0.9,
                    reasoning: 'Visible line identifier.',
                }],
                pivot: {
                    shape: 'row_table',
                    dimensionColumns: ['Buyer Confirmation'],
                    measureColumns: [],
                    labelColumns: [],
                    confidence: 0.88,
                },
                bodyRowRoles: [],
                carryForwardColumns: ['Buyer Confirmation'],
                sectionLabelColumns: ['Description'],
                detailInclusionRoles: ['detail'],
                confidence: 0.82,
                reasoning: 'proposal',
            },
        });

        expect(artifacts.reportStructureResolution?.source).toBe('human_confirmed');
        expect(artifacts.reportStructureResolution?.proposalSource).toBe('human');
        expect(artifacts.reportStructureResolution?.normalizationPlan.detailInclusionRoles).toEqual(['detail']);
    });
});
