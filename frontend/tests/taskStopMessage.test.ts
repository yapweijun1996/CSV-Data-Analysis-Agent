import { describe, expect, it } from 'vitest';
import { describeTaskStop } from '../services/agent/runtime/pi/taskStopMessage';

const LANGUAGES = ['English', 'Mandarin', 'Spanish', 'Japanese', 'French', 'Malay', 'Vietnamese'];

describe('describeTaskStop', () => {
    it.each(['toolCalls', 'providerTurns', 'activeMs', 'providerOutput'])('has friendly copy for %s in every language', dimension => {
        const seen = new Set<string>();
        for (const language of LANGUAGES) {
            const text = describeTaskStop(`task_budget_exhausted:${dimension}`, language)!;
            expect(text).toBeTruthy();
            expect(text).not.toContain('task_budget_exhausted');
            expect(text).not.toBe(`task_stop_${dimension}`);
            seen.add(text);
        }
        expect(seen.size).toBe(LANGUAGES.length);
    });
    it('leaves unknown reasons to the technical fallback', () => {
        expect(describeTaskStop('coding_no_progress', 'English')).toBeNull();
        expect(describeTaskStop(undefined, 'English')).toBeNull();
    });
});
