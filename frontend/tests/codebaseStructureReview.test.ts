// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const sourceRoots = ['components', 'config', 'hooks', 'services', 'store', 'tests', 'types', 'utils'];
const importPattern = /\b(?:import|export)\b[\s\S]*?\bfrom\s+['"]([^'"]+)['"]/g;
const reviewDocPath = path.join(repoRoot, 'docs', 'codebase-structure-review.md');
const reviewDoc = fs.readFileSync(reviewDocPath, 'utf8');

const prohibitedDuplicateTargets = new Set([
    'components/AnalysisCard.tsx',
    'components/shared/ErrorBoundary.tsx',
    'components/shared/MarkdownRenderer.tsx',
    'components/shared/DataTable.tsx',
    'components/shared/AiTaskStatusBubble.tsx',
    'components/modals/agent-monitor/AgentMemoryView.tsx',
    'components/modals/agent-monitor/DatasetKnowledgeView.tsx',
]);

const candidateExtensions = ['.ts', '.tsx', '.js', '.jsx'];

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

const extractImports = (filePath: string): string[] => {
    const content = fs.readFileSync(path.join(repoRoot, filePath), 'utf8');
    return Array.from(content.matchAll(importPattern)).map(match => match[1]);
};

const resolveImportTarget = (importerPath: string, specifier: string): string | null => {
    if (!specifier.startsWith('.')) {
        return null;
    }

    const importerDir = path.dirname(path.join(repoRoot, importerPath));
    const baseTarget = path.resolve(importerDir, specifier);
    const candidates = [
        baseTarget,
        ...candidateExtensions.map(extension => `${baseTarget}${extension}`),
        ...candidateExtensions.map(extension => path.join(baseTarget, `index${extension}`)),
    ];

    const resolved = candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!resolved) {
        return null;
    }

    return path.relative(repoRoot, resolved).replace(/\\/g, '/');
};

describe('codebase structure review', () => {
    it('records the reviewed structural risks and active paths', () => {
        [
            '## Findings',
            '### 1. Divergent duplicate UI families still exist in the active tree',
            '### 2. Ownership docs do not fully describe active service folders',
            '### 3. The duplicate `src/` tree was removed',
            '`components/analysis-card/AnalysisCard.tsx`',
            '`services/persistence/persistedAppState.ts`',
            '`services/utils/copyText.ts`',
            'The retired `src/` root must not be recreated.',
        ].forEach(snippet => {
            expect(reviewDoc).toContain(snippet);
        });
        expect(fs.existsSync(path.join(repoRoot, 'src'))).toBe(false);
    });

    it('keeps active source imports on canonical UI paths instead of duplicate component copies', () => {
        const violations: string[] = [];

        collectSourceFiles('.').forEach(filePath => {
            if (!sourceRoots.some(root => filePath === root || filePath.startsWith(`${root}${path.sep}`))) {
                return;
            }

            extractImports(filePath).forEach(specifier => {
                const resolvedTarget = resolveImportTarget(filePath, specifier);
                if (resolvedTarget && prohibitedDuplicateTargets.has(resolvedTarget)) {
                    violations.push(`${filePath}: ${specifier} -> ${resolvedTarget}`);
                }
            });
        });

        expect(violations).toEqual([]);
    });
});
