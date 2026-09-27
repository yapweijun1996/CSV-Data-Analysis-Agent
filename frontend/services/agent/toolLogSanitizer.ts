import type { ToolName } from '../../types';

const PREVIEW_LIMIT = 120;

const summarizeText = (value: unknown) => {
    const text = typeof value === 'string' ? value : String(value ?? '');
    const normalizedPreview = text.replace(/\s+/g, ' ').trim().slice(0, PREVIEW_LIMIT);
    return {
        charCount: text.length,
        lineCount: text.length === 0 ? 0 : text.split(/\r?\n/).length,
        preview: normalizedPreview,
    };
};

const sanitizeWorkspaceReplace = (args: Record<string, any>) => {
    const before = summarizeText(args.oldText);
    const after = summarizeText(args.newText);
    return {
        path: args.path,
        replaceAll: Boolean(args.replaceAll),
        diffSummary: `replace ${before.lineCount} line(s) / ${before.charCount} chars with ${after.lineCount} line(s) / ${after.charCount} chars`,
        oldTextSummary: before,
        newTextSummary: after,
    };
};

const sanitizeWorkspaceWrite = (args: Record<string, any>, mode: 'write' | 'append') => ({
    path: args.path,
    mode,
    contentSummary: summarizeText(args.content),
});

export const sanitizeToolLogDetail = (
    toolName: ToolName | 'assistant_message' | 'context_manager' | 'workspace_builder' | 'duckdb_query_engine' | 'tool_registry',
    detail: Record<string, any> | undefined,
): Record<string, any> | undefined => {
    if (!detail) {
        return detail;
    }

    switch (toolName) {
        case 'workspace.replace':
            return sanitizeWorkspaceReplace(detail);
        case 'workspace.write':
            return sanitizeWorkspaceWrite(detail, 'write');
        case 'workspace.append':
            return sanitizeWorkspaceWrite(detail, 'append');
        default:
            return detail;
    }
};
