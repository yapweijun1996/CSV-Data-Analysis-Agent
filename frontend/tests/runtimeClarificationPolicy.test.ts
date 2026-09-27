// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
    parseClarificationResumeMessage,
    resolveClarificationIntentMessage,
} from '../services/agent/runtime/runtimeClarificationPolicy';

describe('runtimeClarificationPolicy', () => {
    it('keeps substantive selections as the resumed intent for weak-origin requests', () => {
        const resume = parseClarificationResumeMessage(`Continue the original request using the user clarification below.
Original user request: hi
Clarification question: Hello! I'm here to help with your FY2010 sales analysis. Would you like to proceed with the quarterly sales trend breakdown for the top 3 customers, or is there another specific aspect of the data (such as product performance or brand concentration) you'd like to investigate?
Selected option: tell me more EQPM
Clarification assessment: resolved
Do not ask the same clarification again unless a new ambiguity remains.`);

        expect(resolveClarificationIntentMessage(resume)).toBe('tell me more EQPM');
    });

    it('derives intent from clarification context instead of bare proceed labels', () => {
        const resume = parseClarificationResumeMessage(`Continue the original request using the user clarification below.
Original user request: hi
Clarification question: Hello! I'm here to help with your FY2010 sales analysis. Would you like to proceed with the quarterly sales trend breakdown for the top 3 customers, or is there another specific aspect of the data (such as product performance or brand concentration) you'd like to investigate?
Selected option: agree
Clarification assessment: best_effort_continue
Do not ask the same clarification again unless a new ambiguity remains.`);

        const intent = resolveClarificationIntentMessage(resume);

        expect(intent).not.toBe('agree');
        expect(intent).toContain('quarterly sales trend breakdown');
        expect(intent).toContain('User clarification reply: agree');
    });

    it('prefers the preserved selected path when the reply defers the decision', () => {
        const resume = parseClarificationResumeMessage(`Continue the original request using the user clarification below.
Original user request: continue
Clarification question: Which path should I take next?
Selected option: up to you
Selected path: Evaluate Project Financial Performance
Clarification assessment: best_effort_continue
Do not ask the same clarification again unless a new ambiguity remains.`);

        expect(resolveClarificationIntentMessage(resume)).toBe('Evaluate Project Financial Performance');
    });

    it('keeps substantive replies that start with anything as the resumed intent', () => {
        const resume = parseClarificationResumeMessage(`Continue the original request using the user clarification below.
Original user request: hi
Clarification question: What should I analyze next?
Selected option: anything about profit by project
Clarification assessment: resolved
Do not ask the same clarification again unless a new ambiguity remains.`);

        expect(resolveClarificationIntentMessage(resume)).toBe('anything about profit by project');
    });

    it('keeps substantive replies that start with whatever as the resumed intent', () => {
        const resume = parseClarificationResumeMessage(`Continue the original request using the user clarification below.
Original user request: continue
Clarification question: What should I analyze next?
Selected option: whatever has the biggest variance
Clarification assessment: resolved
Do not ask the same clarification again unless a new ambiguity remains.`);

        expect(resolveClarificationIntentMessage(resume)).toBe('whatever has the biggest variance');
    });
});
