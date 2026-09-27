import { describe, expect, it } from 'vitest';
import type { WorkspaceFile } from '../types';
import { buildWorkspaceTree, diffWorkspaceFiles, grepWorkspaceFiles, headWorkspaceFile } from '../services/agent/workspaceRetrieval';

const files: WorkspaceFile[] = [
    {
        path: '/dataset/raw.csv',
        label: 'raw.csv',
        language: 'csv',
        content: 'Region,Revenue\nEast,100\nWest,200\n',
        group: 'dataset',
        badges: ['virtual', 'generated'],
    },
    {
        path: '/dataset/cleaned.csv',
        label: 'cleaned.csv',
        language: 'csv',
        content: 'Region,Revenue\nEast,100\nWest,250\n',
        group: 'dataset',
        badges: ['virtual', 'generated', 'editable'],
    },
    {
        path: '/workspace/notes.md',
        label: 'notes.md',
        language: 'markdown',
        content: '# Notes\nRevenue changed for West\n',
        group: 'workspace',
        badges: ['virtual', 'editable'],
    },
];

describe('workspaceRetrieval', () => {
    it('builds a tree for the virtual workspace', () => {
        const tree = buildWorkspaceTree(files, '/');
        expect(tree.map(node => node.name)).toEqual(expect.arrayContaining(['dataset', 'workspace']));
    });

    it('returns line-level grep matches', () => {
        const matches = grepWorkspaceFiles(files, '/', 'Revenue', 10, false);
        expect(matches[0]).toEqual(expect.objectContaining({
            path: '/dataset/raw.csv',
            line: 1,
        }));
    });

    it('returns the head of a file', () => {
        const head = headWorkspaceFile(files[0], 2);
        expect(head.lines).toHaveLength(2);
        expect(head.lines[0].content).toContain('Region,Revenue');
    });

    it('returns a compact diff between files', () => {
        const diff = diffWorkspaceFiles('/dataset/raw.csv', files[0].content, '/dataset/cleaned.csv', files[1].content, 10);
        expect(diff.changedLines).toBeGreaterThan(0);
        expect(diff.hunks[0].right).toContain('West,250');
    });
});
