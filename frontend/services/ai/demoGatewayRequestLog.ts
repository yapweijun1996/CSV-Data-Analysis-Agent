/**
 * In-memory log of the requests the Default gateway boundary sends, so a run's request budget can be
 * attributed to the part of the app that spent it. Records shape only (never message text or data):
 * the first words of the instructions, tool names, structured-output schema name and input size.
 * Read it in the browser console with `__demoGatewayLog()`.
 */

export interface DemoGatewayLogEntry {
    atMs: number;
    /** First words of the system instructions; identifies the caller. */
    caller: string;
    tools: string[];
    schema: string;
    inputItems: number;
}

const MAX_ENTRIES = 300;
const entries: DemoGatewayLogEntry[] = [];

const firstWords = (value: unknown): string =>
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 70) : '';

/** The system prompt travels as the first system/developer input item for Pi and the AI SDK. */
const systemPromptStart = (body: Record<string, unknown>): string => {
    if (typeof body.instructions === 'string' && body.instructions.trim()) return firstWords(body.instructions);
    if (!Array.isArray(body.input)) return '';
    const item = body.input.find(candidate => candidate && typeof candidate === 'object'
        && ['system', 'developer'].includes(String((candidate as { role?: unknown }).role)));
    const content = (item as { content?: unknown } | undefined)?.content;
    if (typeof content === 'string') return firstWords(content);
    if (Array.isArray(content)) {
        const text = content.find(part => part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string');
        return firstWords((text as { text?: string } | undefined)?.text);
    }
    return '';
};

export const recordDemoGatewayRequest = (body: Record<string, unknown>): void => {
    const tools = Array.isArray(body.tools)
        ? body.tools.map(tool => (tool && typeof tool === 'object' && typeof (tool as { name?: unknown }).name === 'string'
            ? (tool as { name: string }).name : '')).filter(Boolean)
        : [];
    const format = (body.text as { format?: { name?: unknown } } | undefined)?.format;
    entries.push({
        atMs: Date.now(),
        caller: systemPromptStart(body),
        tools,
        schema: typeof format?.name === 'string' ? format.name : '',
        inputItems: Array.isArray(body.input) ? body.input.length : 0,
    });
    if (entries.length > MAX_ENTRIES) entries.shift();
};

export const readDemoGatewayLog = (): readonly DemoGatewayLogEntry[] => entries;

export const clearDemoGatewayLog = (): void => {
    entries.length = 0;
};

if (typeof globalThis !== 'undefined') {
    (globalThis as { __demoGatewayLog?: () => readonly DemoGatewayLogEntry[] }).__demoGatewayLog = readDemoGatewayLog;
}
