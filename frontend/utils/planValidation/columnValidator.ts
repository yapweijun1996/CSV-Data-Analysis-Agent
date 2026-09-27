import { ColumnProfile } from '../../types';

export const findCorrectColumnCasing = (colName: string, availableColumns: string[]): string | undefined => {
    if (!colName) return undefined;
    const lowerColName = colName.toLowerCase();
    return availableColumns.find(c => c.toLowerCase() === lowerColName);
};

export const validateColumnExists = (colName: string | undefined, availableColumns: string[]): { normalized: string | undefined; error: string | null } => {
    if (!colName || typeof colName !== 'string') return { normalized: colName, error: null };
    
    const correctCasing = findCorrectColumnCasing(colName, availableColumns);
    
    if (!correctCasing) {
        return { normalized: colName, error: `Invalid column name '${colName}'. Available columns are: [${availableColumns.join(', ')}].` };
    }
    
    return { normalized: correctCasing, error: null };
};
