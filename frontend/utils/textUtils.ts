/**
 * Extracts potential column names from a string of text by comparing against a list of available columns.
 * This is a heuristic approach and works best for simple cases.
 *
 * @param text The text to search within (e.g., an analysis topic).
 * @param availableColumns The list of valid column names in the dataset.
 * @returns An array of unique column names found in the text.
 */
export const extractColumnNamesFromText = (text: string, availableColumns: string[]): string[] => {
    if (!text || !availableColumns || availableColumns.length === 0) {
        return [];
    }

    const foundColumns = new Set<string>();
    const lowerText = text.toLowerCase();

    // Sort columns by length descending to match longer names first (e.g., "Product Category" before "Product")
    const sortedColumns = [...availableColumns].sort((a, b) => b.length - a.length);

    sortedColumns.forEach(col => {
        const lowerCol = col.toLowerCase();
        // Create a regex that allows for spaces, underscores, or hyphens to be used interchangeably.
        // E.g., "product_category" can be matched by "product category" or "product-category".
        const pattern = lowerCol.replace(/[\s_-]+/g, '[\\s_-]+');
        const regex = new RegExp(`\\b${pattern}\\b`, 'g');
        
        if (regex.test(lowerText)) {
            foundColumns.add(col);
        }
    });

    return Array.from(foundColumns);
};

const stripInlineMarkdown = (text: string): string => text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

export const extractSummaryLines = (markdown: string): string[] => {
    if (!markdown.trim()) {
        return [];
    }

    const extracted: string[] = [];
    const lines = markdown.split(/\r?\n/);
    let inCodeBlock = false;

    for (const rawLine of lines) {
        const trimmed = rawLine.trim();

        if (!trimmed || trimmed === '---') {
            continue;
        }

        if (trimmed.startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            continue;
        }

        if (inCodeBlock || /^#{1,6}\s+/.test(trimmed) || trimmed.startsWith('|')) {
            continue;
        }

        if (/^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
            const cleaned = stripInlineMarkdown(trimmed.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, ''));
            if (cleaned) {
                extracted.push(cleaned);
            }
            continue;
        }

        const cleaned = stripInlineMarkdown(trimmed);
        if (!cleaned) {
            continue;
        }

        cleaned
            .split(/(?<=[.!?。！？])\s+/)
            .map(segment => segment.trim())
            .filter(Boolean)
            .forEach(segment => extracted.push(segment));
    }

    return extracted;
};

export const buildSummaryPreviewLines = (markdown: string, maxLines = 3): string[] =>
    extractSummaryLines(markdown).slice(0, maxLines);
