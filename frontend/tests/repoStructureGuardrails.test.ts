// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoots = ['components', 'config', 'hooks', 'services', 'store', 'tests', 'types', 'utils'];
const importPattern = /\b(?:import|export)\b[\s\S]*?\bfrom\s+['"]([^'"]+)['"]/g;

const removedDuplicateFiles = [
    'services/agent/goalProposer.ts',
    'services/agent/planGenerator.ts',
    'services/agent/plannerAgent.ts',
    'services/agent/fileOrchestrator.ts',
    'services/agent/topicProcessor.ts',
    'services/agent/sessionManager.ts',
    'services/agent/summaryManager.ts',
    'services/agent/agentMonitor.ts',
    'services/agent/monitorAgent.ts',
    'services/agent/memoryManager.ts',
    'services/agent/cardRetrieval.ts',
    'services/agent/agentMemoryCollector.ts',
    'services/agent/cardExecutor.ts',
    'services/agent/cardCreator.ts',
    'services/agent/executors/aggregationCore.ts',
    'services/agent/executors/aggregationExecutor.ts',
    'services/agent/executors/aggregationHelpers.ts',
    'services/agent/executors/nonAggregatingExecutor.ts',
];

const prohibitedImportFragments = [
    ...removedDuplicateFiles.map(filePath => filePath.replace(/^services\/agent\//, 'services/agent/')),
    'services/agent/executors/',
];

const collectSourceFiles = (relativeDir: string): string[] => {
    const absoluteDir = path.join(repoRoot, relativeDir);
    if (!fs.existsSync(absoluteDir)) {
        return [];
    }

    return fs.readdirSync(absoluteDir, { withFileTypes: true }).flatMap(entry => {
        const relativePath = path.join(relativeDir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'sample project for study only') {
                return [];
            }
            return collectSourceFiles(relativePath);
        }

        if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
            return [];
        }

        return [relativePath];
    });
};

const extractImports = (filePath: string) => {
    const content = fs.readFileSync(path.join(repoRoot, filePath), 'utf8');
    return Array.from(content.matchAll(importPattern)).map(match => match[1]);
};

describe('repo structure guardrails', () => {
    it('removes retired root-level agent duplicates and executor mirrors', () => {
        removedDuplicateFiles.forEach(filePath => {
            expect(fs.existsSync(path.join(repoRoot, filePath)), `${filePath} should be removed`).toBe(false);
        });
    });

    it('does not import retired root-level agent paths or mirrored executor paths', () => {
        const violations: string[] = [];

        collectSourceFiles('.').forEach(filePath => {
            if (!sourceRoots.some(root => filePath === root || filePath.startsWith(`${root}${path.sep}`))) {
                return;
            }

            extractImports(filePath).forEach(specifier => {
                const normalizedSpecifier = specifier.replace(/\\/g, '/');
                if (prohibitedImportFragments.some(fragment => normalizedSpecifier.includes(fragment))) {
                    violations.push(`${filePath}: ${specifier}`);
                }
            });
        });

        expect(violations).toEqual([]);
    });

    it('keeps active source imports out of the legacy src tree', () => {
        const violations: string[] = [];

        collectSourceFiles('.').forEach(filePath => {
            if (!sourceRoots.some(root => filePath === root || filePath.startsWith(`${root}${path.sep}`))) {
                return;
            }

            extractImports(filePath).forEach(specifier => {
                const normalizedSpecifier = specifier.replace(/\\/g, '/');
                if (/^(?:\.\.\/|\.\/)*src\//.test(normalizedSpecifier) || normalizedSpecifier.includes('/src/')) {
                    violations.push(`${filePath}: ${specifier}`);
                }
            });
        });

        expect(violations).toEqual([]);
    });
});
