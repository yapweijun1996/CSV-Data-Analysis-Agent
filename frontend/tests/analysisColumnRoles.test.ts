import { describe, expect, it } from 'vitest';
import type { ColumnProfile, RuntimeSemanticUnderstanding } from '../types';
import {
    buildAnalysisColumnRoleMap,
    classifyAnalysisColumnRole,
    findReplicatedUnpivotMetricColumns,
    isCanonicalContextDimensionColumn,
} from '../services/agent/analysisColumnRoles';
import { buildRuntimeDirectives } from '../services/agent/runtime/investigationDirectives';

const columns: ColumnProfile[] = [
    { name: '_unnamed_column_1', type: 'numerical', missingPercentage: 0 },
    { name: 'RowNumber', type: 'numerical', missingPercentage: 0 },
    { name: 'UOM', type: 'categorical', uniqueValues: 12, missingPercentage: 0 },
    { name: 'UOM_3', type: 'categorical', uniqueValues: 4, missingPercentage: 0 },
    { name: 'UOM_10', type: 'categorical', uniqueValues: 11, missingPercentage: 0 },
    { name: 'Qty', type: 'numerical', missingPercentage: 0 },
    { name: 'Qty_7', type: 'numerical', missingPercentage: 0 },
    { name: 'Stock Code', type: 'categorical', uniqueValues: 270, missingPercentage: 0 },
    { name: 'Item Cnt', type: 'numerical', missingPercentage: 0 },
    { name: 'SourceRowIndex', type: 'numerical', missingPercentage: 0 },
    { name: 'SectionLabel', type: 'categorical', uniqueValues: 15, missingPercentage: 0 },
];

const semanticUnderstanding: RuntimeSemanticUnderstanding = {
    businessGrains: ['Stock Code', 'UOM'],
    candidateMetrics: ['Item Cnt', 'Qty'],
    timeGrains: [],
    helperDimensions: [],
    blockedDimensions: ['SourceRowIndex'],
    detailRowPolicy: 'uncertain',
    businessGlossary: [],
    businessGrainConfidence: 'medium',
    unsafeForBusinessNarrative: false,
};

describe('analysisColumnRoles', () => {
    it('classifies unnamed, repeated bundle, and structural columns deterministically', () => {
        expect(classifyAnalysisColumnRole(columns[0], columns, semanticUnderstanding)).toBe('helper_dimension');
        expect(classifyAnalysisColumnRole(columns[1], columns, semanticUnderstanding)).toBe('helper_dimension');
        expect(classifyAnalysisColumnRole(columns[3], columns, semanticUnderstanding)).toBe('repeated_bundle_member');
        expect(classifyAnalysisColumnRole(columns[6], columns, semanticUnderstanding)).toBe('repeated_bundle_member');
        expect(classifyAnalysisColumnRole(columns[9], columns, semanticUnderstanding)).toBe('structural_metadata');
        expect(classifyAnalysisColumnRole(columns[10], columns, semanticUnderstanding)).toBe('helper_dimension');
    });

    it('treats date-like columns as dimensions even when the profiler marked them numerical', () => {
        const dateLikeColumn: ColumnProfile = { name: 'Date', type: 'numerical', missingPercentage: 0 };

        expect(classifyAnalysisColumnRole(dateLikeColumn, [dateLikeColumn], semanticUnderstanding)).toBe('business_dimension');
    });

    it('preserves business-safe base columns while blocking repeated family members', () => {
        const roleMap = buildAnalysisColumnRoleMap(columns, semanticUnderstanding);

        expect(roleMap['Stock Code']).toBe('business_dimension');
        expect(roleMap['UOM']).toBe('business_dimension');
        expect(roleMap['UOM_3']).toBe('repeated_bundle_member');
        expect(roleMap['UOM_10']).toBe('repeated_bundle_member');
        expect(roleMap['Item Cnt']).toBe('business_metric');
        expect(roleMap['Qty_7']).toBe('repeated_bundle_member');
        expect(roleMap['SectionLabel']).toBe('helper_dimension');
    });

    it('does not hard-block columns that are only in helperDimensions (soft signal)', () => {
        // A column in helperDimensions but NOT in blockedDimensions should fall
        // through to the type-based default, allowing it to be a business_dimension
        // candidate.  This prevents the reinforcement loop where a tentative helper
        // classification locks out viable business dimensions.
        const helperOnlySemantic: RuntimeSemanticUnderstanding = {
            ...semanticUnderstanding,
            helperDimensions: ['BUSINESS UNIT'],
            blockedDimensions: [],
        };
        const buColumn: ColumnProfile = { name: 'BUSINESS UNIT', type: 'categorical', uniqueValues: 11, missingPercentage: 0 };
        expect(classifyAnalysisColumnRole(buColumn, [buColumn], helperOnlySemantic)).toBe('business_dimension');
    });

    it('still blocks columns that are in blockedDimensions (hard signal)', () => {
        const blockedSemantic: RuntimeSemanticUnderstanding = {
            ...semanticUnderstanding,
            blockedDimensions: ['BUSINESS UNIT'],
        };
        const buColumn: ColumnProfile = { name: 'BUSINESS UNIT', type: 'categorical', uniqueValues: 11, missingPercentage: 0 };
        expect(classifyAnalysisColumnRole(buColumn, [buColumn], blockedSemantic)).toBe('helper_dimension');
    });

    it('flags canonical lineage context columns as helper dimensions', () => {
        expect(isCanonicalContextDimensionColumn('SectionLabel')).toBe(true);
        expect(isCanonicalContextDimensionColumn('ParentLabel')).toBe(true);
        expect(isCanonicalContextDimensionColumn('Section Path')).toBe(true);
        expect(isCanonicalContextDimensionColumn('HeaderPath')).toBe(true);
        expect(isCanonicalContextDimensionColumn('CarryForwardAppliedColumns')).toBe(true);
        expect(isCanonicalContextDimensionColumn('Stock Code')).toBe(false);
    });

    it('blocks numeric keep-columns that are replicated by unpivot operations', () => {
        const reshapedColumns: ColumnProfile[] = [
            { name: 'Stock Class', type: 'categorical', missingPercentage: 0 },
            { name: '2010 :: Margin', type: 'numerical', missingPercentage: 0 },
            { name: 'Value', type: 'numerical', missingPercentage: 0 },
        ];
        const dataPreparationPlan = {
            explanation: 'Reshape repeated metric columns.',
            operations: [{
                id: 'unpivot',
                type: 'unpivot_columns' as const,
                reason: 'Create a long table.',
                sourceColumns: ['Jan', 'Feb'],
                keepColumns: ['Stock Class', '2010 :: Margin'],
                keyColumn: 'SeriesKey',
                valueColumn: 'Value',
            }],
            outputColumns: reshapedColumns,
            planStatus: 'operations' as const,
            consistencyIssues: [],
        };

        const replicatedMetrics = findReplicatedUnpivotMetricColumns(
            reshapedColumns,
            dataPreparationPlan,
        );
        const roleMap = buildAnalysisColumnRoleMap(
            reshapedColumns,
            {
                ...semanticUnderstanding,
                candidateMetrics: ['2010 :: Margin', 'Value'],
            },
            { replicatedMetricColumns: replicatedMetrics },
        );

        expect(replicatedMetrics).toEqual(['2010 :: Margin']);
        expect(roleMap['2010 :: Margin']).toBe('repeated_bundle_member');
        expect(roleMap.Value).toBe('business_metric');

        const directives = buildRuntimeDirectives(
            reshapedColumns,
            [],
            [],
            [],
            {
                ...semanticUnderstanding,
                candidateMetrics: ['2010 :: Margin', 'Value'],
            },
            'Stock Class',
            { replicatedMetricColumns: replicatedMetrics },
        );
        expect(directives.blockedMetrics).toContain('2010 :: Margin');
        expect(directives.preferredMetrics).not.toContain('2010 :: Margin');
        expect(directives.preferredMetrics).toContain('Value');
    });

    it('tracks renamed numeric keep-columns to their final schema name', () => {
        const reshapedColumns: ColumnProfile[] = [
            { name: 'Annual Margin', type: 'currency', missingPercentage: 0 },
            { name: 'Value', type: 'numerical', missingPercentage: 0 },
        ];
        const dataPreparationPlan = {
            explanation: 'Reshape and rename.',
            operations: [
                {
                    id: 'unpivot',
                    type: 'unpivot_columns' as const,
                    reason: 'Create a long table.',
                    sourceColumns: ['Jan', 'Feb'],
                    keepColumns: ['Margin'],
                    keyColumn: 'SeriesKey',
                    valueColumn: 'Value',
                },
                {
                    id: 'rename',
                    type: 'rename_columns' as const,
                    reason: 'Use a business label.',
                    mappings: [{ from: 'Margin', to: 'Annual Margin' }],
                },
            ],
            outputColumns: reshapedColumns,
            planStatus: 'operations' as const,
            consistencyIssues: [],
        };

        expect(findReplicatedUnpivotMetricColumns(reshapedColumns, dataPreparationPlan))
            .toEqual(['Annual Margin']);
    });
});
