const CODE = /^mcp_[a-z_]+(?::\d+)?$/;

/** Host error codes are the only text allowed to reach the UI; remote bodies and URLs may carry credentials. */
export const mcpErrorCode = (error: unknown): string | undefined => {
    for (let e: unknown = error, depth = 0; e && depth < 5; depth++) {
        if (e instanceof TypeError && /Invalid URL/i.test(e.message)) return 'mcp_invalid_configuration';
        if (e instanceof Error && CODE.test(e.message)) return e.message;
        e = (e as { cause?: unknown }).cause;
    }
    return undefined;
};
