// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

const collectTypeScript = (directory: string): string[] => {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return collectTypeScript(entryPath);
        return /\.(?:ts|tsx)$/.test(entry.name) ? [entryPath] : [];
    });
};

describe('AGRUN-012 single-owner cutover', () => {
    it('keeps removed legacy entrypoints absent', () => {
        [
            'services/agent/runtime/runtimeLoop.ts',
            'services/agent/runtime/runtimeResume.ts',
            'services/agent/orchestration/chatCompletion.ts',
            'services/ai/chatResponder.ts',
        ].forEach(relativePath => {
            expect(fs.existsSync(path.join(root, relativePath))).toBe(false);
        });
    });

    it('contains no production runtime-selection flag or legacy loop reference', () => {
        const productionRoots = [
            'services',
            'store',
            'components',
            'hooks',
            'config',
            'types',
            'utils',
        ];
        const productionSource = productionRoots
            .flatMap(directory => collectTypeScript(path.join(root, directory)))
            .map(filePath => fs.readFileSync(filePath, 'utf8'))
            .join('\n');

        [
            'runAgentTurn',
            'isAgrunFollowUpRuntimeEnabled',
            'enableAgrunFollowUpRuntime',
            'AGRUN_DEV_FLAG_STORAGE_KEY',
        ].forEach(legacySymbol => {
            expect(productionSource).not.toContain(legacySymbol);
        });
    });

    it('routes eligible follow-up turns directly to Agrun', () => {
        const orchestrator = fs.readFileSync(
            path.join(
                root,
                'services/agent/orchestration/chatOrchestrator.ts',
            ),
            'utf8',
        );

        expect(orchestrator).toContain('runAgrunFollowUpTurn');
        expect(orchestrator).toContain(
            "'../runtime/agrun/followUpRuntimeService'",
        );
    });
});
