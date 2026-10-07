import { AGGREGATION_TYPES, isAggregationType } from '../../../../types/analysis';
import type { AggregationType, ColumnAdditivity, ColumnProfile, DataAnalysisHypothesis, ResearchPlan, ResearchPlanQuestion } from '../../../../types';

export const MIN_PLAN_QUESTIONS = 2;
export const MAX_PLAN_QUESTIONS = 6;
const MAX_TITLE_CHARS = 140;
const MAX_RATIONALE_CHARS = 300;

// Aggregations that need a numeric column; counting works on any column or on rows.
const NUMERIC_AGGREGATIONS = new Set<AggregationType>(['sum', 'avg', 'median', 'min', 'max', 'percentile']);
const NUMERIC_COLUMN_TYPES = new Set<ColumnProfile['type']>(['numerical', 'currency', 'percentage']);

const readText = (value: unknown, max: number): string =>
    typeof value === 'string' ? value.trim().slice(0, max) : '';

const sameName = (left: string, right: string): boolean =>
    left.trim().toLowerCase() === right.trim().toLowerCase();

const resolveColumn = (name: unknown, columns: readonly ColumnProfile[]): ColumnProfile | null => {
    if (typeof name !== 'string' || !name.trim()) return null;
    return columns.find(column => sameName(column.name, name)) ?? null;
};

export interface ResearchPlanValidation {
    questions: ResearchPlanQuestion[];
    rejected: Array<{ title: string; reason: string }>;
}

/**
 * Checks Pi's proposed questions against the real dataset. The model decides
 * what is worth asking; this only guarantees each question can be executed:
 * known columns, an aggregation that fits the column, no duplicates.
 */
export const validateResearchQuestions = (
    raw: unknown,
    columns: readonly ColumnProfile[],
    maxQuestions = MAX_PLAN_QUESTIONS,
): ResearchPlanValidation => {
    const proposed = Array.isArray((raw as { questions?: unknown })?.questions)
        ? (raw as { questions: unknown[] }).questions
        : [];
    const questions: ResearchPlanQuestion[] = [];
    const rejected: ResearchPlanValidation['rejected'] = [];
    const seen = new Set<string>();

    for (const entry of proposed) {
        const item = (entry ?? {}) as Record<string, unknown>;
        const title = readText(item.title, MAX_TITLE_CHARS);
        const reject = (reason: string) => rejected.push({ title: title || '(untitled)', reason });
        if (!title) { reject('The question has no title.'); continue; }
        if (questions.length >= maxQuestions) { reject(`Only ${maxQuestions} questions are used.`); continue; }

        const dimension = item.dimension === null || item.dimension === undefined || item.dimension === ''
            ? null : resolveColumn(item.dimension, columns);
        if (item.dimension && !dimension) { reject(`Unknown dimension column "${String(item.dimension)}".`); continue; }
        const metric = item.metric === null || item.metric === undefined || item.metric === ''
            ? null : resolveColumn(item.metric, columns);
        if (item.metric && !metric) { reject(`Unknown metric column "${String(item.metric)}".`); continue; }
        if (!dimension && !metric) { reject('The question needs a dimension, a metric, or both.'); continue; }

        const aggregationRaw = item.aggregation === null || item.aggregation === undefined || item.aggregation === ''
            ? null : item.aggregation;
        if (aggregationRaw !== null && !isAggregationType(aggregationRaw)) {
            reject(`Unsupported aggregation "${String(aggregationRaw)}". Use one of ${AGGREGATION_TYPES.join(', ')}.`);
            continue;
        }
        const aggregation = aggregationRaw as AggregationType | null;
        if (metric && !aggregation) { reject('A question with a metric needs an aggregation.'); continue; }
        if (aggregation && NUMERIC_AGGREGATIONS.has(aggregation)) {
            if (!metric) { reject(`"${aggregation}" needs a numeric metric column.`); continue; }
            if (!NUMERIC_COLUMN_TYPES.has(metric.type)) {
                reject(`"${metric.name}" is ${metric.type}, so "${aggregation}" does not apply. Use count or count_distinct.`);
                continue;
            }
        }
        if (dimension && metric && sameName(dimension.name, metric.name)) {
            reject('The dimension and the metric are the same column.'); continue;
        }

        const key = [dimension?.name, metric?.name, aggregation].map(part => (part ?? '').toLowerCase()).join('|');
        if (seen.has(key)) { reject('This duplicates another question.'); continue; }
        seen.add(key);

        questions.push({
            title,
            rationale: readText(item.rationale, MAX_RATIONALE_CHARS),
            dimension: dimension?.name ?? null,
            metric: metric?.name ?? null,
            aggregation,
            comparison: readText(item.comparison, MAX_TITLE_CHARS) || null,
        });
    }
    return { questions, rejected };
};

/** A plan needs enough valid questions to be worth using; otherwise the app plans as before. */
export const buildResearchPlan = (
    validation: ResearchPlanValidation,
    datasetVersion: string,
): ResearchPlan | null =>
    validation.questions.length >= MIN_PLAN_QUESTIONS
        ? { datasetVersion, questions: validation.questions, rejected: validation.rejected, consumed: false }
        : null;

/**
 * The text the later SQL planner sees. It states the chosen measure explicitly
 * ("median of resale_price by town") so that choice survives into the query.
 */
export const buildResearchTopic = (question: ResearchPlanQuestion): string => {
    const measure = question.aggregation
        ? `${question.aggregation}${question.metric ? ` of ${question.metric}` : ''}`
        : question.metric;
    const detail = [measure, question.dimension ? `by ${question.dimension}` : null].filter(Boolean).join(' ');
    return detail ? `${question.title} (${detail})` : question.title;
};

/** The plan is used once, and only for the dataset version it was drafted for. */
export const getUsableResearchPlan = (
    plan: ResearchPlan | null | undefined,
    currentDatasetVersion: string | null,
): ResearchPlan | null =>
    plan && !plan.consumed && currentDatasetVersion !== null && plan.datasetVersion === currentDatasetVersion
        ? plan : null;

/** Gives hypotheses built from plan topics the structured fields Pi chose, instead of re-guessing them from text. */
export const applyPlanToHypotheses = (
    hypotheses: DataAnalysisHypothesis[],
    plan: ResearchPlan,
): DataAnalysisHypothesis[] => {
    const byTopic = new Map(plan.questions.map(question => [buildResearchTopic(question), question]));
    return hypotheses.map(hypothesis => {
        const question = byTopic.get(hypothesis.topic);
        if (!question) return hypothesis;
        return {
            ...hypothesis,
            grain: question.dimension ?? hypothesis.grain,
            metric: question.metric ?? hypothesis.metric,
            comparisonIntent: question.comparison ?? hypothesis.comparisonIntent,
        };
    });
};

const ADDITIVITY_KINDS = new Set<ColumnAdditivity['kind']>(['additive', 'non_additive']);
const ADDITIVITY_NATURES = new Set<ColumnAdditivity['nature']>(['flow', 'stock', 'ratio', 'unit_value', 'other']);
const MAX_ADDITIVITY_ENTRIES = 40;

export interface ColumnAdditivityValidation {
    accepted: Record<string, ColumnAdditivity>;
    rejected: Array<{ column: string; reason: string }>;
}

/**
 * Pi says which numeric columns can be summed; the app keeps only judgements it can
 * stand behind. Unknown or non-numeric columns are dropped, an inconsistent
 * kind/nature pair is rejected, and a percentage column is always non-additive
 * because that is a fact about the data, whatever the model says.
 */
export const validateColumnAdditivity = (
    raw: unknown,
    columns: readonly ColumnProfile[],
): ColumnAdditivityValidation => {
    const entries = Array.isArray(raw) ? raw.slice(0, MAX_ADDITIVITY_ENTRIES) : [];
    const accepted: Record<string, ColumnAdditivity> = {};
    const rejected: ColumnAdditivityValidation['rejected'] = [];
    for (const entry of entries) {
        const item = (entry ?? {}) as Record<string, unknown>;
        const label = typeof item.column === 'string' ? item.column : '(unnamed)';
        const reject = (reason: string) => rejected.push({ column: label, reason });
        const column = resolveColumn(item.column, columns);
        if (!column) { reject('Unknown column.'); continue; }
        if (!NUMERIC_COLUMN_TYPES.has(column.type)) { reject(`"${column.name}" is ${column.type}, not numeric.`); continue; }
        if (!ADDITIVITY_KINDS.has(item.kind as ColumnAdditivity['kind'])) { reject('kind must be additive or non_additive.'); continue; }
        if (!ADDITIVITY_NATURES.has(item.nature as ColumnAdditivity['nature'])) { reject('nature must be flow, stock, ratio, unit_value or other.'); continue; }
        let kind = item.kind as ColumnAdditivity['kind'];
        const nature = item.nature as ColumnAdditivity['nature'];
        // Ratios, unit values and balances at a point in time are not summed across rows.
        if (kind === 'additive' && (nature === 'ratio' || nature === 'unit_value')) {
            reject(`A ${nature} cannot be additive.`); continue;
        }
        if (column.type === 'percentage') kind = 'non_additive';
        accepted[column.name] = { kind, nature, rationale: readText(item.rationale, MAX_RATIONALE_CHARS) };
    }
    return { accepted, rejected };
};

/** Returns the profiles with the accepted additivity judgements attached; other fields are untouched. */
export const applyColumnAdditivity = (
    profiles: readonly ColumnProfile[],
    accepted: Record<string, ColumnAdditivity>,
): ColumnProfile[] =>
    profiles.map(profile => accepted[profile.name] ? { ...profile, additivity: accepted[profile.name] } : profile);
