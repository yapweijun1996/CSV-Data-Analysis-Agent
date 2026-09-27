import type { DataOperationType } from '../../../types';

const dataOperationBaseSchema = {
    id: { type: 'string', description: 'Stable operation identifier.' },
    reason: { type: 'string', description: 'Short explanation for why this operation is needed.' },
};

export const derivedMetricDeclarationSchema = {
    type: 'object',
    properties: {
        metricName: { type: 'string' },
        formula: { type: 'string' },
        operation: { type: 'string' },
        sourceColumns: { type: 'array', items: { type: 'string' } },
        grain: { type: 'array', items: { type: 'string' } },
        units: { type: 'string' },
        assumptions: { type: 'array', items: { type: 'string' } },
        businessMeaning: { type: 'string' },
    },
    required: [
        'metricName',
        'formula',
        'operation',
        'sourceColumns',
        'grain',
        'units',
        'assumptions',
        'businessMeaning',
    ],
};

export const deriveOperandSchema = {
    type: 'object',
    properties: {
        kind: { type: 'string', enum: ['column', 'literal'] },
        column: { type: 'string' },
        value: {},
    },
    required: ['kind'],
};

const deriveMetricComponentSchema = {
    type: 'object',
    properties: {
        operator: { type: 'string', enum: ['add', 'subtract'] },
        matchAny: {
            type: 'array',
            minItems: 1,
            items: { type: 'string' },
        },
        valueTransform: { type: 'string', enum: ['raw', 'absolute'] },
    },
    required: ['operator', 'matchAny'],
};

export const deriveMetricByLabelFormulaSchema = {
    anyOf: [
        {
            type: 'object',
            properties: {
                kind: { type: 'string', enum: ['linear_combination'] },
                components: {
                    type: 'array',
                    minItems: 1,
                    items: deriveMetricComponentSchema,
                },
            },
            required: ['kind', 'components'],
        },
        {
            type: 'object',
            properties: {
                kind: { type: 'string', enum: ['ratio'] },
                numerator: {
                    type: 'array',
                    minItems: 1,
                    items: deriveMetricComponentSchema,
                },
                denominator: {
                    type: 'array',
                    minItems: 1,
                    items: deriveMetricComponentSchema,
                },
                scale: { type: 'number' },
            },
            required: ['kind', 'numerator', 'denominator'],
        },
    ],
};

export const filterPredicateSchema = {
    type: 'object',
    properties: {
        column: { type: 'string', minLength: 1 },
        operator: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'contains', 'starts_with', 'ends_with', 'in', 'is_null', 'not_null'] },
        value: {},
    },
    required: ['column', 'operator'],
};

export const filterPredicateGroupSchema = {
    type: 'object',
    properties: {
        predicates: {
            type: 'array',
            items: filterPredicateSchema,
        },
    },
    required: ['predicates'],
};

export const filterRowsOperationSchema = {
    type: 'object',
    properties: {
        ...dataOperationBaseSchema,
        type: { type: 'string', enum: ['filter_rows'] },
        predicates: {
            type: 'array',
            items: filterPredicateSchema,
        },
        groups: {
            type: 'array',
            description: 'Optional OR groups. Each group is AND-only internally; the overall result matches if any group matches.',
            items: filterPredicateGroupSchema,
        },
    },
    required: ['id', 'type', 'reason'],
    anyOf: [{ required: ['predicates'] }, { required: ['groups'] }],
};

export const dropRowsByConditionOperationSchema = {
    type: 'object',
    properties: {
        ...dataOperationBaseSchema,
        type: { type: 'string', enum: ['drop_rows_by_condition'] },
        predicates: {
            type: 'array',
            items: filterPredicateSchema,
        },
        groups: {
            type: 'array',
            description: 'Optional OR groups. Each group is AND-only internally; matching rows will be removed.',
            items: filterPredicateGroupSchema,
        },
    },
    required: ['id', 'type', 'reason'],
    anyOf: [{ required: ['predicates'] }, { required: ['groups'] }],
};

export const createOperationSchema = (type: DataOperationType, extra: Record<string, unknown>, requiredFields: string[]) => ({
    type: 'object',
    properties: {
        ...dataOperationBaseSchema,
        type: { type: 'string', enum: [type] },
        ...extra,
    },
    required: ['id', 'type', 'reason', ...requiredFields],
});

export const unpivotLabelMappingSchema = {
    type: 'object',
    properties: {
        sourceColumn: { type: 'string' },
        label: {},
    },
    required: ['sourceColumn', 'label'],
};

export const unpivotRowClassMappingSchema = {
    type: 'object',
    properties: {
        sourceRowIndex: { type: 'integer' },
        rowClass: { type: 'string' },
    },
    required: ['sourceRowIndex', 'rowClass'],
};

export const unpivotLabelColumnSchema = {
    type: 'object',
    properties: {
        outputColumn: { type: 'string' },
        mappings: {
            type: 'array',
            items: unpivotLabelMappingSchema,
        },
    },
    required: ['outputColumn', 'mappings'],
};

export const unpivotHierarchyDepthMappingSchema = {
    type: 'object',
    properties: {
        sourceRowIndex: { type: 'integer' },
        depth: { type: 'integer' },
    },
    required: ['sourceRowIndex', 'depth'],
};
