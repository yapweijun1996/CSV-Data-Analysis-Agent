import type { WorkspaceFile } from '../../types';

type WorkspaceTreeNode = {
    name: string;
    path: string;
    type: 'directory' | 'file';
    children?: WorkspaceTreeNode[];
};

const normalizePath = (path: string) => path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';

const splitLines = (content: string) => content.replace(/\r\n/g, '\n').split('\n');

const getScopedFiles = (files: WorkspaceFile[], basePath: string) => {
    const scope = normalizePath(basePath);
    if (scope === '/') return files;
    return files.filter(file => file.path === scope || file.path.startsWith(`${scope}/`));
};

export const buildWorkspaceTree = (files: WorkspaceFile[], basePath = '/'): WorkspaceTreeNode[] => {
    const root: WorkspaceTreeNode = { name: '/', path: '/', type: 'directory', children: [] };

    getScopedFiles(files, basePath).forEach(file => {
        const parts = normalizePath(file.path).split('/').filter(Boolean);
        let current = root;
        let currentPath = '';

        parts.forEach((part, index) => {
            currentPath = `${currentPath}/${part}`;
            const isFile = index === parts.length - 1;
            let next = current.children?.find(child => child.name === part);
            if (!next) {
                next = {
                    name: part,
                    path: currentPath,
                    type: isFile ? 'file' : 'directory',
                    children: isFile ? undefined : [],
                };
                current.children?.push(next);
            }
            current = next;
        });
    });

    const sortNodes = (nodes: WorkspaceTreeNode[]) => {
        nodes.sort((left, right) => {
            if (left.type !== right.type) {
                return left.type === 'directory' ? -1 : 1;
            }
            return left.name.localeCompare(right.name);
        });
        nodes.forEach(node => {
            if (node.children) sortNodes(node.children);
        });
    };

    sortNodes(root.children ?? []);
    return root.children ?? [];
};

export const grepWorkspaceFiles = (
    files: WorkspaceFile[],
    basePath: string,
    query: string,
    limit: number,
    caseSensitive: boolean,
) => {
    const needle = caseSensitive ? query : query.toLowerCase();
    const matches: Array<{ path: string; line: number; snippet: string }> = [];

    for (const file of getScopedFiles(files, basePath)) {
        const lines = splitLines(file.content);
        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index];
            const haystack = caseSensitive ? line : line.toLowerCase();
            if (!haystack.includes(needle)) continue;
            matches.push({
                path: file.path,
                line: index + 1,
                snippet: line.trim().slice(0, 240),
            });
            if (matches.length >= limit) {
                return matches;
            }
        }
    }

    return matches;
};

export const headWorkspaceFile = (file: WorkspaceFile, limit: number) => {
    const lines = splitLines(file.content);
    return {
        path: file.path,
        totalLines: lines.length,
        lines: lines.slice(0, Math.max(1, limit)).map((line, index) => ({
            line: index + 1,
            content: line,
        })),
    };
};

export const diffWorkspaceFiles = (
    leftPath: string,
    leftContent: string,
    rightPath: string,
    rightContent: string,
    limit = 20,
) => {
    const leftLines = splitLines(leftContent);
    const rightLines = splitLines(rightContent);
    const maxLines = Math.max(leftLines.length, rightLines.length);
    const hunks: Array<{ line: number; left: string; right: string }> = [];

    for (let index = 0; index < maxLines; index += 1) {
        const left = leftLines[index] ?? '';
        const right = rightLines[index] ?? '';
        if (left === right) continue;
        hunks.push({
            line: index + 1,
            left,
            right,
        });
        if (hunks.length >= limit) break;
    }

    return {
        leftPath,
        rightPath,
        changedLines: hunks.length,
        hunks,
    };
};
