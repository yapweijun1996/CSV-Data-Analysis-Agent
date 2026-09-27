import { describe, expect, it } from 'vitest';
import {
    buildAnalysisPlannerSystemPrompt,
    buildPlanRetryFeedback,
    buildTopicPlanningUserPrompt,
    createAnalysisTopicsPrompt,
    createSqlPresentationPlanPrompt,
    SEMANTIC_TYPE_REFERENCE,
} from '../services/prompts/analysisPrompts';

describe('analysisPrompts', () => {
    it('tells topic generation to use dynamic blocked dimensions instead of hardcoded names', () => {
        const prompt = createAnalysisTopicsPrompt(
            'Available columns: SeriesLabelL1, Value, Description',
            null,
            ['Description', 'SeriesLabelL1'],
        );

        // Should reference blocked dimensions dynamically, not hardcode column names
        expect(prompt).toContain('blocked dimensions');
        expect(prompt).toContain('Available non-blocked groupBy dimensions');
        expect(prompt).toContain('Description');
        // Should NOT hardcode specific column names as always-blocked
        expect(prompt).not.toContain('Do NOT use blocked/technical dimensions as groupBy (SeriesLabelL1');
    });

    it('splits planner prompts into stable system rules and user evidence instructions', () => {
        const systemPrompt = buildAnalysisPlannerSystemPrompt('evidence_query');
        const userPrompt = buildTopicPlanningUserPrompt(
            'Revenue by Project',
            'Available columns: SeriesLabelL1, Value, Description',
            '',
        );

        expect(systemPrompt).toContain('produce a valid evidence query first');
        expect(systemPrompt).toContain('Do not decide the final chart before the query evidence is stable');
        expect(userPrompt).toContain('Do not decide chartType yet');
        expect(userPrompt).toContain('Do not return bindings, defaultTopN, or defaultHideOthers');
        expect(userPrompt).toContain('query.select must explicitly include every output column or aggregate alias used later');
        expect(userPrompt).not.toContain('total_revenue');
    });

    it('turns binding errors into focused retry feedback', () => {
        const retryFeedback = buildPlanRetryFeedback('bindings.valueColumn must reference a dataset column or aggregate alias: total_revenue');

        expect(retryFeedback).toContain('referenced a value binding that was not present');
        expect(retryFeedback).toContain('only use aliases that appear in query.select');
    });

    it('includes harness interpretation guidance in the topics system prompt', () => {
        const systemPrompt = buildAnalysisPlannerSystemPrompt('topics');

        expect(systemPrompt).toContain('parent-child hierarchies');
        expect(systemPrompt).toContain('metric relationships');
        expect(systemPrompt).toContain('semantic categories');
        expect(systemPrompt).toContain('data quality warnings');
        expect(systemPrompt).toContain('Return one JSON object');
    });

    it('exports a semantic type reference with key financial categories', () => {
        expect(SEMANTIC_TYPE_REFERENCE).toContain('Revenue');
        expect(SEMANTIC_TYPE_REFERENCE).toContain('Cost');
        expect(SEMANTIC_TYPE_REFERENCE).toContain('Profit');
        expect(SEMANTIC_TYPE_REFERENCE).toContain('Identifier');
        expect(SEMANTIC_TYPE_REFERENCE).toContain('Do NOT use as groupBy');
    });

    it('embeds the semantic type reference in the topics system prompt', () => {
        const systemPrompt = buildAnalysisPlannerSystemPrompt('topics');

        expect(systemPrompt).toContain('Column semantic categories');
        expect(systemPrompt).toContain('Revenue');
        expect(systemPrompt).toContain('Identifier');
    });

    it('defines presentation planning after evidence has already been executed', () => {
        const prompt = createSqlPresentationPlanPrompt(
            'Project profitability',
            'Executed output columns: Project, total_revenue, total_cost',
            'rowCount=8; columns=Project,total_revenue,total_cost',
        );

        expect(buildAnalysisPlannerSystemPrompt('presentation')).toContain('present already-executed SQL evidence');
        expect(prompt).toContain('presentationMode');
        expect(prompt).toContain('Only choose "combo" when the executed query already exposes two stable metric aliases');
        expect(prompt).toContain('prefer "table" over forcing a chart');
    });

    it('includes review context with value gate and contamination guidance in presentation prompt', () => {
        const reviewContext = [
            'Value gate decision: table_only',
            'Value gate reason codes: hierarchy_contamination',
            'Blocked dimensions: SeriesKey',
            'Business grain confidence: low',
        ].join('\n    ');

        const prompt = createSqlPresentationPlanPrompt(
            'Revenue by project',
            'Executed output columns: Project, total_revenue',
            'rowCount=5; columns=Project,total_revenue',
            reviewContext,
        );

        expect(prompt).toContain('Review context:');
        expect(prompt).toContain('Value gate decision: table_only');
        expect(prompt).toContain('hierarchy_contamination');
        expect(prompt).toContain('Blocked dimensions: SeriesKey');
    });

    it('tells the AI to bind only to executed output columns, not full dataset columns', () => {
        const prompt = createSqlPresentationPlanPrompt(
            'Revenue by project',
            'Executed output columns: Project, total_revenue',
            'rowCount=5; columns=Project,total_revenue',
        );

        expect(prompt).toContain('executed output columns');
        expect(prompt).toContain('do NOT reference dataset columns that are not in the evidence output');
    });
});
