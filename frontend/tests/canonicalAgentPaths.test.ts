// @vitest-environment node

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('canonical agent paths', () => {
    it('removes legacy root-level agent orchestrator shims in favor of canonical orchestration paths', () => {
        expect(existsSync(resolve(process.cwd(), 'services/agent/chatOrchestrator.ts'))).toBe(false);
        expect(existsSync(resolve(process.cwd(), 'services/agent/analysisOrchestrator.ts'))).toBe(false);
    });

    it('keeps one production initial-analysis entry and removes the direct orchestrator', () => {
        expect(existsSync(resolve(
            process.cwd(),
            'services/agent/orchestration/initialAnalysisService.ts',
        ))).toBe(true);
        expect(existsSync(resolve(
            process.cwd(),
            'services/agent/orchestration/analysisOrchestrator.ts',
        ))).toBe(false);
    });
});
