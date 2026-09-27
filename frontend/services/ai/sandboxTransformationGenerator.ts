import { Output, jsonSchema } from 'ai';
import type {
    ColumnProfile,
    CsvRow,
    SandboxTransformationProposal,
    Settings,
} from '../../types';
import { validateSandboxProposal } from '../sandbox/sandboxPolicy';
import { createProviderModel } from './providerConfig';
import { prepareSchemaForProvider } from './googleSchemaAdapter';
import { streamGenerateText } from './streamGenerateText';
import { withTransientRetry } from './transientRetry';

const SANDBOX_GENERATION_TIMEOUT_MS = 60_000;

const sandboxProposalSchema = {
    type: 'object',
    properties: {
        language: { type: 'string', enum: ['javascript', 'python'] },
        explanation: { type: 'string', minLength: 1 },
        code: { type: 'string', minLength: 1, maxLength: 40_000 },
        primaryTableId: { type: 'string', minLength: 1 },
        tables: {
            type: 'array',
            minItems: 1,
            maxItems: 8,
            items: {
                type: 'object',
                properties: {
                    tableId: { type: 'string', minLength: 1 },
                    name: { type: 'string', minLength: 1 },
                    role: { type: 'string', enum: ['fact', 'dimension', 'bridge', 'reference', 'unknown'] },
                    mergeKeys: { type: 'array', items: { type: 'string', minLength: 1 } },
                },
                required: ['tableId', 'name', 'role'],
            },
        },
        preserveRowCount: { type: 'boolean' },
        maxRowDropRatio: { type: 'number', minimum: 0, maximum: 0.5 },
        preserveNumericColumns: { type: 'array', items: { type: 'string', minLength: 1 } },
        derivedFields: {
            type: 'array',
            maxItems: 12,
            items: {
                type: 'object',
                properties: {
                    tableId: { type: 'string', minLength: 1 },
                    fieldName: { type: 'string', minLength: 1 },
                    operation: { type: 'string', enum: ['ratio', 'difference', 'sum', 'product'] },
                    inputColumns: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
                    unit: { type: 'string', minLength: 1 },
                    grain: { type: 'string', minLength: 1 },
                    allowNull: { type: 'boolean' },
                    zeroDenominator: { type: 'string', enum: ['null', 'zero'] },
                },
                required: ['tableId', 'fieldName', 'operation', 'inputColumns', 'unit', 'grain', 'allowNull', 'zeroDenominator'],
            },
        },
    },
    required: [
        'language',
        'explanation',
        'code',
        'primaryTableId',
        'tables',
        'preserveRowCount',
        'maxRowDropRatio',
        'preserveNumericColumns',
        'derivedFields',
    ],
};

const formatSample = (rows: CsvRow[]) => JSON.stringify(rows.slice(0, 30), null, 2);

const buildPrompt = (input: {
    attempt: 2 | 3;
    inputTableId: string;
    profiles: ColumnProfile[];
    sampleRows: CsvRow[];
    previousFailure: string;
}) => `Create one bounded sandbox transformation for a CSV dataset after governed declarative operations failed.

Attempt: ${input.attempt} of 3
Input table ID: ${input.inputTableId}
Previous validation failure: ${input.previousFailure}
Columns: ${JSON.stringify(input.profiles.map(profile => ({ name: profile.name, type: profile.type })))}
Sample rows:
${formatSample(input.sampleRows)}

Execution contract:
- Prefer JavaScript on attempt 2. Attempt 3 is a targeted recovery and may use Python only when it is materially clearer.
- JavaScript must define function transform(rows, context). Python must define def transform(rows, context).
- Return {tables, lineage, relationships, notes}. Every declared table must appear in tables.
- Every output row must have exactly one lineage record with local input row indexes for the current batch.
- Code runs independently for stratified samples and fixed-size batches. Do not rely on cross-batch mutable state.
- Dimension tables may declare mergeKeys so the host can deduplicate them across batches.
- Do not use imports, network, DOM, browser storage, worker control, dynamic code, host globals, or credentials.
- Preserve the original input. Do not mutate rows in place.
- Preserve all meaningful numeric totals unless the explanation explicitly proves why a column is excluded.
- Declare every new calculated column in derivedFields. Use ratio, difference, sum, or product with explicit source columns, unit, grain, null policy, and zero-denominator behavior.
- Do not invent values. When structure remains ambiguous, return the input as the primary fact table with complete lineage.
- Return plain source code in the code field, without markdown fences.`;

const normalizeProposal = (value: unknown): SandboxTransformationProposal => {
    const candidate = value as SandboxTransformationProposal;
    return {
        language: candidate.language,
        explanation: typeof candidate.explanation === 'string' ? candidate.explanation.trim() : '',
        code: typeof candidate.code === 'string'
            ? candidate.code.replace(/^```(?:javascript|js|python)?\s*/i, '').replace(/\s*```$/, '').trim()
            : '',
        primaryTableId: typeof candidate.primaryTableId === 'string' ? candidate.primaryTableId.trim() : '',
        tables: Array.isArray(candidate.tables)
            ? candidate.tables.map(table => ({
                tableId: typeof table.tableId === 'string' ? table.tableId.trim() : '',
                name: typeof table.name === 'string' ? table.name.trim() : '',
                role: table.role,
                ...(Array.isArray(table.mergeKeys)
                    ? { mergeKeys: table.mergeKeys.filter(key => typeof key === 'string' && key.trim()).map(key => key.trim()) }
                    : {}),
            }))
            : [],
        preserveRowCount: candidate.preserveRowCount === true,
        maxRowDropRatio: typeof candidate.maxRowDropRatio === 'number' ? candidate.maxRowDropRatio : 0,
        preserveNumericColumns: Array.isArray(candidate.preserveNumericColumns)
            ? candidate.preserveNumericColumns.filter(column => typeof column === 'string' && column.trim()).map(column => column.trim())
            : [],
        derivedFields: Array.isArray(candidate.derivedFields)
            ? candidate.derivedFields.map(field => ({
                tableId: typeof field.tableId === 'string' ? field.tableId.trim() : '',
                fieldName: typeof field.fieldName === 'string' ? field.fieldName.trim() : '',
                operation: field.operation,
                inputColumns: Array.isArray(field.inputColumns)
                    ? field.inputColumns.filter(column => typeof column === 'string' && column.trim()).map(column => column.trim())
                    : [],
                unit: typeof field.unit === 'string' ? field.unit.trim() : '',
                grain: typeof field.grain === 'string' ? field.grain.trim() : '',
                allowNull: field.allowNull === true,
                zeroDenominator: field.zeroDenominator,
            }))
            : [],
    };
};

export const generateSandboxTransformationProposal = async (input: {
    attempt: 2 | 3;
    inputTableId: string;
    profiles: ColumnProfile[];
    sampleRows: CsvRow[];
    previousFailure: string;
    settings: Settings;
    abortSignal?: AbortSignal;
}): Promise<SandboxTransformationProposal> => {
    const controller = new AbortController();
    const onAbort = () => controller.abort(input.abortSignal?.reason);
    input.abortSignal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error('sandbox_generation_timeout')), SANDBOX_GENERATION_TIMEOUT_MS);
    try {
        const { model, modelId } = createProviderModel(input.settings, input.settings.complexModel);
        const result = await withTransientRetry(
            fallback => streamGenerateText({
                model: fallback ?? model,
                messages: [
                    {
                        role: 'system',
                        content: 'You design bounded, batch-safe CSV transformations for an isolated browser sandbox. Follow the output schema exactly.',
                    },
                    { role: 'user', content: buildPrompt(input) },
                ],
                abortSignal: controller.signal,
                output: Output.object({
                    schema: jsonSchema(prepareSchemaForProvider(sandboxProposalSchema, input.settings.provider)),
                }),
            }),
            {
                settings: input.settings,
                primaryModelId: modelId,
                label: `sandboxTransformationAttempt${input.attempt}`,
                abortSignal: controller.signal,
            },
        );
        const proposal = normalizeProposal(result.output);
        const errors = validateSandboxProposal(proposal);
        if (errors.length > 0) throw new Error(`sandbox_proposal_invalid:${errors.join(',')}`);
        return proposal;
    } finally {
        clearTimeout(timer);
        input.abortSignal?.removeEventListener('abort', onAbort);
    }
};
