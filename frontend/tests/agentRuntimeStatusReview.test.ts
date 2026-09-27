// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const reviewDocPath = path.join(process.cwd(), 'docs', 'agent-runtime-status-review.md');
const reviewDoc = fs.readFileSync(reviewDocPath, 'utf8');

describe('agent runtime status review', () => {
    it('documents the single production follow-up owner after cutover', () => {
        [
            'Status: Cutover complete',
            'Agent Runtime JavaScript is the only production follow-up loop owner.',
            '`services/agent/runtime/agrun/followUpRuntimeService.ts`',
            '`services/agent/runtime/agrun/followUpRuntimeAdapter.ts`',
            '`services/agent/runtime/agrun/checkpointCoordinator.ts`',
            '`services/agent/runtime/agrun/clarificationCompatibility.ts`',
            'No runtime-selection feature flag or hidden',
        ].forEach(snippet => {
            expect(reviewDoc).toContain(snippet);
        });
    });

    it('keeps initial analysis explicitly outside the follow-up cutover', () => {
        expect(reviewDoc).toContain('The initial analysis path remains separate');
        expect(reviewDoc).toContain('`services/agent/runtime/dataAnalysisSessionRunner.ts`');
        expect(reviewDoc).toContain('`services/agent/runtime/dataInvestigationHarness.ts`');
    });
});
