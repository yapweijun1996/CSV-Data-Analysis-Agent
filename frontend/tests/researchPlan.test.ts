// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
    applyPlanToHypotheses,
    buildResearchPlan,
    buildResearchTopic,
    getUsableResearchPlan,
    validateResearchQuestions,
} from '../services/agent/runtime/pi/researchPlan';
import type { ColumnProfile, DataAnalysisHypothesis, ResearchPlan } from '../types';

const columns = [
    { name: 'town', type: 'categorical' },
    { name: 'resale_price', type: 'currency' },
    { name: 'floor_area', type: 'numerical' },
] as unknown as ColumnProfile[];

const good = (overrides: Record<string, unknown> = {}) => ({
    title: 'Typical price by town',
    rationale: 'Prices are skewed.',
    dimension: 'Town',
    metric: 'resale_price',
    aggregation: 'median',
    ...overrides,
});

describe('validateResearchQuestions', () => {
    it('resolves column names case-insensitively and keeps valid questions', () => {
        const { questions, rejected } = validateResearchQuestions({ questions: [good()] }, columns);
        expect(rejected).toEqual([]);
        expect(questions[0]).toMatchObject({ dimension: 'town', metric: 'resale_price', aggregation: 'median' });
    });

    it('rejects unknown columns, numeric aggregation on text, and duplicates with reasons', () => {
        const { questions, rejected } = validateResearchQuestions({
            questions: [
                good(),
                good({ title: 'Dup' }),
                good({ title: 'Bad col', dimension: 'nope' }),
                good({ title: 'Sum of text', dimension: null, metric: 'town', aggregation: 'sum' }),
                good({ title: 'Metric without aggregation', aggregation: null }),
            ],
        }, columns);
        expect(questions).toHaveLength(1);
        expect(rejected.map(item => item.title)).toEqual(['Dup', 'Bad col', 'Sum of text', 'Metric without aggregation']);
    });

    it('caps the number of questions', () => {
        const many = Array.from({ length: 4 }, (_, index) =>
            good({ title: `Q${index}`, metric: 'floor_area', aggregation: ['sum', 'avg', 'min', 'max'][index] }));
        expect(validateResearchQuestions({ questions: many }, columns, 2).questions).toHaveLength(2);
    });

    it('tolerates malformed input', () => {
        expect(validateResearchQuestions(null, columns).questions).toEqual([]);
        expect(validateResearchQuestions({ questions: ['x', null] }, columns).questions).toEqual([]);
    });
});

describe('research plan helpers', () => {
    const questions = validateResearchQuestions({
        questions: [good(), good({ title: 'Area by town', metric: 'floor_area', aggregation: 'avg', comparison: 'town vs town' })],
    }, columns).questions;

    it('builds a plan only with enough valid questions', () => {
        expect(buildResearchPlan({ questions: questions.slice(0, 1), rejected: [] }, 'v1')).toBeNull();
        expect(buildResearchPlan({ questions, rejected: [] }, 'v1')).toMatchObject({ datasetVersion: 'v1', consumed: false });
    });

    it('states the chosen measure in the topic text', () => {
        expect(buildResearchTopic(questions[0])).toBe('Typical price by town (median of resale_price by town)');
    });

    it('only hands out an unconsumed plan for the matching dataset version', () => {
        const plan = buildResearchPlan({ questions, rejected: [] }, 'v1') as ResearchPlan;
        expect(getUsableResearchPlan(plan, 'v1')).toBe(plan);
        expect(getUsableResearchPlan(plan, 'v2')).toBeNull();
        expect(getUsableResearchPlan({ ...plan, consumed: true }, 'v1')).toBeNull();
        expect(getUsableResearchPlan(null, 'v1')).toBeNull();
    });

    it('copies the planned fields onto matching hypotheses', () => {
        const plan = buildResearchPlan({ questions, rejected: [] }, 'v1') as ResearchPlan;
        const hypotheses = [
            { topic: buildResearchTopic(questions[1]), grain: 'x', metric: 'y' },
            { topic: 'other', grain: 'keep', metric: 'keep' },
        ] as unknown as DataAnalysisHypothesis[];
        const [planned, untouched] = applyPlanToHypotheses(hypotheses, plan);
        expect(planned).toMatchObject({ grain: 'town', metric: 'floor_area', comparisonIntent: 'town vs town' });
        expect(untouched).toMatchObject({ grain: 'keep', metric: 'keep' });
    });
});
