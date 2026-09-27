import type { Settings, ReportFindingSection } from '../../types';

export const escapeHtml = (value: unknown): string =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

export const titleCase = (value: string): string =>
    value
        .split(/[_\s]+/)
        .filter(Boolean)
        .map(token => token.charAt(0).toUpperCase() + token.slice(1))
        .join(' ');

export const dedupeStrings = (values: Array<string | null | undefined>): string[] => {
    const seen = new Set<string>();
    const output: string[] = [];

    for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (!normalized) {
            continue;
        }

        const key = normalized.toLowerCase();
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        output.push(normalized);
    }

    return output;
};

const SEMANTIC_STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'over', 'under', 'than',
    'are', 'was', 'were', 'been', 'being', 'has', 'have', 'had', 'but', 'can', 'will',
    'should', 'could', 'would', 'their', 'there', 'them', 'then', 'such', 'very', 'more',
    'most', 'some', 'many', 'few', 'our', 'your', 'its', 'it', 'a', 'an', 'of', 'to', 'in',
    'on', 'by', 'or', 'is', 'as', 'at', 'be', 'we', 'they', 'these', 'those',
]);

export const tokenizeSemanticText = (value: string): string[] =>
    String(value ?? '')
        .toLowerCase()
        .replace(/<[^>]+>/g, ' ')
        .replace(/[^a-z0-9\s]+/g, ' ')
        .split(/\s+/)
        .map(token => token.trim())
        .filter(token => token.length > 2 && !SEMANTIC_STOP_WORDS.has(token));

export const isSemanticallySimilar = (left: string, right: string, threshold = 0.72): boolean => {
    const normalizedLeft = String(left ?? '').trim().toLowerCase();
    const normalizedRight = String(right ?? '').trim().toLowerCase();
    if (!normalizedLeft || !normalizedRight) {
        return false;
    }
    if (normalizedLeft === normalizedRight) {
        return true;
    }

    const leftTokens = new Set(tokenizeSemanticText(left));
    const rightTokens = new Set(tokenizeSemanticText(right));
    if (leftTokens.size === 0 || rightTokens.size === 0) {
        return false;
    }

    let overlap = 0;
    leftTokens.forEach(token => {
        if (rightTokens.has(token)) {
            overlap += 1;
        }
    });

    return overlap / Math.min(leftTokens.size, rightTokens.size) >= threshold;
};

export const filterBusinessFindingSections = (
    sections: ReportFindingSection[],
    existingClaims: string[],
): ReportFindingSection[] => {
    const seenClaims = [...existingClaims];

    return sections
        .map(section => ({
            ...section,
            items: section.items.filter(item => {
                const claim = String(item.claim ?? '').trim();
                if (!claim) {
                    return false;
                }
                if (seenClaims.some(existing => isSemanticallySimilar(existing, claim))) {
                    return false;
                }
                seenClaims.push(claim);
                return true;
            }),
        }))
        .filter(section => section.items.length > 0);
};

export const chunk = <T,>(items: T[], size: number): T[][] => {
    const groups: T[][] = [];

    for (let index = 0; index < items.length; index += size) {
        groups.push(items.slice(index, index + size));
    }

    return groups;
};

export const isLongText = (value: string, threshold = 220): boolean => String(value ?? '').trim().length > threshold;

export const normalizeReportTemplate = (
    template: Settings['reportTemplate'] | undefined,
): 'executive_brief' | 'management_review' | 'audit_appendix' => {
    if (template === 'audit_appendix') {
        return 'audit_appendix';
    }
    if (template === 'management_review') {
        return 'management_review';
    }
    return 'executive_brief';
};
