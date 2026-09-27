import { describe, expect, it } from 'vitest';
import type { DataPreparationPlan } from '../types';
import {
    shouldRequireRawFirstInspection,
    validateDataPreparationPlanAgainstRawReportContract,
} from '../services/agent/orchestration/rawReportContract';
import {
    createHierarchicalWideStatementCase,
    createMultiHeaderProjectMatrixCase,
} from './reportShapeFixtures/cases';

const clonePlan = (plan: DataPreparationPlan): DataPreparationPlan =>
    JSON.parse(JSON.stringify(plan)) as DataPreparationPlan;

describe('validateDataPreparationPlanAgainstRawReportContract', () => {
    it('fails when multi-header unpivot omits labelColumns', () => {
        const fixture = createMultiHeaderProjectMatrixCase();

        expect(
            validateDataPreparationPlanAgainstRawReportContract(
                fixture.rawLike,
                fixture.cleanedBroken.missingSeriesLabel.plan,
            ),
        ).toBe('Wide-report unpivot_columns must preserve all detected header label layers. Expected 1 labelColumns entries.');
    });

    it('fails when unpivot omits source coordinate columns', () => {
        const fixture = createMultiHeaderProjectMatrixCase();
        const brokenPlan = clonePlan(fixture.goodPlan!);
        const unpivotOperation = brokenPlan.operations[0];
        if (unpivotOperation.type !== 'unpivot_columns') {
            throw new Error('Expected an unpivot plan.');
        }
        delete unpivotOperation.sourceColumnNameColumn;
        delete unpivotOperation.sourceRowIndexColumn;

        expect(
            validateDataPreparationPlanAgainstRawReportContract(fixture.rawLike, brokenPlan),
        ).toBe('Wide-report unpivot_columns must preserve sourceColumnNameColumn and sourceRowIndexColumn.');
    });

    it('fails when unpivot includes summary columns as detail series', () => {
        const fixture = createMultiHeaderProjectMatrixCase();
        const brokenPlan = clonePlan(fixture.goodPlan!);
        const unpivotOperation = brokenPlan.operations[0];
        if (unpivotOperation.type !== 'unpivot_columns') {
            throw new Error('Expected an unpivot plan.');
        }
        unpivotOperation.sourceColumns.push('Total');

        expect(
            validateDataPreparationPlanAgainstRawReportContract(fixture.rawLike, brokenPlan),
        ).toBe('Wide-report unpivot_columns must exclude summary or total columns from detail reshaping. Remove: Total.');
    });

    it('fails when hierarchical wide reports omit rowClass preservation', () => {
        const fixture = createHierarchicalWideStatementCase();
        const brokenPlan = clonePlan(fixture.goodPlan!);
        const unpivotOperation = brokenPlan.operations[0];
        if (unpivotOperation.type !== 'unpivot_columns') {
            throw new Error('Expected an unpivot plan.');
        }
        delete unpivotOperation.rowClassColumn;
        delete unpivotOperation.rowClassMappings;

        expect(
            validateDataPreparationPlanAgainstRawReportContract(fixture.rawLike, brokenPlan),
        ).toBe('Hierarchical wide reports must preserve rowClassColumn during unpivot_columns.');
    });

    it('fails when hierarchical wide reports omit hierarchy depth preservation', () => {
        const fixture = createHierarchicalWideStatementCase();
        const brokenPlan = clonePlan(fixture.goodPlan!);
        const unpivotOperation = brokenPlan.operations[0];
        if (unpivotOperation.type !== 'unpivot_columns') {
            throw new Error('Expected an unpivot plan.');
        }
        delete unpivotOperation.hierarchyDepthColumn;
        delete unpivotOperation.hierarchyDepthMappings;

        expect(
            validateDataPreparationPlanAgainstRawReportContract(fixture.rawLike, brokenPlan),
        ).toBe('Hierarchical wide reports must preserve hierarchyDepthColumn during unpivot_columns.');
    });

    it('passes for a valid multi-header unpivot plan', () => {
        const fixture = createMultiHeaderProjectMatrixCase();

        expect(
            validateDataPreparationPlanAgainstRawReportContract(fixture.rawLike, fixture.goodPlan),
        ).toBeNull();
    });

    it('requires raw-first inspection when intake IR detects parameter rows and repeated headers', () => {
        const rawLike = {
            fileName: 'special-price-summary.csv',
            data: [
                { QuotationNumber: 'TS1004', Customer: 'JEWEL' },
            ],
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
            summaryRowCount: 0,
        };
        const intakeIr = {
            fileName: 'special-price-summary.csv',
            columnCount: 4,
            rawRows: [
                ['KINETICS INDUSTRIES (DEMO 2011) LIMITED', '', '', ''],
                ['Special Price Summary Report', '', '', ''],
                ['', 'Quotation Date', 'Quotation Number', 'Customer Name'],
                ['', 'Sales Person Name', '', ''],
                ['', 'Print Date', '', ''],
                ['', 'Supplier Name', '', ''],
                ['', 'Quotation Date', 'Quotation Number', 'Customer Name'],
                ['1.', '01-08-2010', 'TS1004', 'JEWEL'],
            ],
            normalizedRows: [
                ['KINETICS INDUSTRIES (DEMO 2011) LIMITED', '', '', ''],
                ['Special Price Summary Report', '', '', ''],
                ['', 'Quotation Date', 'Quotation Number', 'Customer Name'],
                ['', 'Sales Person Name', '', ''],
                ['', 'Print Date', '', ''],
                ['', 'Supplier Name', '', ''],
                ['', 'Quotation Date', 'Quotation Number', 'Customer Name'],
                ['1.', '01-08-2010', 'TS1004', 'JEWEL'],
            ],
            detection: undefined,
            segments: [],
            provisionalTable: {
                headerRowIndex: 6,
                headerLayerRowIndexes: [],
                bodyStartIndex: 7,
                summaryStartIndex: 8,
                repeatedHeaderRowIndexes: [2],
                metadataRowIndexes: [0, 1, 2, 3, 4, 5],
                parameterRowIndexes: [3, 4, 5],
            },
            diagnostics: {
                hasRepeatedHeader: true,
                hasParameterRowsBetweenHeaderAndBody: true,
                headerShapeDrift: false,
                singleColumnFallbackApplied: false,
                bodyEvidenceKind: 'dated_row_sequence' as const,
                segmentCountsByKind: { parameter: 1, repeated_header: 1, header: 1, body: 1 },
                headerCandidates: [],
                bodyStartCandidates: [],
                evidenceStrength: 'moderate' as const,
                fallbackReason: null,
            },
        };

        expect(shouldRequireRawFirstInspection(rawLike, intakeIr)).toBe(true);
    });
});
