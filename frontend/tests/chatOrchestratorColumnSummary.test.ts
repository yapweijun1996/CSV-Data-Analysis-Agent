// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildColumnSummaryForClassifier } from '../services/agent/orchestration/chatOrchestrator';
import type { ColumnProfile } from '../types';

describe('chatOrchestrator query-aware column summary', () => {
    it('prioritizes a standard semantic alias even when its physical column appears late', () => {
        const profiles: ColumnProfile[] = [
            ...Array.from({ length: 45 }, (_, index) => ({
                name: `Verbose Context Column ${index + 1}`,
                type: 'categorical' as const,
            })),
            { name: 'CCY', type: 'categorical' },
            { name: 'Bal Amount', type: 'currency' },
        ];

        const summary = buildColumnSummaryForClassifier(
            'What is the total Bal Amount by currency?',
            profiles,
        );

        expect(summary).toMatch(/^CCY \(categorical; aliases: currency, currency code\), Bal Amount/);
    });

    it('does not match short column tokens against unrelated substrings', () => {
        const profiles: ColumnProfile[] = [
            { name: 'ID', type: 'categorical' },
            { name: 'Revenue', type: 'currency' },
        ];

        const summary = buildColumnSummaryForClassifier('Please provide the revenue trend', profiles);

        expect(summary).toMatch(/^Revenue \(/);
    });
});
