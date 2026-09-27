import type {
    AiCleaningProgramResult,
    CleaningStrategyCandidate,
    CleaningStrategyRequirement,
    ColumnProfile,
    CsvData,
    CsvRow,
    DataPreparationPlan,
    DataPreparationRuntimeContext,
    Settings,
} from '../../types';
import { generateDataPreparationPlan } from './dataPreparer';
import { createAiCleaningProgramFromPlan } from '../agent/execution/aiCleaningProgram';
import { createId } from '../../utils/createId';

/** Hard timeout for a single cleaning LLM call to prevent indefinite hangs. */
const CLEANING_LLM_TIMEOUT_MS = 60_000;

const deriveRequirements = (plan: DataPreparationPlan): CleaningStrategyRequirement[] => {
    const requirements = new Set<CleaningStrategyRequirement>();
    if (plan.operations.some(operation => operation.type === 'annotate_hierarchy')) {
        requirements.add('hierarchical_shape');
    }
    if (plan.operations.some(operation => operation.type === 'unpivot_columns')) {
        requirements.add('wide_shape');
        requirements.add('label_preservation');
    }
    return [...requirements];
};

const toCandidate = (
    plan: DataPreparationPlan,
    fallbackColumns: ColumnProfile[],
    source: CleaningStrategyCandidate['source'],
    priority: number,
    intentSummary: string,
): CleaningStrategyCandidate => {
    const outputColumns = plan.outputColumns.length > 0 ? plan.outputColumns : fallbackColumns;
    const program = createAiCleaningProgramFromPlan(plan, outputColumns);
    return {
        strategyId: createId(`cleaning-${source}`),
        source,
        program,
        plan,
        intentSummary,
        requires: deriveRequirements(plan),
        priority,
    };
};

export const generateAiCleaningProgram = async (
    columns: ColumnProfile[],
    sampleData: CsvRow[],
    settings: Settings,
    lastError?: Error,
    sourceData?: CsvData | null,
    runtimeContext?: DataPreparationRuntimeContext,
): Promise<AiCleaningProgramResult> => {
    const primaryAbort = new AbortController();
    const primaryTimer = setTimeout(() => primaryAbort.abort(), CLEANING_LLM_TIMEOUT_MS);
    let plan: DataPreparationPlan;
    try {
        plan = await generateDataPreparationPlan(columns, sampleData, settings, lastError, undefined, sourceData, runtimeContext, { abortSignal: primaryAbort.signal });
    } finally {
        clearTimeout(primaryTimer);
    }
    const primary = toCandidate(
        plan,
        columns,
        'agent_primary',
        1,
        'Primary AI cleaning strategy for the current working dataset.',
    );
    const candidates: CleaningStrategyCandidate[] = [primary];

    const shouldGenerateSafeRetry = (runtimeContext?.iterationContext?.round ?? 1) > 1 && (
        primary.requires.includes('hierarchical_shape')
        || Boolean(lastError?.message?.includes('hierarchical statement shape'))
        || Boolean(runtimeContext?.disallowedStrategyRequirements?.includes('hierarchical_shape'))
    );

    if (shouldGenerateSafeRetry) {
        const safeAbort = new AbortController();
        const safeTimer = setTimeout(() => safeAbort.abort(), CLEANING_LLM_TIMEOUT_MS);
        let safePlan: DataPreparationPlan;
        try {
            safePlan = await generateDataPreparationPlan(
                columns,
                sampleData,
                settings,
                lastError,
                undefined,
                sourceData,
                {
                    ...runtimeContext,
                    disallowedStrategyRequirements: [
                        ...(runtimeContext?.disallowedStrategyRequirements ?? []),
                        'hierarchical_shape',
                    ],
                },
                {
                    allowHierarchyAnnotationFallback: false,
                    allowInternalRetry: false,
                    maxAttempts: 1,
                    abortSignal: safeAbort.signal,
                },
            );
        } finally {
            clearTimeout(safeTimer);
        }
        candidates.push(toCandidate(
            safePlan,
            columns,
            'agent_retry',
            2,
            'Agent-safe retry that avoids hierarchy-only fallback paths on the current working dataset.',
        ));
    }

    candidates.sort((left, right) => left.priority - right.priority);
    return {
        primary,
        candidates,
    };
};
