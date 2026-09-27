/**
 * CSV row mutation utilities for adversarial testing (Layer 3).
 * All functions are pure — they return new arrays, never mutate input.
 */

/** Remove a single row by index. */
export const removeRow = (rows: string[][], index: number): string[][] =>
    rows.filter((_, i) => i !== index);

/** Insert blank rows at the given positions. Inserts back-to-front to preserve indexes. */
export const insertBlankRows = (rows: string[][], positions: number[]): string[][] => {
    const result = rows.map(r => [...r]);
    const colCount = rows[0]?.length ?? 0;
    const blank = Array<string>(colCount).fill('');
    for (const pos of [...positions].sort((a, b) => b - a)) {
        result.splice(pos, 0, [...blank]);
    }
    return result;
};

/** Copy the row at sourceIndex and insert it at targetIndex. */
export const duplicateRowAt = (rows: string[][], sourceIndex: number, targetIndex: number): string[][] => {
    const result = rows.map(r => [...r]);
    result.splice(targetIndex, 0, [...rows[sourceIndex]]);
    return result;
};

/** Keep only the first maxRows rows. */
export const truncateAtRow = (rows: string[][], maxRows: number): string[][] =>
    rows.slice(0, maxRows);

/** Replace all numeric-looking cells with empty string. */
export const clearNumericCells = (rows: string[][]): string[][] =>
    rows.map(row => row.map(cell => /^-?\d[\d,.]*$/.test(cell.trim()) ? '' : cell));
