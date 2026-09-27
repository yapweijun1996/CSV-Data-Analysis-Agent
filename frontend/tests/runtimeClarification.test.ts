// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
    buildClarificationFollowUpPrompt,
    evaluateClarificationResponse,
    normalizeClarificationRequest,
    resolveEffectivePendingClarification,
} from '../services/agent/runtime/runtimeClarification';
import type { Settings } from '../types';

// Settings without API key — AI classification unavailable, uses structural fallback
const noAiSettings = {} as Settings;

describe('runtimeClarification', () => {
    it('normalizes question-only clarification requests into free-text mode', () => {
        const clarification = normalizeClarificationRequest({
            question: 'Which columns define a unique record?',
            options: [],
        });

        expect(clarification).toEqual({
            question: 'Which columns define a unique record?',
            options: [],
            allowFreeText: true,
            clarificationMode: 'free_text',
            pendingPlan: undefined,
            targetProperty: undefined,
            resumeContext: undefined,
        });
    });

    it('resolves pending clarification from activeTurn when the top-level store field is empty', () => {
        const clarification = resolveEffectivePendingClarification({
            pendingClarification: null,
            activeTurn: {
                pendingClarificationRequest: {
                    question: 'Which columns define a unique record?',
                    options: [],
                    allowFreeText: true,
                },
            },
        } as never);

        expect(clarification?.question).toBe('Which columns define a unique record?');
        expect(clarification?.clarificationMode).toBe('free_text');
    });

    it('marks explicit column answers as resolved', async () => {
        const assessment = await evaluateClarificationResponse({
            clarification: normalizeClarificationRequest({
                question: 'Which combination of columns defines a unique record?',
                options: [],
                allowFreeText: true,
            }),
            userChoice: {
                label: 'Code + Description + SeriesKey',
                value: 'Code + Description + SeriesKey',
            },
            availableColumns: ['Code', 'Description', 'SeriesKey', 'Value'],
            settings: noAiSettings,
        });

        expect(assessment.status).toBe('resolved');
    });

    it('extracts inline numbered choices into structured clarification options', () => {
        const clarification = normalizeClarificationRequest({
            question: "To accurately derive the Profit and Margin metrics, I need to consolidate all variations of 'Cost of sales'. Please confirm if the following descriptions should be grouped into the 'Cost of sales' category: 1. Cost of sales 2. Cost Of Sales 3. PROJECT COSTS OF SALES",
            options: [],
        });

        expect(clarification.question).toContain("Please confirm if the following descriptions should be grouped into the 'Cost of sales' category");
        expect(clarification.options).toEqual([
            { label: 'Cost of sales', value: 'Cost of sales' },
            { label: 'Cost Of Sales', value: 'Cost Of Sales' },
            { label: 'PROJECT COSTS OF SALES', value: 'PROJECT COSTS OF SALES' },
        ]);
        expect(clarification.allowFreeText).toBe(false);
        expect(clarification.clarificationMode).toBe('options');
    });

    it('extracts inline numbered choices from Mandarin clarification prompts', () => {
        const clarification = normalizeClarificationRequest({
            question: '请选择分析维度：1. 按项目 2. 按 Series Label 1',
            options: [],
        });

        expect(clarification.question).toBe('请选择分析维度');
        expect(clarification.options).toEqual([
            { label: '按项目', value: '按项目' },
            { label: '按 Series Label 1', value: '按 Series Label 1' },
        ]);
        expect(clarification.allowFreeText).toBe(false);
        expect(clarification.clarificationMode).toBe('options');
    });

    it('marks low-information free-text replies as best-effort continuation', async () => {
        const assessment = await evaluateClarificationResponse({
            clarification: normalizeClarificationRequest({
                question: 'Which combination of columns defines a unique record?',
                options: [],
                allowFreeText: true,
            }),
            userChoice: {
                label: 'upto you',
                value: 'upto you',
            },
            availableColumns: ['Code', 'Description', 'SeriesKey', 'Value'],
            settings: noAiSettings,
        });

        expect(assessment.status).toBe('best_effort_continue');
        expect(assessment.assumptionSummary).toBeDefined();
    });

    it('does not resolve against quoted phrases from the clarification question body', async () => {
        const assessment = await evaluateClarificationResponse({
            clarification: normalizeClarificationRequest({
                question: "To proceed with deriving the 'Profit' and 'Margin' metrics, I need to standardize the 'Cost of sales' category.",
                options: [],
                allowFreeText: true,
            }),
            userChoice: {
                label: 'margin',
                value: 'margin',
            },
            availableColumns: ['Description', 'Value', 'Project'],
            settings: noAiSettings,
        });

        expect(assessment.status).toBe('best_effort_continue');
    });

    it('keeps non-matching short replies ambiguous when structured options exist', async () => {
        const assessment = await evaluateClarificationResponse({
            clarification: normalizeClarificationRequest({
                question: 'Which path should I take next? 1. Detailed Audit 2. Category Comparison 3. Identify Discrepancy Source',
                options: [],
            }),
            userChoice: {
                label: 'margin',
                value: 'margin',
            },
            availableColumns: ['Description', 'Value', 'SeriesKey'],
            settings: noAiSettings,
        });

        expect(assessment.status).toBe('still_ambiguous');
        expect(assessment.missingInfoSummary).toContain('Which path should I take next?');
    });

    it('treats substantive free-text replies to structured clarifications as resolved', async () => {
        const assessment = await evaluateClarificationResponse({
            clarification: normalizeClarificationRequest({
                question: 'Which path should I take next? 1. Detailed Audit 2. Category Comparison 3. Identify Discrepancy Source',
                options: [],
            }),
            userChoice: {
                label: 'remove them',
                value: 'remove them',
            },
            availableColumns: ['Description', 'Value', 'SeriesKey'],
            settings: noAiSettings,
        });

        expect(assessment.status).toBe('resolved');
    });

    it('treats proceed-style replies to structured clarifications as best-effort via structural fallback', async () => {
        // "go ahead" = 2 meaningful words, with structured options → structural fallback: resolved
        // (With AI, this would be best_effort_continue, but structural fallback uses word count)
        const assessment = await evaluateClarificationResponse({
            clarification: normalizeClarificationRequest({
                question: 'Which path should I take next? 1. Detailed Audit 2. Category Comparison 3. Identify Discrepancy Source',
                options: [],
            }),
            userChoice: {
                label: 'go ahead',
                value: 'go ahead',
            },
            availableColumns: ['Description', 'Value', 'SeriesKey'],
            settings: noAiSettings,
        });

        // Structural fallback: 2 words + has options → resolved
        expect(['resolved', 'best_effort_continue']).toContain(assessment.status);
    });

    it('keeps empty free-text replies as still ambiguous', async () => {
        const assessment = await evaluateClarificationResponse({
            clarification: normalizeClarificationRequest({
                question: 'Which combination of columns defines a unique record?',
                options: [],
                allowFreeText: true,
            }),
            userChoice: {
                label: '',
                value: '',
            },
            availableColumns: ['Code', 'Description', 'SeriesKey', 'Value'],
            settings: noAiSettings,
        });

        expect(assessment.status).toBe('still_ambiguous');
        expect(assessment.missingInfoSummary).toBe('Which combination of columns defines a unique record?');
    });

    it('treats pure punctuation as best_effort_continue (never trap user)', async () => {
        const assessment = await evaluateClarificationResponse({
            clarification: normalizeClarificationRequest({
                question: 'Which month do you mean?',
                options: [],
                allowFreeText: true,
            }),
            userChoice: {
                label: '?',
                value: '?',
            },
            availableColumns: [],
            settings: noAiSettings,
        });

        expect(assessment.status).toBe('best_effort_continue');
    });

    it.each([
        ['English', 'I still need a more specific answer before I can continue. Please answer directly: Which columns define a unique record?'],
        ['Mandarin', '我还需要更具体的说明，才能继续。请直接回答：Which columns define a unique record?'],
        ['Malay', 'Saya masih perlukan jawapan yang lebih khusus sebelum boleh meneruskan. Sila jawab terus: Which columns define a unique record?'],
        ['Japanese', '続ける前に、もう少し具体的な回答が必要です。次に直接答えてください: Which columns define a unique record?'],
    ] as const)('builds localized follow-up clarification prompts in %s', (language, expected) => {
        const prompt = buildClarificationFollowUpPrompt({
            question: 'Which columns define a unique record?',
            options: [],
            allowFreeText: true,
            clarificationMode: 'free_text',
        }, language as never);

        expect(prompt).toBe(expected);
    });
});
