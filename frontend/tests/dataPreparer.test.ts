// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataPreparationPlan, Settings } from '../types';
import { generateDataPreparationPlan, validateDataPreparationPlan } from '../services/ai/dataPreparer';
import { createTestSettings } from './testSettings';
import {
    dataPreparationProviderSchema,
    dataPreparationSchema,
    getDataPreparationProviderSchema,
} from '../services/ai/schemas/dataSchemas';
import { createHierarchicalStatementCase } from './reportShapeFixtures/cases';

const {
    createProviderModelMock,
    generateTextMock,
    jsonSchemaMock,
    outputObjectMock,
} = vi.hoisted(() => ({
    createProviderModelMock: vi.fn(() => ({ model: { provider: 'google', modelId: 'gemini-3-flash-preview' } })),
    generateTextMock: vi.fn(),
    jsonSchemaMock: vi.fn((schema: unknown) => schema),
    outputObjectMock: vi.fn((options: unknown) => options),
}));

vi.mock('ai', () => ({
    generateText: generateTextMock,
    streamText: vi.fn((...args: unknown[]) => {
        const resultPromise = generateTextMock(...args);
        return {
            fullStream: (async function* () {})(),
            text: resultPromise.then((r: any) => r?.text ?? ''),
            finishReason: Promise.resolve('stop'),
            output: resultPromise.then((r: any) => r?.output ?? undefined),
        };
    }),
    Output: {
        object: outputObjectMock,
    },
    jsonSchema: jsonSchemaMock,
}));

vi.mock('../services/ai/providerConfig', () => ({
    createProviderModel: createProviderModelMock,
    isProviderConfigured: vi.fn(() => false),
    validateProviderHealth: () => Promise.resolve({ status: 'healthy', checkedAt: new Date().toISOString() }),
    invalidateProviderHealthCache: () => {},
}));

const baselineColumns = [
    { name: 'Date', type: 'categorical' as const },
    { name: 'Document Number', type: 'categorical' as const },
    { name: 'Qty', type: 'numerical' as const },
];

const settings: Settings = createTestSettings({
    provider: 'google',
    geminiApiKey: 'test-key',
    simpleModel: 'gemini-3-flash-preview',
    complexModel: 'gemini-3-flash-preview',
    language: 'English',
    autoConfirmGoal: true,
});

const buildWideColumns = () => [
    ...Array.from({ length: 20 }, (_value, index) => ({ name: `100${index.toString().padStart(2, '0')}`, type: 'numerical' as const })),
    { name: 'Code', type: 'numerical' as const },
    { name: 'Description', type: 'categorical' as const },
    { name: 'Total', type: 'numerical' as const },
];

const buildWideRows = () => [
    Object.fromEntries([
        ...Array.from({ length: 20 }, (_value, index) => [`100${index.toString().padStart(2, '0')}`, `${index + 1}.00`]),
        ['Code', 'REV-001'],
        ['Description', 'Construction Revenue'],
        ['Total', '22,191,666.85'],
    ]),
    Object.fromEntries([
        ...Array.from({ length: 20 }, (_value, index) => [`100${index.toString().padStart(2, '0')}`, `${index + 2}.00`]),
        ['Code', 'REV-002'],
        ['Description', 'Service Revenue'],
        ['Total', '22,191,666.85'],
    ]),
    Object.fromEntries([
        ...Array.from({ length: 20 }, (_value, index) => [`100${index.toString().padStart(2, '0')}`, `${index + 3}.00`]),
        ['Code', ''],
        ['Description', 'Net Sales / Revenue'],
        ['Total', '22,191,666.85'],
    ]),
];

const buildHierarchicalWideRows = () => [
    Object.fromEntries([
        ...Array.from({ length: 20 }, (_value, index) => [`100${index.toString().padStart(2, '0')}`, `${index + 1}.00`]),
        ['Code', '501001'],
        ['Description', 'CONSTRUCTION CONTRACT REVENUE'],
        ['Total', '22,191,666.85'],
    ]),
    Object.fromEntries([
        ...Array.from({ length: 20 }, (_value, index) => [`100${index.toString().padStart(2, '0')}`, `${index + 2}.00`]),
        ['Code', '50'],
        ['Description', 'Revenue'],
        ['Total', '22,191,666.85'],
    ]),
    Object.fromEntries([
        ...Array.from({ length: 20 }, (_value, index) => [`100${index.toString().padStart(2, '0')}`, `${index + 3}.00`]),
        ['Code', ''],
        ['Description', 'Net Sales / Revenue'],
        ['Total', '22,191,666.85'],
    ]),
];

const buildRepeatedBundleRows = () => [
    {
        _unnamed_column_1: '1.',
        Date: '01-01-2010',
        Number: 'SOM1002',
        Customer: 'Allylink Pte Ltd',
        'Sales Exec': 'A141',
        'Item Cnt': '1',
        'Stock Code': '0.5MM 4B',
        Description: 'SS PLATE AISI304 0.5MM 4B/PVC 4 X 8',
        'SO Qty': '2000.00',
        'Bal Qnty': '2000.00',
        UOM: 'PCS',
        Date_2: '',
        Number_2: '',
        Qty: '',
        UOM_2: '',
        Date_3: '31-12-2010',
        Number_3: 'POM1265',
        Qty_2: '2000.00',
        UOM_3: 'PCS',
        Date_4: '01-01-2010',
        Number_4: 'DOM1001',
        Qty_3: '2000.00',
        UOM_4: 'PCS',
    },
    {
        _unnamed_column_1: '',
        Date: '',
        Number: '',
        Customer: '',
        'Sales Exec': '',
        'Item Cnt': '2',
        'Stock Code': '1810-T0036',
        Description: 'MAPLE VENEER 2 X 8',
        'SO Qty': '25.00',
        'Bal Qnty': '25.00',
        UOM: 'PCS',
        Date_2: '',
        Number_2: '',
        Qty: '',
        UOM_2: '',
        Date_3: '31-12-2010',
        Number_3: 'POM1265',
        Qty_2: '25.00',
        UOM_3: 'PCS',
        Date_4: '01-01-2010',
        Number_4: 'DOM1001',
        Qty_3: '25.00',
        UOM_4: 'PCS',
    },
    {
        _unnamed_column_1: '',
        Date: '',
        Number: '',
        Customer: '',
        'Sales Exec': '',
        'Item Cnt': '',
        'Stock Code': '',
        Description: 'Subtotal',
        'SO Qty': '2025.00',
        'Bal Qnty': '2025.00',
        UOM: 'PCS',
        Date_2: '',
        Number_2: '',
        Qty: '',
        UOM_2: '',
        Date_3: '',
        Number_3: '',
        Qty_2: '',
        UOM_3: '',
        Date_4: '',
        Number_4: '',
        Qty_3: '',
        UOM_4: '',
    },
];

const buildRepeatedBundleCsvData = () => ({
    fileName: 'mini-repeated-bundle.csv',
    data: buildRepeatedBundleRows() as never,
    metadataRows: [],
    headerLayers: [[
        '', '', '', '', '', '', '', '', '', '', '',
        'PO', 'PO', 'PO', 'PO',
        'DO', 'DO', 'DO', 'DO',
        'INV', 'INV', 'INV', 'INV',
    ]],
    summaryRows: [],
    headerDepth: 2,
});

const buildRepeatedBundleProfiles = () => [
    { name: '_unnamed_column_1', type: 'categorical' as const },
    { name: 'Date', type: 'numerical' as const },
    { name: 'Number', type: 'categorical' as const },
    { name: 'Customer', type: 'categorical' as const },
    { name: 'Sales Exec', type: 'categorical' as const },
    { name: 'Item Cnt', type: 'numerical' as const },
    { name: 'Stock Code', type: 'categorical' as const },
    { name: 'Description', type: 'categorical' as const },
    { name: 'SO Qty', type: 'numerical' as const },
    { name: 'Bal Qnty', type: 'numerical' as const },
    { name: 'UOM', type: 'categorical' as const },
    { name: 'Date_2', type: 'numerical' as const },
    { name: 'Number_2', type: 'categorical' as const },
    { name: 'Qty', type: 'numerical' as const },
    { name: 'UOM_2', type: 'categorical' as const },
    { name: 'Date_3', type: 'numerical' as const },
    { name: 'Number_3', type: 'categorical' as const },
    { name: 'Qty_2', type: 'numerical' as const },
    { name: 'UOM_3', type: 'categorical' as const },
    { name: 'Date_4', type: 'numerical' as const },
    { name: 'Number_4', type: 'categorical' as const },
    { name: 'Qty_3', type: 'numerical' as const },
    { name: 'UOM_4', type: 'categorical' as const },
];

describe('validateDataPreparationPlan', () => {
    it('marks mutation-claiming zero-op plans as inconsistent', () => {
        const plan: DataPreparationPlan = {
            explanation: 'Removed junk rows and casted Qty into numbers.',
            operations: [],
            outputColumns: baselineColumns,
            planStatus: 'schema_only',
            consistencyIssues: [],
        };

        const validated = validateDataPreparationPlan(plan, baselineColumns);

        expect(validated.planStatus).toBe('inconsistent');
        expect(validated.consistencyIssues).toContain('Schema-only plan explanation claims executed mutations despite having zero operations.');
    });

    it('catches gerund-form mutation claims in zero-op explanations', () => {
        const plan: DataPreparationPlan = {
            explanation: 'Removing junk rows and converting Qty into numbers while standardizing dates.',
            operations: [],
            outputColumns: baselineColumns,
            planStatus: 'schema_only',
            consistencyIssues: [],
        };

        const validated = validateDataPreparationPlan(plan, baselineColumns);

        expect(validated.planStatus).toBe('inconsistent');
        expect(validated.consistencyIssues).toContain('Schema-only plan explanation claims executed mutations despite having zero operations.');
    });

    it('keeps honest zero-op type-refinement plans as schema_only', () => {
        const plan: DataPreparationPlan = {
            explanation: 'Refined the schema so Date is typed as date while keeping the prepared rows unchanged.',
            operations: [],
            outputColumns: [
                { name: 'Date', type: 'date' },
                { name: 'Document Number', type: 'categorical' },
                { name: 'Qty', type: 'numerical' },
            ],
            planStatus: 'schema_only',
            consistencyIssues: [],
        };

        const validated = validateDataPreparationPlan(plan, baselineColumns);

        expect(validated.planStatus).toBe('schema_only');
        expect(validated.consistencyIssues).toEqual([]);
    });

    it('restores omitted zero-op columns when the explanation does not claim mutations', () => {
        const plan: DataPreparationPlan = {
            explanation: 'Prepared rows remain unchanged while refining the schema for analysis.',
            operations: [],
            outputColumns: [
                { name: 'Date', type: 'date' },
                { name: 'Qty', type: 'numerical' },
            ],
            planStatus: 'schema_only',
            consistencyIssues: [],
        };

        const validated = validateDataPreparationPlan(plan, baselineColumns);

        expect(validated.planStatus).toBe('schema_only');
        expect(validated.consistencyIssues).toEqual([]);
        expect(validated.outputColumns).toEqual([
            { name: 'Date', type: 'date' },
            { name: 'Document Number', type: 'categorical' },
            { name: 'Qty', type: 'numerical' },
        ]);
    });
});

describe('generateDataPreparationPlan', () => {
    beforeEach(() => {
        generateTextMock.mockReset();
        createProviderModelMock.mockReset().mockImplementation(() => ({
            model: { provider: 'google', modelId: 'gemini-3-flash-preview' },
        }));
        jsonSchemaMock.mockReset().mockImplementation((schema: unknown) => schema);
        outputObjectMock.mockReset().mockImplementation((options: unknown) => options);
    });

    it('normalizes placeholder dimension values to null without touching code-like columns', async () => {
        generateTextMock.mockResolvedValueOnce({
            output: {
                explanation: 'Prepared rows remain unchanged while refining schema types.',
                operations: [],
                outputColumns: [
                    { name: 'BRAND', type: 'categorical' },
                    { name: 'STOCK CODE', type: 'categorical' },
                    { name: 'AMOUNT (SGD)', type: 'currency' },
                ],
                planStatus: 'schema_only',
                consistencyIssues: [],
            },
        });

        const result = await generateDataPreparationPlan(
            [
                { name: 'BRAND', type: 'categorical', uniqueValues: 4, missingPercentage: 0 },
                { name: 'STOCK CODE', type: 'categorical', uniqueValues: 4, missingPercentage: 0 },
                { name: 'AMOUNT (SGD)', type: 'currency', missingPercentage: 0, hasFormattedNumbers: true },
            ],
            [
                { BRAND: "'-", 'STOCK CODE': 'AA-001', 'AMOUNT (SGD)': '1,200.00' },
                { BRAND: 'Bosch', 'STOCK CODE': "'-", 'AMOUNT (SGD)': '950.00' },
                { BRAND: 'Denso', 'STOCK CODE': 'AA-003', 'AMOUNT (SGD)': '0.00' },
                { BRAND: 'Magna', 'STOCK CODE': 'AA-004', 'AMOUNT (SGD)': '50.00' },
            ],
            settings,
            undefined,
            undefined,
            {
                fileName: 'sales.csv',
                data: [
                    { BRAND: "'-", 'STOCK CODE': 'AA-001', 'AMOUNT (SGD)': '1,200.00' },
                    { BRAND: 'Bosch', 'STOCK CODE': "'-", 'AMOUNT (SGD)': '950.00' },
                    { BRAND: 'Denso', 'STOCK CODE': 'AA-003', 'AMOUNT (SGD)': '0.00' },
                    { BRAND: 'Magna', 'STOCK CODE': 'AA-004', 'AMOUNT (SGD)': '50.00' },
                ] as never,
                metadataRows: [],
                summaryRows: [],
                headerDepth: 1,
            } as never,
        );

        expect(result.operations[0]).toMatchObject({
            type: 'normalize_empty_values',
            columns: ['BRAND'],
        });
        expect(result.operations.some(operation => operation.type === 'cast_column' && 'column' in operation && operation.column === 'AMOUNT (SGD)')).toBe(true);
        expect(result.normalizedPlaceholderColumns).toEqual(['BRAND']);
        expect(result.numericStringNormalizedColumns).toEqual(['AMOUNT (SGD)']);
    });

    it('emits placeholder and numeric-string telemetry for deterministic sql-readiness normalization', async () => {
        const telemetryEvents: Array<{ responseType: string; detail?: string; meta?: Record<string, unknown> }> = [];

        generateTextMock.mockResolvedValueOnce({
            output: {
                explanation: 'Prepared rows remain unchanged while refining schema types.',
                operations: [],
                outputColumns: [
                    { name: 'BRAND', type: 'categorical' },
                    { name: 'QTY SOLD', type: 'numerical' },
                ],
                planStatus: 'schema_only',
                consistencyIssues: [],
            },
        });

        await generateDataPreparationPlan(
            [
                { name: 'BRAND', type: 'categorical', uniqueValues: 3, missingPercentage: 0 },
                { name: 'QTY SOLD', type: 'numerical', missingPercentage: 0, hasFormattedNumbers: true },
            ],
            [
                { BRAND: "'-", 'QTY SOLD': '1,200.00' },
                { BRAND: 'Bosch', 'QTY SOLD': '950.00' },
                { BRAND: 'Denso', 'QTY SOLD': '50.00' },
            ],
            settings,
            undefined,
            {
                logTelemetryEvent: event => {
                    telemetryEvents.push({
                        responseType: event.responseType,
                        detail: event.detail,
                        meta: event.meta,
                    });
                },
            },
        );

        expect(telemetryEvents.some(event => event.responseType === 'data_prep_placeholder_normalized')).toBe(true);
        expect(telemetryEvents.some(event => event.responseType === 'data_prep_numeric_string_casted')).toBe(true);
    });

    it('extends existing normalize_empty_values markers so quote-prefixed placeholders are not missed', async () => {
        generateTextMock.mockResolvedValueOnce({
            output: {
                explanation: 'Normalize obvious empties and keep the remaining structure.',
                operations: [
                    {
                        id: 'ai_normalize_brand',
                        type: 'normalize_empty_values',
                        reason: 'Normalize empty-looking brand labels.',
                        columns: ['BRAND'],
                        emptyMarkers: ['-'],
                    },
                ],
                outputColumns: [
                    { name: 'BRAND', type: 'categorical' },
                    { name: 'QTY SOLD', type: 'numerical' },
                ],
                planStatus: 'operations',
                consistencyIssues: [],
            },
        });

        const result = await generateDataPreparationPlan(
            [
                { name: 'BRAND', type: 'categorical', uniqueValues: 4, missingPercentage: 0 },
                { name: 'QTY SOLD', type: 'numerical', missingPercentage: 0, hasFormattedNumbers: true },
            ],
            [
                { BRAND: "'-", 'QTY SOLD': '1,200.00' },
                { BRAND: 'Bosch', 'QTY SOLD': '950.00' },
                { BRAND: 'Denso', 'QTY SOLD': '50.00' },
                { BRAND: 'Magna', 'QTY SOLD': '25.00' },
            ],
            settings,
        );

        const normalizeOperation = result.operations.find(operation => operation.type === 'normalize_empty_values');
        expect(normalizeOperation).toBeTruthy();
        expect(normalizeOperation && 'emptyMarkers' in normalizeOperation ? normalizeOperation.emptyMarkers : []).toEqual(
            expect.arrayContaining(["'-", '-', '--']),
        );
        expect(result.normalizedPlaceholderColumns).toEqual(['BRAND']);
    });

    it('rewrites secondary header aliases onto actual staged column names before executing the plan', async () => {
        generateTextMock.mockResolvedValueOnce({
            output: {
                explanation: 'Cast the amount measures into numeric columns.',
                operations: [
                    {
                        id: 'cast_total_sales',
                        type: 'cast_column',
                        reason: 'Convert total sales to numeric.',
                        column: 'TOTAL SALES',
                        targetType: 'number',
                    },
                ],
                outputColumns: [
                    { name: 'TOTAL SALES', type: 'numerical' },
                ],
                planStatus: 'operations',
                consistencyIssues: [],
            },
        });

        const result = await generateDataPreparationPlan(
            [
                { name: 'CUSTOMER ORDER DATE', type: 'categorical' },
                { name: 'AMOUNT(USD)', type: 'currency', hasFormattedNumbers: true },
                { name: '_unnamed_column_7', type: 'numerical', hasFormattedNumbers: true },
            ],
            [
                { 'CUSTOMER ORDER DATE': '02/01/2010', 'AMOUNT(USD)': '2,300.0000', _unnamed_column_7: '6,900.00' },
                { 'CUSTOMER ORDER DATE': '03/01/2010', 'AMOUNT(USD)': '1,500.0000', _unnamed_column_7: '3,000.00' },
            ],
            settings,
            undefined,
            undefined,
            {
                fileName: 'order-take-in.csv',
                data: [
                    { 'CUSTOMER ORDER DATE': '02/01/2010', 'AMOUNT(USD)': '2,300.0000', _unnamed_column_7: '6,900.00' },
                    { 'CUSTOMER ORDER DATE': '03/01/2010', 'AMOUNT(USD)': '1,500.0000', _unnamed_column_7: '3,000.00' },
                ] as never,
                metadataRows: [],
                headerLayers: [[
                    '',
                    '',
                    'TOTAL SALES',
                ]],
                summaryRows: [],
                headerDepth: 2,
            } as never,
        );

        expect(result.operations.some(operation =>
            operation.type === 'cast_column' && 'column' in operation && operation.column === '_unnamed_column_7',
        )).toBe(true);
        expect(result.outputColumns[0]?.name).toBe('_unnamed_column_7');
    });

    it('prunes lossless operations that change stable numeric fingerprints before first-attempt execution', async () => {
        const telemetryEvents: Array<{ responseType: string; detail?: string; meta?: Record<string, unknown> }> = [];

        generateTextMock.mockResolvedValueOnce({
            output: {
                explanation: 'Normalize the amount column without changing business totals.',
                operations: [
                    {
                        id: 'replace_amount',
                        type: 'replace_values',
                        reason: 'Normalize amount values.',
                        column: 'Amount spent (SGD)',
                        replacements: [{ from: '100.00', to: '999.00' }],
                    },
                ],
                outputColumns: [
                    { name: 'Campaign', type: 'categorical' },
                    { name: 'Amount spent (SGD)', type: 'currency' },
                ],
                planStatus: 'operations',
                consistencyIssues: [],
            },
        });

        const result = await generateDataPreparationPlan(
            [
                { name: 'Campaign', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                { name: 'Amount spent (SGD)', type: 'currency', uniqueValues: 2, missingPercentage: 0 },
            ],
            [
                { Campaign: 'Search', 'Amount spent (SGD)': '100.00' },
                { Campaign: 'Display', 'Amount spent (SGD)': '250.00' },
            ],
            settings,
            undefined,
            {
                logTelemetryEvent: event => {
                    telemetryEvents.push({
                        responseType: event.responseType,
                        detail: event.detail,
                        meta: event.meta,
                    });
                },
            },
        );

        expect(result.operations).toEqual([]);
        expect(result.planStatus).toBe('schema_only');
        expect(telemetryEvents.map(event => event.responseType)).toContain('data_prep_lossless_op_pruned');
    });

    it('propagates AbortSignal to the provider call and stops on abort', async () => {
        const controller = new AbortController();
        generateTextMock.mockImplementationOnce(async ({ abortSignal }: { abortSignal?: AbortSignal }) => new Promise((_, reject) => {
            expect(abortSignal).toBe(controller.signal);
            abortSignal?.addEventListener('abort', () => reject(abortSignal.reason), { once: true });
            controller.abort(new DOMException('Cancelled the current agent run.', 'AbortError'));
        }));

        await expect(generateDataPreparationPlan(
            baselineColumns,
            [{ Date: '24-11-2025', 'Document Number': 'RCP-10001', Qty: '5.00' }],
            settings,
            undefined,
            undefined,
            undefined,
            undefined,
            { abortSignal: controller.signal },
        )).rejects.toMatchObject({
            name: 'AbortError',
        });

        expect(generateTextMock).toHaveBeenCalledTimes(1);
        expect(generateTextMock.mock.calls[0]?.[0]).toMatchObject({
            abortSignal: controller.signal,
        });
    });

    it('canonicalizes inconsistent zero-op plans into stable schema-only output without a retry', async () => {
        generateTextMock.mockResolvedValueOnce({
            output: {
                explanation: 'Removing the index column and converting Qty into numbers.',
                operations: [],
                outputColumns: [
                    { name: 'Date', type: 'date' },
                    { name: 'Qty', type: 'numerical' },
                ],
                planStatus: 'schema_only',
                consistencyIssues: [],
            },
        });

        const result = await generateDataPreparationPlan(
            baselineColumns,
            [{ Date: '24-11-2025', 'Document Number': 'RCP-10001', Qty: '5.00' }],
            settings,
        );

        expect(generateTextMock).toHaveBeenCalledTimes(1);
        expect(result.planStatus).toBe('schema_only');
        expect(result.consistencyIssues).toEqual([]);
        expect(result.explanation).toBe('Prepared rows remain unchanged while refining schema types for analysis.');
        expect(result.outputColumns).toEqual([
            { name: 'Date', type: 'date' },
            { name: 'Document Number', type: 'categorical' },
            { name: 'Qty', type: 'numerical' },
        ]);
    });

    it('sanitizes the Google response schema before requesting a structured data prep plan', async () => {
        generateTextMock.mockResolvedValueOnce({
            output: {
                explanation: 'Prepared rows remain unchanged; only schema types were refined.',
                operations: [],
                outputColumns: baselineColumns,
                planStatus: 'schema_only',
                consistencyIssues: [],
            },
        });

        await generateDataPreparationPlan(
            baselineColumns,
            [{ Date: '24-11-2025', 'Document Number': 'RCP-10001', Qty: '5.00' }],
            settings,
        );

        const schema = jsonSchemaMock.mock.calls[0]?.[0] as Record<string, unknown>;
        const operations = (schema.properties as Record<string, unknown>).operations as Record<string, unknown>;
        const operationItems = operations.items as Record<string, unknown>;
        const providerSchemaSize = JSON.stringify(dataPreparationProviderSchema).length;
        const fullSchemaSize = JSON.stringify(dataPreparationSchema).length;

        expect(operationItems.type).toBe('object');
        expect(operationItems.anyOf).toBeUndefined();
        expect(operationItems.oneOf).toBeUndefined();
        expect(operationItems.allOf).toBeUndefined();
        expect(Array.isArray(operationItems.required)).toBe(false);
        expect((operationItems.properties as Record<string, unknown>).predicates).toBeDefined();
        expect((operationItems.properties as Record<string, unknown>).groups).toBeDefined();
        expect(JSON.stringify(schema)).toContain('unpivot_columns');
        expect(JSON.stringify(schema)).not.toContain('derive_metric_by_label');
        expect(JSON.stringify(schema)).not.toContain('annotate_hierarchy');
        expect(JSON.stringify(schema)).not.toContain('derive_column');
        expect(providerSchemaSize).toBeLessThan(fullSchemaSize);
    });

    it('keeps the prompt compact and avoids the old duplicated long-form instructions', async () => {
        generateTextMock.mockResolvedValueOnce({
            output: {
                explanation: 'Prepared rows remain unchanged while refining schema types.',
                operations: [],
                outputColumns: baselineColumns,
                planStatus: 'schema_only',
                consistencyIssues: [],
            },
        });

        await generateDataPreparationPlan(
            baselineColumns,
            [{ Date: '24-11-2025', 'Document Number': 'RCP-10001', Qty: '5.00' }],
            settings,
        );

        const prompt = generateTextMock.mock.calls[0]?.[0].messages[1].content as string;

        expect(prompt).toContain('Allowed operations:');
        expect(prompt).toContain('Mostly-empty columns (>90% but <100%) remain in the schema unless an explicit operation removes them');
        expect(prompt).toContain('prepared rows remain unchanged');
        expect(prompt.match(/Return one concise deterministic data-preparation plan\./g)).toHaveLength(1);
        expect(prompt).not.toContain('Analyze the dataset and prepare a cleaning/transformation plan.');
        expect(prompt).not.toContain('Example: Reshaping and identifying types using deterministic operations');
        expect(prompt).not.toContain('1.  **Analyze**');
    });

    it('compresses wide-table samples into summaries plus a few representative rows', async () => {
        const wideColumns = buildWideColumns();
        const wideRows = buildWideRows();

        generateTextMock.mockResolvedValueOnce({
            output: {
                explanation: 'Prepared rows remain unchanged while refining schema types.',
                operations: [],
                outputColumns: wideColumns,
                planStatus: 'schema_only',
                consistencyIssues: [],
            },
        });

        await generateDataPreparationPlan(wideColumns, wideRows as never, settings);

        const prompt = generateTextMock.mock.calls[0]?.[0].messages[1].content as string;
        const schema = jsonSchemaMock.mock.calls[0]?.[0] as Record<string, unknown>;
        const operationItems = ((schema.properties as Record<string, unknown>).operations as Record<string, unknown>).items as Record<string, unknown>;
        const compactSchemaSize = JSON.stringify(getDataPreparationProviderSchema({ compactWideTable: true })).length;
        const defaultSchemaSize = JSON.stringify(dataPreparationProviderSchema).length;

        expect(prompt).toContain('Wide-table structure summary');
        expect(prompt).toContain('wide_table_hint=');
        expect(prompt).toContain('omitted_repeated_or_secondary_columns=');
        expect(prompt).toContain('SampleRole');
        expect(prompt).toContain('10000');
        expect(prompt).not.toContain('10010');
        expect(prompt).toContain('prefer `unpivot_columns`');
        expect(prompt).toContain('Do not cast or reference derived long-table columns such as Value before an explicit `unpivot_columns` step creates them.');
        expect(prompt).toContain('trim_whitespace, normalize_empty_values, cast_column, unpivot_columns');
        expect(operationItems.type).toBe('object');
        expect((operationItems.properties as Record<string, unknown>).type).toEqual({
            type: 'string',
            enum: [
                'drop_rows_by_index',
                'drop_rows_by_condition',
                'drop_blank_rows',
                'promote_header_row',
                'rename_columns',
                'drop_columns',
                'trim_whitespace',
                'normalize_empty_values',
                'cast_column',
                'unpivot_columns',
            ],
        });
        expect((operationItems.properties as Record<string, unknown>).targetColumns).toBeUndefined();
        expect((operationItems.properties as Record<string, unknown>).strategy).toBeUndefined();
        expect(compactSchemaSize).toBeLessThan(defaultSchemaSize);
    });

    it('tells the model to preserve raw header label layers for wide-table unpivot plans', async () => {
        const wideColumns = buildWideColumns();
        const wideRows = buildWideRows();

        generateTextMock.mockResolvedValueOnce({
            output: {
                explanation: 'Prepared rows remain unchanged while refining schema types.',
                operations: [],
                outputColumns: wideColumns,
                planStatus: 'schema_only',
                consistencyIssues: [],
            },
        });

        await generateDataPreparationPlan(
            wideColumns,
            wideRows as never,
            settings,
            undefined,
            undefined,
            {
                fileName: 'multi-header.csv',
                data: wideRows as never,
                headerLayers: [
                    ['', '', 'North', 'North', 'South', 'South'],
                    ['', '', 'Alpha', 'Beta', 'Gamma', 'Delta'],
                ],
            } as never,
        );

        const prompt = generateTextMock.mock.calls[0]?.[0].messages[1].content as string;
        expect(prompt).toContain('Preserved raw header layers:');
        expect(prompt).toContain('Preserved header label layers: 2');
        expect(prompt).toContain('you MUST preserve all of them with `labelColumns` entries such as `SeriesLabelL1` through `SeriesLabelL2`');
        expect(prompt).toContain('Do not collapse multi-header labels into SeriesKey alone');
    });

    it('retries wide-table plans that cast Value before unpivot emits it', async () => {
        const wideColumns = buildWideColumns();
        const wideRows = buildWideRows();

        generateTextMock
            .mockResolvedValueOnce({
                output: {
                    explanation: 'Reshape the report and cast Value for analysis.',
                    operations: [
                        {
                            id: 'cast_value_column',
                            type: 'cast_column',
                            reason: 'Cast the long-table values.',
                            column: 'Value',
                            targetType: 'number',
                        },
                    ],
                    outputColumns: [
                        { name: 'Code', type: 'numerical' },
                        { name: 'Description', type: 'categorical' },
                        { name: 'Value', type: 'numerical' },
                    ],
                    planStatus: 'operations',
                    consistencyIssues: [],
                },
            })
            .mockResolvedValueOnce({
                output: {
                    explanation: 'Unpivot the repeated metric columns into a long table and then cast the emitted Value column.',
                    operations: [
                        {
                            id: 'reshape_metrics',
                            type: 'unpivot_columns',
                            reason: 'Convert the repeated numeric matrix into long rows.',
                            sourceColumns: ['10000', '10001'],
                            keyColumn: 'SeriesKey',
                            valueColumn: 'Value',
                            keepColumns: ['Code', 'Description'],
                            sourceColumnNameColumn: 'SourceColumnName',
                            sourceRowIndexColumn: 'SourceRowIndex',
                            rowClassColumn: 'RowClass',
                            hierarchyDepthColumn: 'HierarchyDepth',
                            hierarchyDepthMappings: [
                                { sourceRowIndex: 0, depth: 1 },
                                { sourceRowIndex: 1, depth: 0 },
                            ],
                        },
                        {
                            id: 'cast_value_column',
                            type: 'cast_column',
                            reason: 'Convert emitted Value entries to numbers.',
                            column: 'Value',
                            targetType: 'number',
                        },
                    ],
                    outputColumns: [
                        { name: 'Code', type: 'numerical' },
                        { name: 'Description', type: 'categorical' },
                        { name: 'SeriesKey', type: 'categorical' },
                        { name: 'Value', type: 'numerical' },
                        { name: 'SourceColumnName', type: 'categorical' },
                        { name: 'SourceRowIndex', type: 'numerical' },
                        { name: 'RowClass', type: 'categorical' },
                        { name: 'HierarchyDepth', type: 'numerical' },
                    ],
                    planStatus: 'operations',
                    consistencyIssues: [],
                },
            });

        const result = await generateDataPreparationPlan(wideColumns, wideRows as never, settings);

        expect(generateTextMock).toHaveBeenCalledTimes(2);
        expect(result.planStatus).toBe('operations');
        const retryPrompt = generateTextMock.mock.calls[1]?.[0].messages[1].content as string;
        expect(retryPrompt).toContain('wide_table_value_requires_unpivot=true');
        expect(retryPrompt).toContain('Do not assume derived long-table columns such as Value, SeriesKey, or SeriesLabelL* already exist.');
        expect(retryPrompt).toContain('If you need Value, first emit it with unpivot_columns using valueColumn="Value", then cast it in a later operation.');
    });

    it('emits first-attempt failure and self-correction telemetry when recovery succeeds on retry', async () => {
        const wideColumns = buildWideColumns();
        const wideRows = buildWideRows();
        const telemetryEvents: Array<{ responseType: string; detail?: string }> = [];

        generateTextMock
            .mockResolvedValueOnce({
                output: {
                    explanation: 'Reshape and cast Value immediately.',
                    operations: [
                        {
                            id: 'cast_value_column',
                            type: 'cast_column',
                            reason: 'Cast the long-table values.',
                            column: 'Value',
                            targetType: 'number',
                        },
                    ],
                    outputColumns: wideColumns,
                    planStatus: 'operations',
                    consistencyIssues: [],
                },
            })
            .mockResolvedValueOnce({
                output: {
                    explanation: 'Unpivot the repeated metric columns into a long table and then cast the emitted Value column.',
                    operations: [
                        {
                            id: 'reshape_metrics',
                            type: 'unpivot_columns',
                            reason: 'Convert the repeated numeric matrix into long rows.',
                            sourceColumns: ['10000', '10001'],
                            keyColumn: 'SeriesKey',
                            valueColumn: 'Value',
                            keepColumns: ['Code', 'Description'],
                            sourceColumnNameColumn: 'SourceColumnName',
                            sourceRowIndexColumn: 'SourceRowIndex',
                            rowClassColumn: 'RowClass',
                            hierarchyDepthColumn: 'HierarchyDepth',
                            hierarchyDepthMappings: [
                                { sourceRowIndex: 0, depth: 1 },
                                { sourceRowIndex: 1, depth: 0 },
                                { sourceRowIndex: 2, depth: 0 },
                            ],
                        },
                        {
                            id: 'cast_value_column',
                            type: 'cast_column',
                            reason: 'Convert emitted Value entries to numbers.',
                            column: 'Value',
                            targetType: 'number',
                        },
                    ],
                    outputColumns: wideColumns,
                    planStatus: 'operations',
                    consistencyIssues: [],
                },
            });

        await generateDataPreparationPlan(
            wideColumns,
            wideRows as never,
            settings,
            undefined,
            {
                logTelemetryEvent: event => telemetryEvents.push({
                    responseType: event.responseType,
                    detail: event.detail,
                }),
            },
        );

        expect(telemetryEvents.map(event => event.responseType)).toContain('data_prep_first_attempt_failed');
        expect(telemetryEvents.map(event => event.responseType)).toContain('data_prep_self_correction_used');
    });

    it('falls back to deterministic cleanup when wide-table planning still fails on the final retry', async () => {
        const wideColumns = buildWideColumns();
        const wideRows = buildWideRows();
        const telemetryEvents: Array<{ responseType: string; detail?: string }> = [];

        const invalidWidePlan = {
            output: {
                explanation: 'Cast the Value column before reshaping.',
                operations: [
                    {
                        id: 'cast_value_first',
                        type: 'cast_column',
                        reason: 'Convert the Value column to numbers first.',
                        column: 'Value',
                        targetType: 'number',
                    },
                ],
                outputColumns: wideColumns,
                planStatus: 'operations',
                consistencyIssues: [],
            },
        };
        generateTextMock
            .mockResolvedValueOnce(invalidWidePlan)
            .mockResolvedValueOnce(invalidWidePlan);

        const result = await generateDataPreparationPlan(
            wideColumns,
            wideRows as never,
            settings,
            undefined,
            {
                logTelemetryEvent: event => telemetryEvents.push({
                    responseType: event.responseType,
                    detail: event.detail,
                }),
            },
            {
                fileName: 'wide-report.csv',
                data: wideRows as never,
                metadataRows: [],
                headerLayers: [['', 'Budget', 'Budget']],
                summaryRows: [],
                headerDepth: 2,
            },
        );

        expect(generateTextMock).toHaveBeenCalledTimes(2);
        expect(result.planStatus).toBe('operations');
        expect(result.operations.length).toBeGreaterThan(0);
        expect(result.operations.some(operation => operation.type === 'cast_column')).toBe(false);
        expect(telemetryEvents.map(event => event.responseType)).toContain('data_prep_deterministic_fallback_used');
    });

    it('keeps strict single-call mode bounded while still allowing deterministic wide-plan salvage', async () => {
        const wideColumns = buildWideColumns();
        const wideRows = buildWideRows();
        const telemetryEvents: Array<{ responseType: string; detail?: string }> = [];

        generateTextMock.mockResolvedValueOnce({
            output: {
                explanation: 'Cast the Value column before reshaping.',
                operations: [
                    {
                        id: 'cast_value_first',
                        type: 'cast_column',
                        reason: 'Convert the Value column to numbers first.',
                        column: 'Value',
                        targetType: 'number',
                    },
                ],
                outputColumns: wideColumns,
                planStatus: 'operations',
                consistencyIssues: [],
            },
        });

        const result = await generateDataPreparationPlan(
            wideColumns,
            wideRows as never,
            settings,
            undefined,
            {
                logTelemetryEvent: event => telemetryEvents.push({
                    responseType: event.responseType,
                    detail: event.detail,
                }),
            },
            {
                fileName: 'wide-report.csv',
                data: wideRows as never,
                metadataRows: [],
                headerLayers: [['', 'Budget', 'Budget']],
                summaryRows: [],
                headerDepth: 2,
            } as never,
            undefined,
            {
                maxAttempts: 1,
                allowInternalRetry: false,
                allowDeterministicFallback: false,
                allowHierarchyAnnotationFallback: false,
            },
        );

        expect(generateTextMock).toHaveBeenCalledTimes(1);
        expect(result.planStatus).toBe('operations');
        expect(result.operations.some(operation => operation.type === 'unpivot_columns' || operation.type === 'annotate_hierarchy')).toBe(true);
        expect(telemetryEvents.map(event => event.responseType)).not.toContain('data_prep_first_attempt_failed');
        expect(telemetryEvents.map(event => event.responseType)).not.toContain('data_prep_self_correction_used');
        expect(telemetryEvents.map(event => event.responseType)).not.toContain('data_prep_deterministic_fallback_used');
        expect(telemetryEvents.map(event => event.responseType)).toContain('data_prep_plan_salvaged_wide_fallback');
    });

    it('does not require hierarchy depth for wide reports that only have weak prefix hierarchy hints', async () => {
        const wideColumns = buildWideColumns();
        const wideRows = buildHierarchicalWideRows();

        generateTextMock.mockResolvedValueOnce({
            output: {
                explanation: 'Unpivot the repeated budget columns into a long table while preserving row coordinates.',
                operations: [
                    {
                        id: 'reshape_budget_matrix',
                        type: 'unpivot_columns',
                        reason: 'Convert the budget matrix into a long table.',
                        sourceColumns: ['10000', '10001', '10002', '10003'],
                        keyColumn: 'SeriesKey',
                        valueColumn: 'Value',
                        keepColumns: ['Code', 'Description', 'Total'],
                        sourceColumnNameColumn: 'SourceColumnName',
                        sourceRowIndexColumn: 'SourceRowIndex',
                        rowClassColumn: 'RowClass',
                    },
                ],
                outputColumns: [
                    { name: 'Code', type: 'numerical' as const },
                    { name: 'Description', type: 'categorical' as const },
                    { name: 'Total', type: 'numerical' as const },
                    { name: 'SeriesKey', type: 'categorical' as const },
                    { name: 'Value', type: 'numerical' as const },
                    { name: 'SourceColumnName', type: 'categorical' as const },
                    { name: 'SourceRowIndex', type: 'numerical' as const },
                    { name: 'RowClass', type: 'categorical' as const },
                ],
                planStatus: 'operations',
                consistencyIssues: [],
            },
        });

        const result = await generateDataPreparationPlan(
            wideColumns,
            wideRows as never,
            settings,
            undefined,
            undefined,
            {
                fileName: 'hierarchical-prefix-wide.csv',
                data: wideRows as never,
                metadataRows: [],
                headerLayers: [['', 'Budget', 'Budget']],
                summaryRows: [],
                headerDepth: 2,
            } as never,
            undefined,
            {
                maxAttempts: 1,
                allowInternalRetry: false,
                allowDeterministicFallback: false,
                allowHierarchyAnnotationFallback: false,
            },
        );

        expect(result.planStatus).toBe('operations');
        expect(result.operations.some(operation => operation.type === 'unpivot_columns')).toBe(true);
        expect(result.operations.some(operation =>
            operation.type === 'unpivot_columns'
            && operation.hierarchyDepthColumn === undefined,
        )).toBe(true);
    });

    it('rewrites non-wide hierarchical zero-op plans into annotate_hierarchy without retrying', async () => {
        const hierarchicalCase = createHierarchicalStatementCase();
        const hierarchicalColumns = hierarchicalCase.goodPlan?.outputColumns.filter(column =>
            !['RowClass', 'HierarchyDepth', 'SourceRowIndex'].includes(column.name),
        ) ?? [];
        const hierarchicalRows = hierarchicalCase.cleanedGood.data.map(row => {
            const { RowClass: _rowClass, HierarchyDepth: _hierarchyDepth, SourceRowIndex: _sourceRowIndex, ...rest } = row as Record<string, unknown>;
            return rest;
        });

        generateTextMock.mockResolvedValueOnce({
            output: {
                explanation: 'Prepared rows remain unchanged while refining schema types.',
                operations: [],
                outputColumns: hierarchicalColumns,
                planStatus: 'schema_only',
                consistencyIssues: [],
            },
        });

        const result = await generateDataPreparationPlan(
            hierarchicalColumns,
            hierarchicalRows as never,
            settings,
            undefined,
            undefined,
            {
                fileName: 'hierarchical-statement.csv',
                data: hierarchicalRows as never,
                metadataRows: [],
                headerLayers: [],
                summaryRows: [],
                headerDepth: 1,
            } as never,
            undefined,
            {
                maxAttempts: 1,
                allowInternalRetry: false,
                allowDeterministicFallback: false,
                allowHierarchyAnnotationFallback: false,
            },
        );

        expect(generateTextMock).toHaveBeenCalledTimes(1);
        expect(result.planStatus).toBe('operations');
        expect(result.operations.map(operation => operation.type)).toEqual(['annotate_hierarchy']);
    });

    it('allows source-only hierarchy annotation plans without forcing sample preview execution', async () => {
        const hierarchicalCase = createHierarchicalStatementCase();
        const hierarchicalColumns = hierarchicalCase.goodPlan?.outputColumns.filter(column =>
            !['RowClass', 'HierarchyDepth', 'SourceRowIndex'].includes(column.name),
        ) ?? [];
        const sourceRows = hierarchicalCase.cleanedGood.data.map(row => {
            const { RowClass: _rowClass, HierarchyDepth: _hierarchyDepth, SourceRowIndex: _sourceRowIndex, ...rest } = row as Record<string, unknown>;
            return rest;
        });
        const factOnlySampleRows = hierarchicalCase.cleanedGood.data
            .filter(row => row.RowClass === 'fact')
            .map(row => {
                const { RowClass: _rowClass, HierarchyDepth: _hierarchyDepth, SourceRowIndex: _sourceRowIndex, ...rest } = row as Record<string, unknown>;
                return rest;
            })
            .slice(0, 3);

        generateTextMock.mockResolvedValueOnce({
            output: {
                explanation: 'Drop remaining blanks and restore hierarchy metadata on the source table.',
                operations: [
                    {
                        id: 'drop-remaining-blanks',
                        type: 'drop_blank_rows',
                        reason: 'Remove any remaining blank rows after structural cleanup.',
                    },
                    {
                        id: 'annotate-hierarchy',
                        type: 'annotate_hierarchy',
                        reason: 'Add row class, hierarchy depth, and source row coordinates for the hierarchical statement.',
                        rowClassColumn: 'RowClass',
                        hierarchyDepthColumn: 'HierarchyDepth',
                        sourceRowIndexColumn: 'SourceRowIndex',
                    },
                ],
                outputColumns: [
                    ...hierarchicalColumns,
                    { name: 'RowClass', type: 'categorical' as const },
                    { name: 'HierarchyDepth', type: 'numerical' as const },
                    { name: 'SourceRowIndex', type: 'numerical' as const },
                ],
                planStatus: 'operations',
                consistencyIssues: [],
            },
        });

        const result = await generateDataPreparationPlan(
            hierarchicalColumns,
            factOnlySampleRows as never,
            settings,
            undefined,
            undefined,
            {
                fileName: 'source-only-hierarchy.csv',
                data: sourceRows as never,
                metadataRows: [],
                headerLayers: [],
                summaryRows: [],
                headerDepth: 1,
            } as never,
            undefined,
            {
                maxAttempts: 1,
                allowInternalRetry: false,
                allowDeterministicFallback: false,
                allowHierarchyAnnotationFallback: false,
            },
        );

        expect(result.planStatus).toBe('operations');
        expect(result.operations.map(operation => operation.type)).toEqual(['drop_blank_rows', 'annotate_hierarchy']);
    });

    it('appends annotate_hierarchy for bounded non-wide hierarchy salvage', async () => {
        const hierarchicalCase = createHierarchicalStatementCase();
        const hierarchicalColumns = hierarchicalCase.goodPlan?.outputColumns.filter(column =>
            !['RowClass', 'HierarchyDepth', 'SourceRowIndex'].includes(column.name),
        ) ?? [];
        const hierarchicalRows = hierarchicalCase.cleanedGood.data.map(row => {
            const { RowClass: _rowClass, HierarchyDepth: _hierarchyDepth, SourceRowIndex: _sourceRowIndex, ...rest } = row as Record<string, unknown>;
            return rest;
        });
        const telemetryEvents: Array<{ responseType: string; detail?: string }> = [];

        generateTextMock.mockResolvedValueOnce({
            output: {
                explanation: 'Drop blank rows while keeping the cleaned dataset tidy.',
                operations: [
                    {
                        id: 'drop_blank_rows',
                        type: 'drop_blank_rows',
                        reason: 'Remove residual blank rows.',
                    },
                ],
                outputColumns: hierarchicalColumns,
                planStatus: 'operations',
                consistencyIssues: [],
            },
        });

        const result = await generateDataPreparationPlan(
            hierarchicalColumns,
            hierarchicalRows as never,
            settings,
            undefined,
            {
                logTelemetryEvent: event => telemetryEvents.push({
                    responseType: event.responseType,
                    detail: event.detail,
                }),
            },
            {
                fileName: 'hierarchical-statement.csv',
                data: hierarchicalRows as never,
                metadataRows: [],
                headerLayers: [],
                summaryRows: [],
                headerDepth: 1,
            } as never,
        );

        expect(result.planStatus).toBe('operations');
        expect(result.operations.map(operation => operation.type)).toEqual(['drop_blank_rows', 'annotate_hierarchy']);
        expect(telemetryEvents.map(event => event.responseType)).toContain('data_prep_hierarchy_annotation_normalized');
        expect(telemetryEvents.map(event => event.responseType)).not.toContain('data_prep_plan_salvaged_hierarchy');
    });

    it('appends annotate_hierarchy from source-only hierarchy evidence when the sample slice lacks group rows', async () => {
        const hierarchicalCase = createHierarchicalStatementCase();
        const hierarchicalColumns = hierarchicalCase.goodPlan?.outputColumns.filter(column =>
            !['RowClass', 'HierarchyDepth', 'SourceRowIndex'].includes(column.name),
        ) ?? [];
        const sourceRows = hierarchicalCase.cleanedGood.data.map(row => {
            const { RowClass: _rowClass, HierarchyDepth: _hierarchyDepth, SourceRowIndex: _sourceRowIndex, ...rest } = row as Record<string, unknown>;
            return rest;
        });
        const factOnlySampleRows = hierarchicalCase.cleanedGood.data
            .filter(row => row.RowClass === 'fact')
            .map(row => {
                const { RowClass: _rowClass, HierarchyDepth: _hierarchyDepth, SourceRowIndex: _sourceRowIndex, ...rest } = row as Record<string, unknown>;
                return rest;
            })
            .slice(0, 3);

        generateTextMock.mockResolvedValueOnce({
            output: {
                explanation: 'Drop blank rows while keeping the cleaned dataset tidy.',
                operations: [
                    {
                        id: 'drop_blank_rows',
                        type: 'drop_blank_rows',
                        reason: 'Remove residual blank rows.',
                    },
                ],
                outputColumns: hierarchicalColumns,
                planStatus: 'operations',
                consistencyIssues: [],
            },
        });

        const result = await generateDataPreparationPlan(
            hierarchicalColumns,
            factOnlySampleRows as never,
            settings,
            undefined,
            undefined,
            {
                fileName: 'source-only-hierarchy.csv',
                data: sourceRows as never,
                metadataRows: [],
                headerLayers: [],
                summaryRows: [],
                headerDepth: 1,
            } as never,
        );

        expect(result.planStatus).toBe('operations');
        expect(result.operations.map(operation => operation.type)).toEqual(['drop_blank_rows', 'annotate_hierarchy']);
    });

    it('prefers hierarchy-preserving deterministic fallback over wide reshape for repeated attribute bundle reports', async () => {
        const csvData = buildRepeatedBundleCsvData();
        const profiles = buildRepeatedBundleProfiles();
        const sourceColumns = profiles
            .map(column => column.name)
            .filter(name => /^(?:Date|Number|Qty|UOM)(?:_\d+)?$/u.test(name) && !['Date', 'Number', 'UOM'].includes(name));
        const keepColumns = profiles
            .map(column => column.name)
            .filter(name => !sourceColumns.includes(name));

        generateTextMock.mockResolvedValueOnce({
            output: {
                explanation: 'Unpivot repeated lifecycle columns into a long table for analysis.',
                operations: [
                    {
                        id: 'unpivot-detail-series',
                        type: 'unpivot_columns',
                        reason: 'Convert repeated lifecycle stages into long rows.',
                        sourceColumns,
                        keepColumns,
                        keyColumn: 'SeriesKey',
                        valueColumn: 'Value',
                        labelColumns: [{
                            outputColumn: 'SeriesLabelL1',
                            mappings: sourceColumns.map(sourceColumn => ({ sourceColumn, label: null })),
                        }],
                        sourceRowIndexColumn: 'SourceRowIndex',
                        sourceColumnNameColumn: 'SourceColumnName',
                        rowClassColumn: 'RowClass',
                        hierarchyDepthColumn: 'HierarchyDepth',
                    },
                ],
                outputColumns: [
                    ...profiles,
                    { name: 'SeriesKey', type: 'categorical' },
                    { name: 'SeriesLabelL1', type: 'categorical' },
                    { name: 'Value', type: 'numerical' },
                    { name: 'SourceRowIndex', type: 'numerical' },
                    { name: 'SourceColumnName', type: 'categorical' },
                    { name: 'RowClass', type: 'categorical' },
                    { name: 'HierarchyDepth', type: 'numerical' },
                ],
                planStatus: 'operations',
                consistencyIssues: [],
            },
        });

        const result = await generateDataPreparationPlan(
            profiles,
            csvData.data as never,
            settings,
            undefined,
            undefined,
            csvData,
            undefined,
            {
                maxAttempts: 1,
                allowInternalRetry: false,
                allowDeterministicFallback: true,
            },
        );

        expect(result.planStatus).toBe('operations');
        expect(result.operations.map(operation => operation.type)).toEqual([
            'drop_blank_rows',
            'annotate_hierarchy',
        ]);
        expect(generateTextMock).toHaveBeenCalledTimes(1);
    });

    it('switches directly to deterministic fallback after label-layer verification fails instead of retrying the same reshape prompt', async () => {
        const csvData = buildRepeatedBundleCsvData();
        const profiles = buildRepeatedBundleProfiles();
        const sourceColumns = profiles
            .map(column => column.name)
            .filter(name => /^(?:Date|Number|Qty|UOM)(?:_\d+)?$/u.test(name) && !['Date', 'Number', 'UOM'].includes(name));
        const keepColumns = profiles
            .map(column => column.name)
            .filter(name => !sourceColumns.includes(name));

        generateTextMock
            .mockResolvedValueOnce({
                output: {
                    explanation: 'Unpivot repeated lifecycle columns into a long table for analysis.',
                    operations: [
                        {
                            id: 'unpivot-detail-series',
                            type: 'unpivot_columns',
                            reason: 'Convert repeated lifecycle stages into long rows.',
                            sourceColumns,
                            keepColumns,
                            keyColumn: 'SeriesKey',
                            valueColumn: 'Value',
                            labelColumns: [{
                                outputColumn: 'SeriesLabelL1',
                                mappings: sourceColumns.map(sourceColumn => ({ sourceColumn, label: null })),
                            }],
                            sourceRowIndexColumn: 'SourceRowIndex',
                            sourceColumnNameColumn: 'SourceColumnName',
                            rowClassColumn: 'RowClass',
                            hierarchyDepthColumn: 'HierarchyDepth',
                        },
                    ],
                    outputColumns: [
                        ...profiles,
                        { name: 'SeriesKey', type: 'categorical' },
                        { name: 'SeriesLabelL1', type: 'categorical' },
                        { name: 'Value', type: 'numerical' },
                        { name: 'SourceRowIndex', type: 'numerical' },
                        { name: 'SourceColumnName', type: 'categorical' },
                        { name: 'RowClass', type: 'categorical' },
                        { name: 'HierarchyDepth', type: 'numerical' },
                    ],
                    planStatus: 'operations',
                    consistencyIssues: [],
                },
            })
            .mockResolvedValueOnce({
                output: {
                    explanation: 'This retry should never be consumed.',
                    operations: [],
                    outputColumns: profiles,
                    planStatus: 'schema_only',
                    consistencyIssues: [],
                },
            });

        const result = await generateDataPreparationPlan(
            profiles,
            csvData.data as never,
            settings,
            undefined,
            undefined,
            csvData,
            undefined,
            {
                maxAttempts: 1,
                allowInternalRetry: false,
                allowDeterministicFallback: true,
            },
        );

        expect(result.planStatus).toBe('operations');
        expect(result.operations.map(operation => operation.type)).toEqual([
            'drop_blank_rows',
            'annotate_hierarchy',
        ]);
        expect(generateTextMock).toHaveBeenCalledTimes(1);
    });

    it('accepts wide-table plans that emit Value before casting it', async () => {
        const wideColumns = buildWideColumns();
        const wideRows = buildWideRows();

        generateTextMock.mockResolvedValueOnce({
            output: {
                explanation: 'Unpivot the repeated metric columns and cast the emitted Value column.',
                operations: [
                    {
                        id: 'reshape_metrics',
                        type: 'unpivot_columns',
                        reason: 'Convert repeated metric columns into long rows.',
                        sourceColumns: ['10000', '10001'],
                        keyColumn: 'SeriesKey',
                        valueColumn: 'Value',
                        keepColumns: ['Code', 'Description'],
                        sourceColumnNameColumn: 'SourceColumnName',
                        sourceRowIndexColumn: 'SourceRowIndex',
                        rowClassColumn: 'RowClass',
                        hierarchyDepthColumn: 'HierarchyDepth',
                        hierarchyDepthMappings: [
                            { sourceRowIndex: 0, depth: 1 },
                            { sourceRowIndex: 1, depth: 0 },
                            { sourceRowIndex: 2, depth: 0 },
                        ],
                    },
                    {
                        id: 'cast_value_column',
                        type: 'cast_column',
                        reason: 'Convert emitted Value entries to numbers.',
                        column: 'Value',
                        targetType: 'number',
                    },
                ],
                outputColumns: [
                    { name: 'Code', type: 'numerical' },
                    { name: 'Description', type: 'categorical' },
                    { name: 'SeriesKey', type: 'categorical' },
                    { name: 'Value', type: 'numerical' },
                    { name: 'SourceColumnName', type: 'categorical' },
                    { name: 'SourceRowIndex', type: 'numerical' },
                    { name: 'RowClass', type: 'categorical' },
                    { name: 'HierarchyDepth', type: 'numerical' },
                ],
                planStatus: 'operations',
                consistencyIssues: [],
            },
        });

        const result = await generateDataPreparationPlan(wideColumns, wideRows as never, settings);

        expect(generateTextMock).toHaveBeenCalledTimes(1);
        expect(result.planStatus).toBe('operations');
        expect(result.operations.map(operation => operation.id)).toEqual(['reshape_metrics', 'cast_value_column']);
    }, 60_000);

    it('does not block native Value casts for non-wide tables', async () => {
        const nonWideColumns = [
            { name: 'Account', type: 'categorical' as const },
            { name: 'Value', type: 'numerical' as const },
        ];

        generateTextMock.mockResolvedValueOnce({
            output: {
                explanation: 'Cast the existing Value column to numbers.',
                operations: [
                    {
                        id: 'cast_value_column',
                        type: 'cast_column',
                        reason: 'Convert the existing Value column to numbers.',
                        column: 'Value',
                        targetType: 'number',
                    },
                ],
                outputColumns: [
                    { name: 'Account', type: 'categorical' },
                    { name: 'Value', type: 'numerical' },
                ],
                planStatus: 'operations',
                consistencyIssues: [],
            },
        });

        const result = await generateDataPreparationPlan(
            nonWideColumns,
            [{ Account: 'Revenue', Value: '10.00' }],
            settings,
        );

        expect(generateTextMock).toHaveBeenCalledTimes(1);
        expect(result.planStatus).toBe('operations');
        expect(result.operations).toHaveLength(1);
        expect(result.operations[0]?.type).toBe('cast_column');
    });

    it('replaces zero-op schema-only plans with deterministic cleanup when tabular footer noise remains', async () => {
        const tabularColumns = [
            { name: 'Project', type: 'categorical' as const },
            { name: 'Opened', type: 'numerical' as const },
            { name: 'Pending', type: 'numerical' as const },
        ];
        const tabularRows = [
            { Project: 'P01', Opened: '15', Pending: '1' },
            { Project: 'P02', Opened: '13', Pending: '0' },
            { Project: '', Opened: '18-03-2026@ 16:11 | m8 | 111.65.75.55', Pending: '' },
        ];

        generateTextMock.mockResolvedValueOnce({
            output: {
                explanation: 'Prepared rows remain unchanged; only schema typing was reviewed.',
                operations: [],
                outputColumns: tabularColumns,
                planStatus: 'schema_only',
                consistencyIssues: [],
            },
        });

        const result = await generateDataPreparationPlan(
            tabularColumns,
            tabularRows as never,
            settings,
            undefined,
            undefined,
            {
                fileName: 'quotation-summary.csv',
                data: tabularRows as never,
                metadataRows: [],
                headerLayers: [],
                summaryRows: [],
                headerDepth: 1,
            },
        );

        expect(generateTextMock).toHaveBeenCalledTimes(1);
        expect(result.planStatus).toBe('operations');
        expect(result.operations.map(operation => operation.type)).toEqual(['drop_rows_by_index', 'drop_blank_rows']);
    });

    it('replaces operation plans with deterministic cleanup when footer noise still remains after execution', async () => {
        const tabularColumns = [
            { name: 'Project', type: 'categorical' as const },
            { name: 'Opened', type: 'numerical' as const },
            { name: 'Pending', type: 'numerical' as const },
        ];
        const tabularRows = [
            { Project: 'P01', Opened: '15', Pending: '1' },
            { Project: 'P02', Opened: '13', Pending: '0' },
            { Project: '', Opened: '18-03-2026@ 16:11 | m8 | 111.65.75.55', Pending: '' },
        ];

        const weakCleanupPlan = {
            output: {
                explanation: 'Drop fully blank rows only.',
                operations: [
                    {
                        id: 'drop_blanks_only',
                        type: 'drop_blank_rows',
                        reason: 'Remove blank rows only.',
                    },
                ],
                outputColumns: tabularColumns,
                planStatus: 'operations',
                consistencyIssues: [],
            },
        };
        generateTextMock
            .mockResolvedValueOnce(weakCleanupPlan)
            .mockResolvedValueOnce(weakCleanupPlan);

        const result = await generateDataPreparationPlan(
            tabularColumns,
            tabularRows as never,
            settings,
            undefined,
            undefined,
            {
                fileName: 'quotation-summary.csv',
                data: tabularRows as never,
                metadataRows: [],
                headerLayers: [],
                summaryRows: [],
                headerDepth: 1,
            },
        );

        expect(generateTextMock).toHaveBeenCalledTimes(2);
        expect(result.planStatus).toBe('operations');
        expect(result.operations.map(operation => operation.type)).toEqual(['drop_rows_by_index', 'drop_blank_rows']);
    });

    it('does not classify dense long-table ad exports as wide tables without matrix evidence', async () => {
        const adColumns = [
            { name: 'Reporting starts', type: 'numerical' as const },
            { name: 'Reporting ends', type: 'numerical' as const },
            { name: 'Ad name', type: 'categorical' as const },
            { name: 'Ad delivery', type: 'categorical' as const },
            { name: 'Amount spent (SGD)', type: 'numerical' as const },
            { name: 'Results', type: 'numerical' as const },
            { name: 'Reach', type: 'numerical' as const },
            { name: 'Impressions', type: 'numerical' as const },
            { name: 'Cost per results', type: 'numerical' as const },
            { name: 'CPM (cost per 1,000 impressions) (SGD)', type: 'numerical' as const },
            { name: 'Cost per Page engagement (SGD)', type: 'numerical' as const },
            { name: 'Post engagements', type: 'numerical' as const },
            { name: 'Cost per ThruPlay (SGD)', type: 'numerical' as const },
            { name: 'CTR (link click-through rate)', type: 'numerical' as const },
            { name: 'Link clicks', type: 'numerical' as const },
            { name: 'Campaign name', type: 'categorical' as const },
            { name: 'Campaign ID', type: 'numerical' as const },
            { name: 'Ad set ID', type: 'numerical' as const },
            { name: 'Ad ID', type: 'numerical' as const },
            { name: 'Views', type: 'numerical' as const },
        ];

        generateTextMock.mockResolvedValueOnce({
            output: {
                explanation: 'No structural reshape is needed.',
                operations: [],
                outputColumns: adColumns,
                planStatus: 'schema_only',
                consistencyIssues: [],
            },
        });

        await generateDataPreparationPlan(
            adColumns,
            [{
                'Reporting starts': '2025-03-01',
                'Reporting ends': '2026-03-01',
                'Ad name': 'AWA | CBE | KOL - KITTY',
                'Ad delivery': 'inactive',
                'Amount spent (SGD)': '149.67',
                'Results': '95505',
                'Reach': '95505',
                'Impressions': '97115',
                'Cost per results': '1.56714308',
                'CPM (cost per 1,000 impressions) (SGD)': '1.541163',
                'Cost per Page engagement (SGD)': '0.01778',
                'Post engagements': '8418',
                'Cost per ThruPlay (SGD)': '0.388753',
                'CTR (link click-through rate)': '0.061782',
                'Link clicks': '60',
                'Campaign name': 'AWA | CBE | KOL - KITTY',
                'Campaign ID': '120225058085890727',
                'Ad set ID': '120225058085900727',
                'Ad ID': '120225058085910727',
                'Views': '127431',
            }],
            settings,
            undefined,
            undefined,
            {
                fileName: 'ads.csv',
                data: [],
                metadataRows: [],
                headerLayers: [],
                summaryRows: [],
                headerDepth: 1,
            },
        );

        const promptContent = String(generateTextMock.mock.calls.at(-1)?.[0]?.messages?.[1]?.content ?? '');
        expect(promptContent).not.toContain('prefer `unpivot_columns`');
        expect(promptContent).not.toContain('derived long-table columns such as Value');
    });

    it('falls back to drop_blank_rows when a non-wide zero-op plan leaves fully blank rows in place', async () => {
        const adColumns = [
            { name: 'Ad name', type: 'categorical' as const },
            { name: 'Amount spent (SGD)', type: 'numerical' as const },
            { name: 'Reach', type: 'numerical' as const },
        ];

        generateTextMock.mockResolvedValueOnce({
            output: {
                explanation: 'Prepared rows remain unchanged while refining schema types.',
                operations: [],
                outputColumns: adColumns,
                planStatus: 'schema_only',
                consistencyIssues: [],
            },
        });

        const result = await generateDataPreparationPlan(
            adColumns,
            [
                { 'Ad name': 'Promo A', 'Amount spent (SGD)': '12.30', Reach: '320' },
                { 'Ad name': '', 'Amount spent (SGD)': '', Reach: '' },
            ],
            settings,
            undefined,
            undefined,
            {
                fileName: 'ads-with-blank.csv',
                data: [
                    { 'Ad name': 'Promo A', 'Amount spent (SGD)': '12.30', Reach: '320' },
                    { 'Ad name': '', 'Amount spent (SGD)': '', Reach: '' },
                ],
                metadataRows: [],
                headerLayers: [],
                summaryRows: [],
                headerDepth: 1,
            },
        );

        expect(result.planStatus).toBe('operations');
        expect(result.operations.some(operation => operation.type === 'drop_blank_rows')).toBe(true);
    });

    it('falls back to hierarchy annotation when a hierarchical wide statement still returns a zero-op plan', async () => {
        const wideColumns = buildWideColumns();
        const wideRows = buildHierarchicalWideRows();

        const zeroOpHierarchicalPlan = {
            output: {
                explanation: 'Remove empty note columns and refine numeric typing while preserving hierarchy.',
                operations: [],
                outputColumns: wideColumns,
                planStatus: 'schema_only',
                consistencyIssues: [],
            },
        };
        generateTextMock
            .mockResolvedValueOnce(zeroOpHierarchicalPlan)
            .mockResolvedValueOnce(zeroOpHierarchicalPlan);

        const result = await generateDataPreparationPlan(
            wideColumns,
            wideRows as never,
            settings,
            undefined,
            undefined,
            {
                fileName: 'hierarchical-wide.csv',
                data: wideRows as never,
                metadataRows: [],
                headerLayers: [['', 'Budget', 'Budget']],
                summaryRows: [],
                headerDepth: 2,
            },
        );

        expect(result.planStatus).toBe('operations');
        expect(result.operations.length).toBeGreaterThan(0);
        expect(result.operations.some(operation => operation.type === 'annotate_hierarchy' || operation.type === 'unpivot_columns')).toBe(true);
    });

    it('falls back to hierarchy annotation when a hierarchical wide statement only returns non-shaping operations', async () => {
        const wideColumns = buildWideColumns();
        const wideRows = buildHierarchicalWideRows();

        const weakHierarchicalPlan = {
            output: {
                explanation: 'Trim whitespace and normalize empty values while keeping the hierarchy available for later analysis.',
                operations: [
                    {
                        id: 'trim_whitespace',
                        type: 'trim_whitespace',
                        reason: 'Remove stray whitespace before analysis.',
                    },
                    {
                        id: 'normalize_empty_values',
                        type: 'normalize_empty_values',
                        reason: 'Normalize blank-like values.',
                    },
                ],
                outputColumns: [
                    ...wideColumns,
                    { name: 'HierarchyDepth', type: 'numerical' as const },
                    { name: 'SourceRowIndex', type: 'numerical' as const },
                ],
                planStatus: 'operations',
                consistencyIssues: [],
            },
        };
        generateTextMock
            .mockResolvedValueOnce(weakHierarchicalPlan)
            .mockResolvedValueOnce(weakHierarchicalPlan);

        const result = await generateDataPreparationPlan(
            wideColumns,
            wideRows as never,
            settings,
            undefined,
            undefined,
            {
                fileName: 'hierarchical-wide.csv',
                data: wideRows as never,
                metadataRows: [],
                headerLayers: [['', 'Budget', 'Budget']],
                summaryRows: [],
                headerDepth: 2,
            },
        );

        expect(generateTextMock).toHaveBeenCalledTimes(1);
        expect(result.planStatus).toBe('operations');
        expect(result.operations.length).toBeGreaterThan(0);
        expect(result.operations.some(operation => operation.type === 'annotate_hierarchy' || operation.type === 'unpivot_columns')).toBe(true);
    });

    it('falls back to hierarchy annotation when a hierarchical wide statement returns non-reshaping operations only', async () => {
        const wideColumns = buildWideColumns();
        const wideRows = buildHierarchicalWideRows();

        const incompleteHierarchicalPlan = {
            output: {
                explanation: 'Trim labels and normalize blanks before analysis.',
                operations: [
                    {
                        id: 'trim_all',
                        type: 'trim_whitespace',
                        reason: 'Normalize whitespace in imported cells.',
                    },
                    {
                        id: 'normalize_empty_values',
                        type: 'normalize_empty_values',
                        reason: 'Convert empty markers to null.',
                    },
                ],
                outputColumns: wideColumns,
                planStatus: 'operations',
                consistencyIssues: [],
            },
        };
        generateTextMock
            .mockResolvedValueOnce(incompleteHierarchicalPlan)
            .mockResolvedValueOnce(incompleteHierarchicalPlan);

        const result = await generateDataPreparationPlan(
            wideColumns,
            wideRows as never,
            settings,
            undefined,
            undefined,
            {
                fileName: 'hierarchical-wide.csv',
                data: wideRows as never,
                metadataRows: [],
                headerLayers: [['', 'Budget', 'Budget']],
                summaryRows: [],
                headerDepth: 2,
            },
        );

        expect(result.planStatus).toBe('operations');
        expect(result.operations.length).toBeGreaterThan(0);
        expect(result.operations.some(operation => operation.type === 'annotate_hierarchy' || operation.type === 'unpivot_columns')).toBe(true);
        expect(generateTextMock).toHaveBeenCalledTimes(1);
    });

    it('falls back to hierarchy annotation when a hierarchical wide unpivot omits hierarchy depth mappings', async () => {
        const wideColumns = buildWideColumns();
        const wideRows = buildHierarchicalWideRows();

        const incompleteUnpivotPlan = {
            output: {
                explanation: 'Unpivot the repeated budget columns into a long table.',
                operations: [
                    {
                        id: 'reshape_budget_matrix',
                        type: 'unpivot_columns',
                        reason: 'Convert the budget matrix into a long table.',
                        sourceColumns: ['10000', '10001', '10002', '10003'],
                        keyColumn: 'SeriesKey',
                        valueColumn: 'Value',
                        keepColumns: ['Code', 'Description', 'Total'],
                        sourceColumnNameColumn: 'SourceColumnName',
                        sourceRowIndexColumn: 'SourceRowIndex',
                        rowClassColumn: 'RowClass',
                        hierarchyDepthColumn: 'HierarchyDepth',
                    },
                ],
                outputColumns: [
                    { name: 'Code', type: 'numerical' as const },
                    { name: 'Description', type: 'categorical' as const },
                    { name: 'Total', type: 'numerical' as const },
                    { name: 'SeriesKey', type: 'categorical' as const },
                    { name: 'Value', type: 'numerical' as const },
                    { name: 'SourceColumnName', type: 'categorical' as const },
                    { name: 'SourceRowIndex', type: 'numerical' as const },
                    { name: 'RowClass', type: 'categorical' as const },
                    { name: 'HierarchyDepth', type: 'numerical' as const },
                ],
                planStatus: 'operations',
                consistencyIssues: [],
            },
        };
        generateTextMock
            .mockResolvedValueOnce(incompleteUnpivotPlan)
            .mockResolvedValueOnce(incompleteUnpivotPlan);

        const result = await generateDataPreparationPlan(
            wideColumns,
            wideRows as never,
            settings,
            undefined,
            undefined,
            {
                fileName: 'hierarchical-wide.csv',
                data: wideRows as never,
                metadataRows: [],
                headerLayers: [['', 'Budget', 'Budget']],
                summaryRows: [],
                headerDepth: 2,
            },
        );

        expect(result.planStatus).toBe('operations');
        expect(result.operations.length).toBeGreaterThan(0);
        expect(result.operations.some(operation => operation.type === 'annotate_hierarchy' || operation.type === 'unpivot_columns')).toBe(true);
        expect(generateTextMock).toHaveBeenCalledTimes(1);
    });

    it('keeps mixed grouped reports on the provider path when no deterministic fast path satisfies the cleaning contract', async () => {
        const repeatedBundleProfiles = buildRepeatedBundleProfiles();
        const repeatedBundleCsvData = buildRepeatedBundleCsvData();
        const sourceColumns = repeatedBundleProfiles
            .map(column => column.name)
            .filter(name => /^(?:Date|Number|Qty|UOM)(?:_\d+)?$/u.test(name) && !['Date', 'Number', 'UOM'].includes(name));
        const keepColumns = repeatedBundleProfiles
            .map(column => column.name)
            .filter(name => !sourceColumns.includes(name));
        const telemetryEvents: Array<{ responseType: string; detail?: string; meta?: Record<string, unknown> }> = [];
        const groupedReportProviderOutput = {
            output: {
                explanation: 'Unpivot repeated lifecycle columns into a long table for analysis.',
                operations: [
                    {
                        id: 'unpivot-detail-series',
                        type: 'unpivot_columns',
                        reason: 'Convert repeated lifecycle stages into long rows.',
                        sourceColumns,
                        keepColumns,
                        keyColumn: 'SeriesKey',
                        valueColumn: 'Value',
                        labelColumns: [{
                            outputColumn: 'SeriesLabelL1',
                            mappings: sourceColumns.map(sourceColumn => ({ sourceColumn, label: null })),
                        }],
                        sourceRowIndexColumn: 'SourceRowIndex',
                        sourceColumnNameColumn: 'SourceColumnName',
                        rowClassColumn: 'RowClass',
                        hierarchyDepthColumn: 'HierarchyDepth',
                    },
                ],
                outputColumns: [
                    ...repeatedBundleProfiles,
                    { name: 'SeriesKey', type: 'categorical' },
                    { name: 'SeriesLabelL1', type: 'categorical' },
                    { name: 'Value', type: 'numerical' },
                    { name: 'SourceRowIndex', type: 'numerical' },
                    { name: 'SourceColumnName', type: 'categorical' },
                    { name: 'RowClass', type: 'categorical' },
                    { name: 'HierarchyDepth', type: 'numerical' },
                ],
                planStatus: 'operations',
                consistencyIssues: [],
            },
        };
        generateTextMock
            .mockResolvedValueOnce(groupedReportProviderOutput)
            .mockResolvedValueOnce(groupedReportProviderOutput);

        const result = await generateDataPreparationPlan(
            repeatedBundleProfiles,
            repeatedBundleCsvData.data,
            settings,
            undefined,
            {
                logTelemetryEvent: event => telemetryEvents.push({
                    responseType: event.responseType,
                    detail: event.detail,
                    meta: event.meta as Record<string, unknown> | undefined,
                }),
            },
            repeatedBundleCsvData as never,
        );

        expect(generateTextMock).toHaveBeenCalledTimes(2);
        expect(result.operations.length).toBeGreaterThan(0);
        expect(telemetryEvents.map(event => event.responseType)).toContain('data_prep_deterministic_fallback_used');
        expect(telemetryEvents.some(event => event.meta?.fastPath === true)).toBe(false);
        expect(telemetryEvents.map(event => event.responseType)).toContain('data_prep_stage_timing');
    });

    it('emits typed provider_no_output telemetry and stage timing when recovery succeeds on retry', async () => {
        const telemetryEvents: Array<{ responseType: string; detail?: string; meta?: Record<string, unknown> }> = [];
        generateTextMock
            .mockRejectedValueOnce(new Error('No output generated'))
            .mockResolvedValueOnce({
                output: {
                    explanation: 'Keep the dataset shape stable.',
                    operations: [],
                    outputColumns: baselineColumns,
                    planStatus: 'schema_only',
                    consistencyIssues: [],
                },
            });

        const result = await generateDataPreparationPlan(
            baselineColumns,
            [
                { Date: '01-01-2010', 'Document Number': 'SO1', Qty: '10' },
                { Date: '02-01-2010', 'Document Number': 'SO2', Qty: '12' },
            ] as never,
            settings,
            undefined,
            {
                logTelemetryEvent: event => telemetryEvents.push({
                    responseType: event.responseType,
                    detail: event.detail,
                    meta: event.meta as Record<string, unknown> | undefined,
                }),
            },
        );

        expect(result.planStatus).toBe('schema_only');
        expect(generateTextMock).toHaveBeenCalledTimes(2);
        expect(telemetryEvents.some(event => event.responseType === 'data_prep_stage_timing')).toBe(true);
        expect(telemetryEvents.some(event => event.meta?.typedReasonCode === 'provider_no_output')).toBe(true);
    });
});
