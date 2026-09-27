import { describe, expect, it } from 'vitest';
import { applyDataOperations, applySpreadsheetFilterOperation, createQueryPlanFromFilterOperation, executeDataQuery, normalizeDataMutatePayload, normalizeDataPreparationPlan } from '../services/agent/execution/dataOperationRunner';
import type { DataOperation } from '../types';
import { createHierarchicalStatementRaw } from './reportShapeFixtures/families';

describe('dataOperationRunner', () => {
    it('applies deterministic operations in order', () => {
        const operations: DataOperation[] = [
            {
                id: 'trim-region',
                type: 'trim_whitespace',
                reason: 'Normalize region labels.',
                columns: ['Region'],
            },
            {
                id: 'cast-revenue',
                type: 'cast_column',
                reason: 'Convert revenue to numeric values.',
                column: 'Revenue',
                targetType: 'currency',
            },
            {
                id: 'filter-region',
                type: 'filter_rows',
                reason: 'Remove south region rows.',
                predicates: [{ column: 'Region', operator: 'neq', value: 'South' }],
            },
        ];

        const result = applyDataOperations([
            { Region: ' East ', Revenue: '$1,200.00' },
            { Region: 'South', Revenue: '$0.00' },
        ], operations);

        expect(result.data).toEqual([{ Region: 'East', Revenue: 1200 }]);
        expect(result.logs).toHaveLength(3);
        expect(result.logs.every(log => log.status === 'done')).toBe(true);
    });

    it('fails fast and rolls back the step when columns are invalid', () => {
        const operations: DataOperation[] = [
            {
                id: 'bad-cast',
                type: 'cast_column',
                reason: 'Try to cast a missing column.',
                column: 'MissingColumn',
                targetType: 'number',
            },
        ];

        expect(() => applyDataOperations([{ Region: 'East' }], operations)).toThrow(/missing columns/i);
    });

    it('supports deterministic row dropping, header promotion, and blank-row cleanup', () => {
        const operations: DataOperation[] = [
            {
                id: 'drop-title',
                type: 'drop_rows_by_index',
                reason: 'Remove title row.',
                indices: [0],
            },
            {
                id: 'promote-header',
                type: 'promote_header_row',
                reason: 'Use the next row as the real header.',
                rowIndex: 0,
            },
            {
                id: 'drop-blanks',
                type: 'drop_blank_rows',
                reason: 'Remove blank body rows.',
            },
        ];

        const result = applyDataOperations([
            { col_1: 'Income Statement', col_2: '' },
            { col_1: 'ProjectCode', col_2: 'Amount' },
            { col_1: '10000', col_2: '1200.00' },
            { col_1: '', col_2: '' },
        ], operations);

        expect(result.data).toEqual([{ ProjectCode: '10000', Amount: '1200.00' }]);
        expect(result.logs).toHaveLength(3);
    });

    it('supports dropping rows by deterministic predicates', () => {
        const result = applyDataOperations([
            { Code: '501001', Description: 'Revenue' },
            { Code: '600001', Description: 'Cost' },
        ], [
            {
                id: 'drop-revenue-row',
                type: 'drop_rows_by_condition',
                reason: 'Remove Code 501001 from the cleaned dataset.',
                predicates: [{ column: 'Code', operator: 'eq', value: '501001' }],
            },
        ]);

        expect(result.data).toEqual([{ Code: '600001', Description: 'Cost' }]);
    });

    it('rejects unpivot operations that include total-like source columns', () => {
        const operations: DataOperation[] = [
            {
                id: 'bad-unpivot',
                type: 'unpivot_columns',
                reason: 'Attempt to unpivot Total.',
                sourceColumns: ['10000', 'Total'],
                keyColumn: 'ProjectCode',
                valueColumn: 'Amount',
                keepColumns: ['Code', 'Description'],
            },
        ];

        expect(() => applyDataOperations([
            { Code: '501001', Description: 'Revenue', 10000: '10.00', Total: '10.00' },
        ], operations)).toThrow(/summary columns/i);
    });

    it('preserves optional series labels and source coordinates during unpivot', () => {
        const result = applyDataOperations([
            { Code: '501001', Description: 'Revenue', 10000: '10.00', 10001: '0.00' },
            { Code: '600001', Description: 'Costs', 10000: '-4.00', 10001: '0.00' },
        ], [
            {
                id: 'unpivot-series',
                type: 'unpivot_columns',
                reason: 'Preserve multi-header semantics.',
                sourceColumns: ['10000', '10001'],
                keyColumn: 'SeriesKey',
                valueColumn: 'Value',
                keepColumns: ['Code', 'Description'],
                labelColumn: 'SeriesLabel',
                labelMappings: [
                    { sourceColumn: '10000', label: 'Project Alpha' },
                    { sourceColumn: '10001', label: 'Project Beta' },
                ],
                sourceColumnNameColumn: 'SourceColumnName',
                sourceRowIndexColumn: 'SourceRowIndex',
                rowClassColumn: 'RowClass',
                rowClassMappings: [
                    { sourceRowIndex: 0, rowClass: 'fact' },
                    { sourceRowIndex: 1, rowClass: 'fact' },
                ],
            },
        ]);

        expect(result.data[0]).toEqual({
            Code: '501001',
            Description: 'Revenue',
            SeriesKey: '10000',
            Value: '10.00',
            SeriesLabel: 'Project Alpha',
            SourceColumnName: '10000',
            SourceRowIndex: 0,
            RowClass: 'fact',
        });
        expect(result.data[3]).toEqual({
            Code: '600001',
            Description: 'Costs',
            SeriesKey: '10001',
            Value: '0.00',
            SeriesLabel: 'Project Beta',
            SourceColumnName: '10001',
            SourceRowIndex: 1,
            RowClass: 'fact',
        });
    });

    it('supports multi-layer labels and hierarchy depth during unpivot', () => {
        const result = applyDataOperations([
            { Code: '', Description: 'Revenue', 21000: null, 21001: null },
            { Code: '4010', Description: 'Service Revenue', 21000: '600.00', 21001: '500.00' },
        ], [
            {
                id: 'unpivot-depth-series',
                type: 'unpivot_columns',
                reason: 'Preserve multi-layer labels and hierarchy depth.',
                sourceColumns: ['21000', '21001'],
                keyColumn: 'SeriesKey',
                valueColumn: 'Value',
                keepColumns: ['Code', 'Description'],
                labelColumns: [
                    {
                        outputColumn: 'SeriesLabelL1',
                        mappings: [
                            { sourceColumn: '21000', label: 'North' },
                            { sourceColumn: '21001', label: 'South' },
                        ],
                    },
                    {
                        outputColumn: 'SeriesLabelL2',
                        mappings: [
                            { sourceColumn: '21000', label: 'Alpha' },
                            { sourceColumn: '21001', label: 'Beta' },
                        ],
                    },
                ],
                sourceRowIndexColumn: 'SourceRowIndex',
                sourceColumnNameColumn: 'SourceColumnName',
                rowClassColumn: 'RowClass',
                rowClassMappings: [
                    { sourceRowIndex: 0, rowClass: 'group_header' },
                    { sourceRowIndex: 1, rowClass: 'fact' },
                ],
                hierarchyDepthColumn: 'HierarchyDepth',
                hierarchyDepthMappings: [
                    { sourceRowIndex: 0, depth: 1 },
                    { sourceRowIndex: 1, depth: 1 },
                ],
            },
        ]);

        expect(result.data[0]).toEqual({
            Code: '',
            Description: 'Revenue',
            SeriesKey: '21000',
            Value: null,
            SeriesLabelL1: 'North',
            SeriesLabelL2: 'Alpha',
            SourceRowIndex: 0,
            SourceColumnName: '21000',
            RowClass: 'group_header',
            HierarchyDepth: 1,
        });
        expect(result.data[3]).toEqual({
            Code: '4010',
            Description: 'Service Revenue',
            SeriesKey: '21001',
            Value: '500.00',
            SeriesLabelL1: 'South',
            SeriesLabelL2: 'Beta',
            SourceRowIndex: 1,
            SourceColumnName: '21001',
            RowClass: 'fact',
            HierarchyDepth: 1,
        });
    });

    it('annotates row class, hierarchy depth, and source row index for hierarchical statements after cleanup', () => {
        const raw = createHierarchicalStatementRaw();
        const result = applyDataOperations(raw.data, [
            {
                id: 'drop-report-noise',
                type: 'drop_rows_by_index',
                reason: 'Remove metadata and footer rows.',
                indices: [0, 1, 12],
            },
            {
                id: 'drop-remaining-blanks',
                type: 'drop_blank_rows',
                reason: 'Remove remaining blanks.',
            },
            {
                id: 'annotate-hierarchy',
                type: 'annotate_hierarchy',
                reason: 'Preserve statement hierarchy semantics.',
                rowClassColumn: 'RowClass',
                hierarchyDepthColumn: 'HierarchyDepth',
                sourceRowIndexColumn: 'SourceRowIndex',
            },
        ]);

        expect(result.data[0]).toEqual({
            Code: '',
            Description: 'Revenue',
            Amount: '',
            RowClass: 'group_header',
            HierarchyDepth: expect.any(Number),
            SourceRowIndex: 0,
        });
        expect(result.data[8]).toEqual({
            Code: '',
            Description: 'Subtotal',
            Amount: '1860.00',
            RowClass: 'subtotal',
            HierarchyDepth: expect.any(Number),
            SourceRowIndex: 8,
        });
        expect(result.data[9]).toEqual({
            Code: '',
            Description: 'Net Profit',
            Amount: '1860.00',
            RowClass: 'fact',
            HierarchyDepth: expect.any(Number),
            SourceRowIndex: 9,
        });
    });

    it('derives cross-row profit metrics from label/value rows', () => {
        const result = applyDataOperations([
            { Project: 'Alpha', Description: 'Revenue', Value: '100.00', SeriesLabelL1: 'North' },
            { Project: 'Alpha', Description: 'Cost of Sales', Value: '40.00', SeriesLabelL1: 'North' },
            { Project: 'Beta', Description: 'Revenue', Value: '80.00', SeriesLabelL1: 'South' },
            { Project: 'Beta', Description: 'Cost of Sales', Value: '30.00', SeriesLabelL1: 'South' },
        ], [
            {
                id: 'derive-profit',
                type: 'derive_metric_by_label',
                reason: 'Append profit rows by project.',
                groupByColumns: ['Project'],
                labelColumn: 'Description',
                valueColumn: 'Value',
                outputMetricLabel: 'Profit',
                carryForwardColumns: ['SeriesLabelL1'],
                formula: {
                    kind: 'linear_combination',
                    components: [
                        { operator: 'add', matchAny: ['revenue'] },
                        { operator: 'subtract', matchAny: ['cost'] },
                    ],
                },
            },
        ]);

        expect(result.logs).toHaveLength(1);
        expect(result.logs[0]?.status).toBe('done');
        expect(result.data.slice(-2)).toEqual([
            { Project: 'Alpha', Description: 'Profit', Value: 60, SeriesLabelL1: 'North' },
            { Project: 'Beta', Description: 'Profit', Value: 50, SeriesLabelL1: 'South' },
        ]);
    });

    it('normalizes legacy data preparation plans for read-only inspection', () => {
        const normalized = normalizeDataPreparationPlan({
            explanation: 'Legacy JS transform',
            jsFunctionBody: 'return data.filter(Boolean);',
            outputColumns: [{ name: 'Region', type: 'categorical' }],
        });

        expect(normalized?.operations).toEqual([]);
        expect(normalized?.legacy?.jsFunctionBody).toContain('return data.filter(Boolean);');
    });

    it('drops malformed mutate operations before execution-time validation', () => {
        const normalized = normalizeDataMutatePayload({
            explanation: 'Bad payload',
            operations: [
                {
                    id: 'remove_metadata_rows',
                    type: 'unpivot_columns',
                    indices: [0, 1],
                },
                {
                    id: 'drop-title',
                    type: 'drop_rows_by_index',
                    reason: 'Remove title row.',
                    indices: [0],
                },
            ],
            outputColumns: [],
        });

        expect(normalized.rawOperationCount).toBe(2);
        expect(normalized.plan?.operations).toEqual([
            {
                id: 'drop-title',
                type: 'drop_rows_by_index',
                reason: 'Remove title row.',
                indices: [0],
            },
        ]);
    });

    it('allows empty results for spreadsheet-only filter operations', () => {
        const result = applySpreadsheetFilterOperation(
            [{ Region: 'East' }],
            {
                id: 'filter-none',
                type: 'filter_rows',
                reason: 'Return no rows in explorer.',
                predicates: [{ column: 'Region', operator: 'eq', value: 'West' }],
            },
        );

        expect(result.data).toEqual([]);
        expect(result.logs[0].status).toBe('done');
    });

    it('supports hardened filter operators and simple OR groups', () => {
        const result = applySpreadsheetFilterOperation(
            [
                { Region: 'East', Revenue: '1200', Name: 'Alpha Team' },
                { Region: 'West', Revenue: '900', Name: 'Beta Team' },
                { Region: 'South', Revenue: '300', Name: 'Gamma Team' },
            ],
            {
                id: 'filter-hardened',
                type: 'filter_rows',
                reason: 'Test starts_with, between, and OR groups.',
                groups: [
                    {
                        predicates: [
                            { column: 'Name', operator: 'starts_with', value: 'Alpha' },
                            { column: 'Revenue', operator: 'between', value: [1000, 1500] },
                        ],
                    },
                    {
                        predicates: [
                            { column: 'Region', operator: 'ends_with', value: 'th' },
                        ],
                    },
                ],
            },
        );

        expect(result.data).toHaveLength(2);
        expect(result.data.map(row => row.Region)).toEqual(['East', 'South']);
    });

    it('salvages malformed filter_rows plans into a safe schema-only fallback', () => {
        const normalized = normalizeDataPreparationPlan({
            explanation: 'Bad filter plan',
            operations: [
                {
                    id: 'bad-filter',
                    type: 'filter_rows',
                    reason: 'Missing predicates array',
                },
            ],
            outputColumns: [{ name: 'Region', type: 'categorical' }],
        });

        expect(normalized?.operations).toEqual([]);
        expect(normalized?.outputColumns).toHaveLength(1);
    });

    it('throws a clear error when runtime filter groups are malformed', () => {
        expect(() => applySpreadsheetFilterOperation(
            [{ Region: 'East' }],
            {
                id: 'bad-filter-runtime',
                type: 'filter_rows',
                reason: 'Broken runtime payload',
                groups: [{ predicates: undefined as any }],
            } as any,
        )).toThrow(/valid predicates or groups/i);
    });

    it('normalizes common near-miss AI data-prep operations instead of rejecting the whole plan', () => {
        const normalized = normalizeDataPreparationPlan({
            explanation: 'Clean the data.',
            operations: [
                {
                    id: 'op_rename_id',
                    type: 'rename_columns',
                    reason: 'Rename the index column.',
                    columns: {
                        _unnamed_column_1: 'LineItemID',
                    },
                },
                {
                    id: 'op_normalize',
                    type: 'normalize_empty_values',
                    reason: 'Normalize blanks.',
                },
                {
                    id: 'op_cast_qty',
                    type: 'cast_column',
                    reason: 'Convert Qty.',
                    column: 'Qty',
                    targetType: 'numerical',
                },
                {
                    id: 'op_filter_junk',
                    type: 'filter_rows',
                    reason: 'Remove rows missing document number.',
                    condition: "row['Document Number'] != null && row['Document Number'] != ''",
                },
            ],
            outputColumns: [{ name: 'LineItemID', type: 'categorical' }],
        });

        expect(normalized?.operations).toHaveLength(4);
        expect(normalized?.operations[0]).toMatchObject({
            type: 'rename_columns',
            mappings: [{ from: '_unnamed_column_1', to: 'LineItemID' }],
        });
        expect(normalized?.operations[1]).toMatchObject({
            type: 'normalize_empty_values',
            columns: '*',
        });
        expect(normalized?.operations[2]).toMatchObject({
            type: 'cast_column',
            targetType: 'number',
        });
        expect(normalized?.operations[3]).toMatchObject({
            type: 'filter_rows',
            predicates: [{ column: 'Document Number', operator: 'not_null' }],
        });
    });

    it('fills in missing operation type and reason when the AI uses the operation type as the id', () => {
        const normalized = normalizeDataPreparationPlan({
            explanation: 'Remove report noise and promote the real header row.',
            operations: [
                {
                    id: 'drop_rows_by_index',
                    indices: [0, 1],
                },
                {
                    id: 'promote_header_row',
                    rowIndex: 0,
                },
                {
                    id: 'drop_blank_rows',
                },
            ],
            outputColumns: [],
        });

        expect(normalized?.operations).toEqual([
            {
                id: 'drop_rows_by_index',
                type: 'drop_rows_by_index',
                reason: 'Remove report noise and promote the real header row.',
                indices: [0, 1],
            },
            {
                id: 'promote_header_row',
                type: 'promote_header_row',
                reason: 'Remove report noise and promote the real header row.',
                rowIndex: 0,
            },
            {
                id: 'drop_blank_rows',
                type: 'drop_blank_rows',
                reason: 'Remove report noise and promote the real header row.',
            },
        ]);
    });

    it('accepts a singular mutation operation field for near-miss AI payloads', () => {
        const normalized = normalizeDataMutatePayload({
            explanation: 'Remove the revenue code row.',
            operation: {
                id: 'drop-revenue',
                type: 'drop_rows_by_condition',
                reason: 'Delete Code 501001.',
                predicates: [{ column: 'Code', operator: 'eq', value: '501001' }],
            },
            outputColumns: [],
        });

        expect(normalized.rawOperationCount).toBe(1);
        expect(normalized.plan?.operations).toEqual([
            {
                id: 'drop-revenue',
                type: 'drop_rows_by_condition',
                reason: 'Delete Code 501001.',
                predicates: [{ column: 'Code', operator: 'eq', value: '501001' }],
            },
        ]);
    });

    it('infers missing deterministic operation types from near-miss cleaning payloads', () => {
        const normalized = normalizeDataMutatePayload({
            explanation: 'Normalize the Value column before analysis.',
            operations: [
                {
                    id: 'clean_value_commas',
                    reason: 'Remove comma separators from Value.',
                    column: 'Value',
                    search: ',',
                    replaceWith: '',
                },
                {
                    id: 'cast_value_to_double',
                    reason: 'Cast Value to double.',
                    column: 'Value',
                    targetType: 'double',
                },
            ],
            outputColumns: [],
        });

        expect(normalized.rawOperationCount).toBe(2);
        expect(normalized.plan?.operations).toHaveLength(2);
        expect(normalized.plan?.operations[0]).toMatchObject({
            id: 'clean_value_commas',
            type: 'replace_values',
            reason: 'Remove comma separators from Value.',
            column: 'Value',
            replacements: [{ from: ',', to: '' }],
        });
        expect(normalized.plan?.operations[1]).toMatchObject({
            id: 'cast_value_to_double',
            type: 'cast_column',
            reason: 'Cast Value to double.',
            column: 'Value',
            targetType: 'number',
        });
    });

    it('salvages nested replace_values payloads that hide the column and replacement fields inside args', () => {
        const normalized = normalizeDataMutatePayload({
            explanation: 'Standardize redundant revenue descriptions.',
            operations: [
                {
                    id: 'std_revenue',
                    type: 'replace_values',
                    reason: 'Normalize revenue labels to a shared business term.',
                    args: {
                        replacements: [
                            {
                                field: 'Description',
                                search: 'Construction Contract Revenue',
                                replaceWith: 'Revenue',
                            },
                            {
                                column: 'Description',
                                oldValue: 'Project Revenue',
                                newValue: 'Revenue',
                            },
                        ],
                    },
                },
            ],
            outputColumns: [],
        });

        expect(normalized.rawOperationCount).toBe(1);
        expect(normalized.plan?.operations).toHaveLength(1);
        expect(normalized.plan?.operations[0]).toMatchObject({
            id: 'std_revenue',
            type: 'replace_values',
            reason: 'Normalize revenue labels to a shared business term.',
            column: 'Description',
            replacements: [
                { from: 'Construction Contract Revenue', to: 'Revenue' },
                { from: 'Project Revenue', to: 'Revenue' },
            ],
        });
    });

    it('executes read-only projection, sorting, and limit query plans', () => {
        const result = executeDataQuery(
            [
                { Region: 'East', Revenue: '1200', Rep: 'Ada' },
                { Region: 'West', Revenue: '900', Rep: 'Ben' },
                { Region: 'North', Revenue: '1500', Rep: 'Cara' },
            ],
            {
                select: ['Region', 'Revenue'],
                orderBy: [{ column: 'Revenue', direction: 'desc' }],
                limit: 2,
            },
        );

        expect(result.rows).toEqual([
            { Region: 'North', Revenue: '1500' },
            { Region: 'East', Revenue: '1200' },
        ]);
        expect(result.totalMatchedRows).toBe(3);
        expect(result.returnedRows).toBe(2);
        expect(result.truncated).toBe(true);
    });

    it('treats uppercase DESC directions as descending order in read-only queries', () => {
        const result = executeDataQuery(
            [
                { Region: 'East', Revenue: '1200' },
                { Region: 'West', Revenue: '900' },
                { Region: 'North', Revenue: '1500' },
            ],
            {
                select: ['Region', 'Revenue'],
                orderBy: [{ column: 'Revenue', direction: 'DESC' as 'desc' }],
                limit: 2,
            },
        );

        expect(result.rows).toEqual([
            { Region: 'North', Revenue: '1500' },
            { Region: 'East', Revenue: '1200' },
        ]);
    });

    it('executes read-only where clauses through the filter compatibility bridge', () => {
        const plan = createQueryPlanFromFilterOperation({
            id: 'query-east',
            type: 'filter_rows',
            reason: 'Inspect East rows only.',
            predicates: [{ column: 'Region', operator: 'eq', value: 'East' }],
        }, {
            select: ['Region'],
        });

        const result = executeDataQuery(
            [
                { Region: 'East', Revenue: 1200 },
                { Region: 'West', Revenue: 900 },
            ],
            plan,
        );

        expect(result.rows).toEqual([{ Region: 'East' }]);
        expect(result.selectedColumns).toEqual(['Region']);
    });

    it('fails closed when ordering by a non-selected column in explicit projection mode', () => {
        expect(() => executeDataQuery(
            [{ Region: 'East', Revenue: 1200 }],
            {
                select: ['Region'],
                orderBy: [{ column: 'Revenue', direction: 'desc' }],
            },
        )).toThrow(/must also appear in select/i);
    });

    it('executes grouped aggregate query plans without mutating the source rows', () => {
        const sourceRows = [
            { Region: 'East', Revenue: '1200' },
            { Region: 'East', Revenue: '800' },
            { Region: 'West', Revenue: '900' },
        ];

        const result = executeDataQuery(sourceRows, {
            groupBy: ['Region'],
            aggregates: [
                { function: 'sum', column: 'Revenue', as: 'TotalRevenue' },
                { function: 'count', as: 'RowCount' },
            ],
            orderBy: [{ column: 'TotalRevenue', direction: 'desc' }],
        });

        expect(result.rows).toEqual([
            { Region: 'East', TotalRevenue: 2000, RowCount: 2 },
            { Region: 'West', TotalRevenue: 900, RowCount: 1 },
        ]);
        expect(sourceRows).toEqual([
            { Region: 'East', Revenue: '1200' },
            { Region: 'East', Revenue: '800' },
            { Region: 'West', Revenue: '900' },
        ]);
    });

    it('supports grand-total aggregate queries without groupBy', () => {
        const result = executeDataQuery(
            [
                { Revenue: '1200' },
                { Revenue: '800' },
            ],
            {
                aggregates: [
                    { function: 'sum', column: 'Revenue', as: 'TotalRevenue' },
                    { function: 'avg', column: 'Revenue', as: 'AverageRevenue' },
                    { function: 'count', as: 'RowCount' },
                ],
            },
        );

        expect(result.rows).toEqual([
            { TotalRevenue: 2000, AverageRevenue: 1000, RowCount: 2 },
        ]);
        expect(result.totalMatchedRows).toBe(1);
    });

    it('executes aggregate-scoped filters without collapsing distinct metrics into the same total', () => {
        const result = executeDataQuery(
            [
                { Project: 'Alpha', Description: 'Revenue', Value: '100' },
                { Project: 'Alpha', Description: 'Cost of Sales', Value: '40' },
                { Project: 'Beta', Description: 'Revenue', Value: '80' },
                { Project: 'Beta', Description: 'Cost of Sales', Value: '30' },
            ],
            {
                groupBy: ['Project'],
                aggregates: [
                    {
                        function: 'sum',
                        column: 'Value',
                        as: 'total_revenue',
                        where: {
                            predicates: [{ column: 'Description', operator: 'in', value: ['Revenue'] }],
                        },
                    },
                    {
                        function: 'sum',
                        column: 'Value',
                        as: 'total_cost',
                        where: {
                            predicates: [{ column: 'Description', operator: 'in', value: ['Cost of Sales'] }],
                        },
                    },
                ],
                select: ['Project', 'total_revenue', 'total_cost'],
                orderBy: [{ column: 'Project', direction: 'asc' }],
            },
        );

        expect(result.rows).toEqual([
            { Project: 'Alpha', total_revenue: 100, total_cost: 40 },
            { Project: 'Beta', total_revenue: 80, total_cost: 30 },
        ]);
    });

    it('fails with an explicit contract error instead of a trim type error for malformed orderBy clauses', () => {
        expect(() => executeDataQuery(
            [{ Region: 'East', Revenue: 1200 }],
            {
                select: ['Region'],
                orderBy: [{ direction: 'desc' } as never],
            },
        )).toThrow(/requires a non-empty column name|must be an object/i);
    });

    it('gracefully skips where predicates that reference missing columns instead of crashing', () => {
        const rows = [
            { Region: 'East', Revenue: 1200 },
            { Region: 'West', Revenue: 800 },
        ];

        const result = executeDataQuery(rows, {
            select: ['Region', 'Revenue'],
            where: {
                predicates: [
                    { column: 'RowClass', operator: 'eq', value: 'fact' },
                    { column: 'Region', operator: 'eq', value: 'East' },
                ],
            },
        });

        expect(result.rows).toEqual([{ Region: 'East', Revenue: 1200 }]);
        expect(result.returnedRows).toBe(1);
    });

    it('throws when ALL where predicates reference missing columns to prevent silent full-table degradation', () => {
        const rows = [
            { Region: 'East', Revenue: 1200 },
            { Region: 'West', Revenue: 800 },
        ];

        expect(() => executeDataQuery(rows, {
            select: ['Region', 'Revenue'],
            where: {
                predicates: [
                    { column: 'RowClass', operator: 'eq', value: 'fact' },
                ],
            },
        })).toThrow(/All where filter columns are missing/);
    });
});
