import { describe, expect, it } from 'vitest';
import {
    detectPivotCandidates,
    type HierarchyGroup,
    type MissingColumnPattern,
} from '../services/agent/runtime/dataInvestigationHarness';
import { buildHypotheses } from '../services/agent/runtime/hypothesisBuilder';
import type { ColumnProfile, RuntimeSemanticUnderstanding } from '../types';

// --- Helper factories ---

const makeCol = (
    name: string,
    type: ColumnProfile['type'] = 'categorical',
    uniqueValues = 5,
): ColumnProfile => ({
    name,
    type,
    uniqueValues,
});

const makeMissing = (
    column: string,
    nullRate: number,
): MissingColumnPattern => ({
    column,
    nullRate,
    blankRate: 0,
    zeroRate: 0,
    severity: nullRate > 0.5 ? 'severe' : 'moderate',
});

const makeHierarchy = (parent: string, children: string[]): HierarchyGroup => ({
    parent,
    parentTotal: 100_000,
    children: children.map(c => ({ description: c, total: 50_000 })),
    coverageRatio: 1.0,
});

// --- detectPivotCandidates ---

describe('detectPivotCandidates', () => {
    it('returns a candidate when two categorical dims and a numeric metric exist', () => {
        const columns = [
            makeCol('ProjectCode', 'categorical', 8),
            makeCol('Quarter', 'categorical', 4),
            makeCol('Value', 'currency', 100),
        ];
        const result = detectPivotCandidates(columns, [], [], [], ['ProjectCode', 'Quarter']);
        expect(result).toHaveLength(1);
        expect(result[0].rowDimension).toBe('ProjectCode');
        expect(result[0].columnDimension).toBe('Quarter');
        expect(result[0].metric).toBe('Value');
        expect(result[0].confidence).toBe('high');
    });

    it('excludes columns with >100 unique values', () => {
        const columns = [
            makeCol('ProjectCode', 'categorical', 105), // too many
            makeCol('Quarter', 'categorical', 4),
            makeCol('Value', 'numerical', 100),
        ];
        const result = detectPivotCandidates(columns, [], [], [], []);
        expect(result).toHaveLength(0);
    });

    it('excludes columns with <2 unique values', () => {
        const columns = [
            makeCol('ProjectCode', 'categorical', 1), // too few
            makeCol('Quarter', 'categorical', 4),
            makeCol('Value', 'numerical', 100),
        ];
        const result = detectPivotCandidates(columns, [], [], [], []);
        expect(result).toHaveLength(0);
    });

    it('excludes blocked dimensions', () => {
        const columns = [
            makeCol('ProjectCode', 'categorical', 8),
            makeCol('Quarter', 'categorical', 4),
            makeCol('Value', 'numerical', 100),
        ];
        const result = detectPivotCandidates(columns, ['ProjectCode'], [], [], []);
        expect(result).toHaveLength(0);
    });

    it('excludes pairs with cross-product >1000', () => {
        const columns = [
            makeCol('ProjectCode', 'categorical', 35),
            makeCol('Description', 'categorical', 35), // 35*35=1225 > 1000
            makeCol('Value', 'numerical', 100),
        ];
        const result = detectPivotCandidates(columns, [], [], [], []);
        expect(result).toHaveLength(0);
    });

    it('excludes columns with high null rate', () => {
        const columns = [
            makeCol('ProjectCode', 'categorical', 8),
            makeCol('Quarter', 'categorical', 4),
            makeCol('Value', 'numerical', 100),
        ];
        const missing = [makeMissing('Quarter', 0.15)]; // >10%
        const result = detectPivotCandidates(columns, [], [], missing, []);
        expect(result).toHaveLength(0);
    });

    it('returns empty when fewer than 2 categorical columns', () => {
        const columns = [
            makeCol('ProjectCode', 'categorical', 8),
            makeCol('Value', 'numerical', 100),
        ];
        const result = detectPivotCandidates(columns, [], [], [], []);
        expect(result).toHaveLength(0);
    });

    it('returns empty when no numeric metric exists', () => {
        const columns = [
            makeCol('ProjectCode', 'categorical', 8),
            makeCol('Quarter', 'categorical', 4),
            makeCol('Name', 'categorical', 50),
        ];
        const result = detectPivotCandidates(columns, [], [], [], []);
        expect(result).toHaveLength(0);
    });

    it('assigns medium confidence when neither dim is a business grain', () => {
        const columns = [
            makeCol('ProjectCode', 'categorical', 8),
            makeCol('Quarter', 'categorical', 4),
            makeCol('Value', 'numerical', 100),
        ];
        const result = detectPivotCandidates(columns, [], [], [], []); // no business grains
        expect(result).toHaveLength(1);
        expect(result[0].confidence).toBe('medium');
    });

    it('returns at most 2 candidates', () => {
        const columns = [
            makeCol('A', 'categorical', 5),
            makeCol('B', 'categorical', 4),
            makeCol('C', 'categorical', 3),
            makeCol('Value', 'numerical', 100),
        ];
        // 3 categorical = 3 pairs (A×B, A×C, B×C) but max 2 returned
        const result = detectPivotCandidates(columns, [], [], [], ['A', 'B', 'C']);
        expect(result.length).toBeLessThanOrEqual(2);
    });

    it('excludes structural metadata columns', () => {
        const columns = [
            makeCol('RowClass', 'categorical', 3),
            makeCol('Quarter', 'categorical', 4),
            makeCol('Value', 'numerical', 100),
        ];
        const result = detectPivotCandidates(columns, [], [], [], []);
        expect(result).toHaveLength(0);
    });

    it('includes rowCardinality and columnCardinality in candidate', () => {
        const columns = [
            makeCol('ProjectCode', 'categorical', 43),
            makeCol('Description', 'categorical', 10),
            makeCol('Value', 'currency', 100),
        ];
        const result = detectPivotCandidates(columns, [], [], [], ['ProjectCode', 'Description']);
        expect(result).toHaveLength(1);
        expect(result[0].rowCardinality).toBe(43);
        expect(result[0].columnCardinality).toBe(10);
    });

    it('excludes repeated bundle dimensions and helper metrics when column roles are supplied', () => {
        const columns = [
            makeCol('Stock Code', 'categorical', 20),
            makeCol('UOM', 'categorical', 4),
            makeCol('UOM_10', 'categorical', 4),
            makeCol('_unnamed_column_1', 'numerical', 100),
            makeCol('Item Cnt', 'numerical', 100),
        ];
        const result = detectPivotCandidates(columns, [], [], [], ['Stock Code', 'UOM'], {
            columnRoles: {
                'Stock Code': 'business_dimension',
                UOM: 'business_dimension',
                UOM_10: 'repeated_bundle_member',
                '_unnamed_column_1': 'helper_dimension',
                'Item Cnt': 'business_metric',
            },
            preferredMetrics: ['Item Cnt'],
            blockedMetrics: ['_unnamed_column_1'],
        });

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            rowDimension: 'Stock Code',
            columnDimension: 'UOM',
            metric: 'Item Cnt',
        });
    });

    it('excludes time-like numeric columns from pivot metrics', () => {
        const columns = [
            makeCol('Sales Exec', 'categorical', 16),
            makeCol('UOM', 'categorical', 5),
            makeCol('Date', 'numerical', 100),
            makeCol('Item Cnt', 'numerical', 100),
        ];
        const result = detectPivotCandidates(columns, [], [], [], ['Sales Exec', 'UOM'], {
            columnRoles: {
                'Sales Exec': 'business_dimension',
                UOM: 'business_dimension',
                Date: 'business_metric',
                'Item Cnt': 'business_metric',
            },
            preferredMetrics: ['Date', 'Item Cnt'],
            blockedMetrics: [],
        });

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            rowDimension: 'Sales Exec',
            columnDimension: 'UOM',
            metric: 'Item Cnt',
        });
    });

    it('applies fallback guards so helper and repeated columns cannot sneak back in through permissive roles', () => {
        const columns = [
            makeCol('Sales Exec', 'categorical', 16),
            makeCol('UOM', 'categorical', 5),
            makeCol('UOM_10', 'categorical', 5),
            makeCol('RowNumber', 'numerical', 100),
            makeCol('Item Cnt', 'numerical', 100),
        ];
        const result = detectPivotCandidates(columns, [], [], [], ['Sales Exec', 'UOM'], {
            columnRoles: {
                'Sales Exec': 'business_dimension',
                UOM: 'business_dimension',
                UOM_10: 'business_dimension',
                RowNumber: 'business_metric',
                'Item Cnt': 'business_metric',
            },
            preferredMetrics: ['RowNumber', 'Item Cnt'],
            blockedMetrics: [],
        });

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            rowDimension: 'Sales Exec',
            columnDimension: 'UOM',
            metric: 'Item Cnt',
        });
    });

    it('assigns the column with more unique values as row dimension', () => {
        const columns = [
            makeCol('Small', 'categorical', 3),
            makeCol('Large', 'categorical', 10),
            makeCol('Value', 'currency', 100),
        ];
        const result = detectPivotCandidates(columns, [], [], [], ['Small', 'Large']);
        expect(result).toHaveLength(1);
        expect(result[0].rowDimension).toBe('Large');
        expect(result[0].columnDimension).toBe('Small');
    });
});

// --- buildHypotheses with pivot candidates ---

describe('buildHypotheses pivot integration', () => {
    const baseSemanticUnderstanding: RuntimeSemanticUnderstanding = {
        businessGrains: ['ProjectCode'],
        candidateMetrics: ['Value'],
        helperDimensions: [],
        blockedDimensions: [],
        businessGrainConfidence: 'high',
        unsafeForBusinessNarrative: false,
        timeGrains: [],
        detailRowPolicy: null,
        businessGlossary: [],
    };

    const baseDatasetContext = {
        dimensionColumns: ['ProjectCode', 'Quarter'],
        metricColumns: ['Value'],
        blockedDimensions: [] as string[],
        preferredGrainColumns: ['ProjectCode'],
        preferredMetricTerms: ['Value'],
        preferredBusinessTerms: [],
        metricRelationshipTerms: [],
    } as ReturnType<typeof import('../services/agent/contextBuilder').buildDatasetContext>;

    it('appends a pivot hypothesis when high-confidence candidate is provided', () => {
        const pivots = [{
            rowDimension: 'ProjectCode',
            columnDimension: 'Quarter',
            metric: 'Value',
            aggregate: 'sum' as const,
            crossProductSize: 32,
            confidence: 'high' as const,
            rowCardinality: 8,
            columnCardinality: 4,
        }];
        const hypotheses = buildHypotheses(
            ['Sum of Value by ProjectCode'],
            baseSemanticUnderstanding,
            baseDatasetContext,
            pivots,
        );
        const pivotH = hypotheses.find(h => h.executionMode === 'pivot_matrix');
        expect(pivotH).toBeDefined();
        expect(pivotH!.pivotRequest).toBeDefined();
        expect(pivotH!.pivotRequest!.rows).toEqual(['ProjectCode']);
        expect(pivotH!.pivotRequest!.columns).toEqual(['Quarter']);
        expect(pivotH!.pivotRequest!.topN).toBeUndefined(); // ≤10 rows, no topN needed
        expect(pivotH!.priority).toBe(1); // lowest
    });

    it('sets topN=10 for high-cardinality row dimensions', () => {
        const pivots = [{
            rowDimension: 'ProjectCode',
            columnDimension: 'Quarter',
            metric: 'Value',
            aggregate: 'sum' as const,
            crossProductSize: 172,
            confidence: 'high' as const,
            rowCardinality: 43,
            columnCardinality: 4,
        }];
        const hypotheses = buildHypotheses(
            ['Sum of Value by ProjectCode'],
            baseSemanticUnderstanding,
            baseDatasetContext,
            pivots,
        );
        const pivotH = hypotheses.find(h => h.executionMode === 'pivot_matrix');
        expect(pivotH).toBeDefined();
        expect(pivotH!.pivotRequest!.topN).toBe(10);
    });

    it('sets topN=15 for medium-cardinality row dimensions (11-20)', () => {
        const pivots = [{
            rowDimension: 'ProjectCode',
            columnDimension: 'Quarter',
            metric: 'Value',
            aggregate: 'sum' as const,
            crossProductSize: 60,
            confidence: 'high' as const,
            rowCardinality: 15,
            columnCardinality: 4,
        }];
        const hypotheses = buildHypotheses(
            ['Sum of Value by ProjectCode'],
            baseSemanticUnderstanding,
            baseDatasetContext,
            pivots,
        );
        const pivotH = hypotheses.find(h => h.executionMode === 'pivot_matrix');
        expect(pivotH).toBeDefined();
        expect(pivotH!.pivotRequest!.topN).toBe(15);
    });

    it('accepts medium-confidence pivot candidates', () => {
        const pivots = [{
            rowDimension: 'ProjectCode',
            columnDimension: 'Description',
            metric: 'Value',
            aggregate: 'sum' as const,
            crossProductSize: 430,
            confidence: 'medium' as const,
            rowCardinality: 43,
            columnCardinality: 10,
        }];
        const hypotheses = buildHypotheses(
            ['Sum of Value by ProjectCode'],
            baseSemanticUnderstanding,
            baseDatasetContext,
            pivots,
        );
        const pivotH = hypotheses.find(h => h.executionMode === 'pivot_matrix');
        expect(pivotH).toBeDefined();
        expect(pivotH!.pivotRequest!.topN).toBe(10); // auto-capped for 43 rows
    });

    it('limits pivot hypotheses to 1 even with multiple candidates', () => {
        const pivots = [
            {
                rowDimension: 'ProjectCode',
                columnDimension: 'Quarter',
                metric: 'Value',
                aggregate: 'sum' as const,
                crossProductSize: 32,
                confidence: 'high' as const,
                rowCardinality: 8,
                columnCardinality: 4,
            },
            {
                rowDimension: 'ProjectCode',
                columnDimension: 'Category',
                metric: 'Value',
                aggregate: 'sum' as const,
                crossProductSize: 40,
                confidence: 'high' as const,
                rowCardinality: 8,
                columnCardinality: 5,
            },
        ];
        const hypotheses = buildHypotheses(
            ['Sum of Value by ProjectCode'],
            baseSemanticUnderstanding,
            baseDatasetContext,
            pivots,
        );
        const pivotHypotheses = hypotheses.filter(h => h.executionMode === 'pivot_matrix');
        expect(pivotHypotheses).toHaveLength(1);
    });

    it('works normally without suggestedPivots parameter', () => {
        const hypotheses = buildHypotheses(
            ['Sum of Value by ProjectCode'],
            baseSemanticUnderstanding,
            baseDatasetContext,
        );
        expect(hypotheses).toHaveLength(1);
        expect(hypotheses[0].executionMode).toBeUndefined();
    });

    it('drops suggested pivot hypotheses when steering marks their dimensions or metrics as blocked', () => {
        const pivots = [{
            rowDimension: 'UOM_10',
            columnDimension: 'UOM',
            metric: 'Date',
            aggregate: 'sum' as const,
            crossProductSize: 40,
            confidence: 'medium' as const,
            rowCardinality: 8,
            columnCardinality: 5,
        }];
        const datasetContext = {
            ...baseDatasetContext,
            blockedDimensions: ['UOM_10'],
            avoidMetricColumns: ['Date'],
            analysisSteering: {
                preferGroupBy: [],
                blockGroupBy: ['UOM_10'],
                blockedMetrics: ['Date'],
                softDeprioritizeGroupBy: [],
                excludeFromAggregation: [],
                hierarchyColumn: null,
                parentDescriptions: [],
                duplicateDescriptions: [],
                detailRowColumn: null,
                detailRowValue: null,
                columnRoles: {
                    UOM_10: 'repeated_bundle_member' as const,
                    UOM: 'business_dimension' as const,
                    Date: 'business_metric' as const,
                },
            },
        } as ReturnType<typeof import('../services/agent/contextBuilder').buildDatasetContext>;

        const hypotheses = buildHypotheses(
            ['Sum of Value by ProjectCode'],
            baseSemanticUnderstanding,
            datasetContext,
            pivots,
        );

        expect(hypotheses.some(h => h.executionMode === 'pivot_matrix')).toBe(false);
    });
});
