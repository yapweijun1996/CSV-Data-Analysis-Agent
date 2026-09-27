// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const architectureDocPath = path.join(process.cwd(), 'docs', 'architecture.md');
const architectureDoc = fs.readFileSync(architectureDocPath, 'utf8');

describe('architecture patterns documentation', () => {
    it('documents the reviewed codebase patterns with canonical sections', () => {
        [
            '## Key architecture patterns',
            '### 1. Deterministic shell with bounded AI runtime',
            '### 2. Slice-composed global state with session rehydration',
            '### 3. Stage-oriented orchestration pipeline',
            '### 4. Planner/executor split with SQL-first analysis',
            '### 5. Chart type resolution pipeline',
            '### 6. Manifest-first tool governance',
            '### 7. Agent Runtime JavaScript as a bounded state machine',
            '### 8. Browser-first data plane with worker-backed compute',
            '### 9. Typed evidence-to-artifact reporting pipeline',
        ].forEach(section => {
            expect(architectureDoc).toContain(section);
        });
    });

    it('anchors each documented pattern to active files and call flows', () => {
        [
            '`index.tsx`, `App.tsx`, and `store/useAppStore.ts`',
            '`services/agent/orchestration/fileOrchestrator.ts`, `services/agent/orchestration/initialAnalysisService.ts`, and `services/agent/orchestration/chatOrchestrator.ts`',
            '`fileOrchestrator.ts` -> `fileProcessor.ts` -> `initialAnalysisService.ts` -> `agrun/initialAnalysisRuntimeService.ts` -> manifest-derived stage executors -> `dataAnalysisSessionRunner.ts`',
            '`store/slices/chatSlice.ts` -> `chatOrchestrator.ts` -> `agrun/followUpRuntimeService.ts`',
            '`goalProposer.ts`, `planGenerator.ts`, and `topicProcessor.ts`',
            '`sqlCardExecutor.ts` for SQL-backed plans and `cardExecutor.ts` for non-SQL materialization',
            '`services/agent/tools/manifests/*`',
            '`toolRegistry.ts` and `toolGovernance.ts`',
            '`services/agent/runtime/agrun/followUpRuntimeService.ts`',
            '`services/data/*`',
            '`services/duckdb/*`',
            '`services/workers/dataWorkerClient.ts`, `services/workers/duckDbWorkerClient.ts`',
            '`buildReportEvidenceBundle.ts` -> `generateAnalystMemo.ts` -> `generateForumSummary.ts` -> `buildReportIr.ts` -> `renderHtmlReport.ts` -> `reportArtifactStorage.ts`',
        ].forEach(snippet => {
            expect(architectureDoc).toContain(snippet);
        });
    });
});
