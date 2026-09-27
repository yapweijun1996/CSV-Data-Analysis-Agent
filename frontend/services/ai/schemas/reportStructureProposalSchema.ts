export const reportStructureProposalSchema = {
    type: 'object',
    properties: {
        purpose: {
            type: 'object',
            properties: {
                summary: { type: 'string' },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['summary', 'confidence'],
        },
        grain: {
            type: 'object',
            properties: {
                columns: {
                    type: 'array',
                    maxItems: 12,
                    items: { type: 'string' },
                },
                description: { type: 'string' },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['columns', 'description', 'confidence'],
        },
        fields: {
            type: 'array',
            maxItems: 96,
            items: {
                type: 'object',
                properties: {
                    columnName: { type: 'string' },
                    role: {
                        type: 'string',
                        enum: ['grain', 'metric', 'time_dimension', 'identifier', 'descriptor', 'helper', 'unknown'],
                    },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                    reasoning: { type: 'string' },
                },
                required: ['columnName', 'role', 'confidence', 'reasoning'],
            },
        },
        pivot: {
            type: 'object',
            properties: {
                shape: {
                    type: 'string',
                    enum: ['row_table', 'wide_pivot', 'statement_table', 'unknown'],
                },
                dimensionColumns: {
                    type: 'array',
                    maxItems: 24,
                    items: { type: 'string' },
                },
                measureColumns: {
                    type: 'array',
                    maxItems: 48,
                    items: { type: 'string' },
                },
                labelColumns: {
                    type: 'array',
                    maxItems: 24,
                    items: { type: 'string' },
                },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['shape', 'dimensionColumns', 'measureColumns', 'labelColumns', 'confidence'],
        },
        bodyRowRoles: {
            type: 'array',
            maxItems: 48,
            items: {
                type: 'object',
                properties: {
                    rowIndex: {
                        type: 'integer',
                        minimum: 0,
                    },
                    role: {
                        type: 'string',
                        enum: ['title', 'parameter', 'header', 'detail', 'group_header', 'subtotal', 'summary', 'note', 'footer', 'blank', 'unknown'],
                    },
                    confidence: {
                        type: 'number',
                        minimum: 0,
                        maximum: 1,
                    },
                    notes: {
                        type: 'array',
                        maxItems: 3,
                        items: { type: 'string' },
                    },
                },
                required: ['rowIndex', 'role', 'confidence'],
            },
        },
        carryForwardColumns: {
            type: 'array',
            maxItems: 8,
            items: { type: 'string' },
        },
        sectionLabelColumns: {
            type: 'array',
            maxItems: 8,
            items: { type: 'string' },
        },
        detailInclusionRoles: {
            type: 'array',
            maxItems: 4,
            items: {
                type: 'string',
                enum: ['detail', 'group_header', 'subtotal', 'note', 'unknown'],
            },
        },
        confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
        },
        reasoning: {
            type: 'string',
        },
    },
    required: [
        'purpose',
        'grain',
        'fields',
        'pivot',
        'bodyRowRoles',
        'carryForwardColumns',
        'sectionLabelColumns',
        'detailInclusionRoles',
        'confidence',
        'reasoning',
    ],
} as const;
