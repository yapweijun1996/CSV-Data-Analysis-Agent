import type { CsvData, CsvRow } from '../../types';

export const WORKSPACE_DATASET_CLEAN_CSV = '/dataset/cleaned.csv';
export const WORKSPACE_DATASET_RAW_CSV = '/dataset/raw.csv';
export const WORKSPACE_REPORT_CONTEXT_JSON = '/workspace/report_context.json';
export const WORKSPACE_ROOT = '/workspace';
export const WORKSPACE_INTAKE_IR_JSON = '/intake/report_intake_ir.json';
export const WORKSPACE_RUNTIME_TABLE_ASSESSMENT_JSON = '/cleaning/runtime_table_assessment.json';

const WORKSPACE_READ_PREFIXES = [
    '/session/',
    '/intake/',
    '/cleaning/',
    '/analysis/',
    '/chat/',
    '/context/',
    '/logs/',
    '/dataset/',
    `${WORKSPACE_ROOT}/`,
];
const DEFAULT_CSV_DELIMITER = ',';

const splitCsvLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        const next = line[i + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                current += '"';
                i += 1;
                continue;
            }
            inQuotes = !inQuotes;
            continue;
        }

        if (char === DEFAULT_CSV_DELIMITER && !inQuotes) {
            values.push(current);
            current = '';
            continue;
        }

        current += char;
    }
    values.push(current);

    return values;
};

const splitCsvLines = (text: string): string[] => {
    const normalized = text.replace(/\r\n/g, '\n');
    const rows: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < normalized.length; i += 1) {
        const char = normalized[i];
        const next = normalized[i + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                current += '"';
                i += 1;
                continue;
            }
            inQuotes = !inQuotes;
            current += char;
            continue;
        }

        if (char === '\n' && !inQuotes) {
            rows.push(current);
            current = '';
            continue;
        }

        current += char;
    }

    rows.push(current);
    return rows.filter(row => row.length > 0 || rows.length === 1);
};

const normalizeCsvCell = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1).replace(/""/g, '"');
    }
    return value;
};

const inferCsvCell = (value: string): CsvRow[string] => {
    const trimmed = value.trim();
    if (trimmed === '') return '';
    if (trimmed.toLowerCase() === 'null') return null;
    const parsedNumber = Number(trimmed);
    if (!Number.isNaN(parsedNumber) && trimmed === String(parsedNumber)) return parsedNumber;
    if (trimmed.toLowerCase() === 'true') return true;
    if (trimmed.toLowerCase() === 'false') return false;
    return trimmed;
};

const clampAndJoin = (pathParts: string[]): string => {
    const normalizedParts = pathParts
        .map(part => part.trim())
        .filter(part => part && part !== '.');

    if (normalizedParts.some(part => part === '..')) {
        return '';
    }

    return `/${normalizedParts.join('/')}`;
};

export const normalizeWorkspacePath = (rawPath: string): string => {
    if (!rawPath || !rawPath.trim()) return '';
    const pathWithoutQuery = rawPath.split(/[?#]/)[0].replace(/\\/g, '/').trim();
    const withoutLeading = pathWithoutQuery.startsWith('/')
        ? pathWithoutQuery
        : `/${pathWithoutQuery}`;
    const normalized = clampAndJoin(withoutLeading.split('/').filter(Boolean));
    if (!normalized) return '';
    return normalized === '/' ? '/' : normalized.replace(/\/$/, '');
};

export const isWorkspaceDatasetFile = (path: string): boolean =>
    path === WORKSPACE_DATASET_CLEAN_CSV
    || path === WORKSPACE_DATASET_RAW_CSV;

export const isWorkspaceReadablePath = (path: string): boolean => {
    if (!path) return false;
    const normalized = normalizeWorkspacePath(path);
    if (!normalized) return false;
    return normalized === WORKSPACE_ROOT
        || WORKSPACE_READ_PREFIXES.some(prefix => normalized === prefix.replace(/\/$/, '') || normalized.startsWith(prefix));
};

export const isWorkspaceWritablePath = (path: string): boolean => {
    const normalized = normalizeWorkspacePath(path);
    if (!normalized) return false;
    if (normalized === WORKSPACE_ROOT) return false;
    return normalized.startsWith(`${WORKSPACE_ROOT}/`) || normalized === WORKSPACE_DATASET_CLEAN_CSV;
};

export const isWorkspaceDatasetWritePath = (path: string): boolean =>
    path === WORKSPACE_DATASET_CLEAN_CSV;

export const getWorkspaceFileLanguage = (path: string): 'json' | 'ndjson' | 'markdown' | 'text' | 'javascript' | 'csv' => {
    const lower = path.toLowerCase();
    if (lower.endsWith('.json')) return 'json';
    if (lower.endsWith('.ndjson')) return 'ndjson';
    if (lower.endsWith('.md')) return 'markdown';
    if (lower.endsWith('.csv')) return 'csv';
    if (lower.endsWith('.js') || lower.endsWith('.ts')) return 'javascript';
    return 'text';
};

export const WORKSPACE_HISTORY_LIMIT = 100;
export const WORKSPACE_ACTION_OUTPUT_LIMIT = 3000;
export const WORKSPACE_SEARCH_DEFAULT_LIMIT = 25;
export const WORKSPACE_SEARCH_MAX_LIMIT = 120;
export const WORKSPACE_LIST_LIMIT = 200;

export const buildWorkspaceCsv = (data: CsvData | null): string => {
    if (!data || !Array.isArray(data.data) || data.data.length === 0) {
        return '';
    }

    const columns = new Set<string>();
    data.data.forEach(row => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return;
        Object.keys(row).forEach(column => columns.add(column));
    });
    const headers = [...columns];
    if (headers.length === 0) {
        return '';
    }

    const escapeCsvCell = (value: unknown) => {
        const text = value === null || value === undefined ? '' : String(value);
        const escaped = text.replace(/"/g, '""');
        return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
    };

    const lines = [headers.map(escapeCsvCell).join(',')];
    data.data.forEach(row => {
        const values = headers.map(header => escapeCsvCell(row?.[header]));
        lines.push(values.join(','));
    });
    return `${lines.join('\n')}\n`;
};

export const parseWorkspaceCsv = (text: string): CsvRow[] => {
    const lines = splitCsvLines(String(text || ''));
    if (lines.length === 0) {
        return [];
    }

    const parsedRows = lines.map(line => splitCsvLine(line).map(normalizeCsvCell));
    const headers = parsedRows[0].map(header => header.trim());
    if (headers.length === 0 || headers.every(header => !header)) {
        throw new Error('CSV payload must include a header row.');
    }

    return parsedRows.slice(1).reduce<CsvRow[]>((acc, row) => {
        const hasValue = row.some(cell => String(cell).trim().length > 0);
        if (!hasValue) return acc;

        const record: CsvRow = {};
        headers.forEach((header, index) => {
            const raw = index < row.length ? row[index] : '';
            const cell = raw === undefined ? '' : inferCsvCell(raw);
            record[header] = cell;
        });
        acc.push(record);
        return acc;
    }, []);
};

export const truncateWorkspaceOutput = (value: string, maxLength = WORKSPACE_ACTION_OUTPUT_LIMIT) =>
    value.length <= maxLength ? value : `${value.slice(0, maxLength)}\n... [truncated at ${maxLength} chars]`;
