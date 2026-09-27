import { describe, expect, it } from 'vitest';
import { createGoalCandidatesPrompt } from '../services/prompts/goalPrompts';

describe('createGoalCandidatesPrompt', () => {
    it('tells goal generation to use report title and parameter lines as semantic context', () => {
        const prompt = createGoalCandidatesPrompt('Report context goes here.');

        expect(prompt).toContain('Look at the report title, parameter lines');
        expect(prompt).toContain('If the report title or parameter lines reveal the reporting scope, period, or filters');
        expect(prompt).toContain('Do not invent extra scope that is not explicitly present');
    });
});
