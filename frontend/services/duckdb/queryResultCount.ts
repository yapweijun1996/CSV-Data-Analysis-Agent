export const inferCompleteResultRowCount = (
    returnedRows: number,
    appliedLimit: number,
): number | null => {
    if (!Number.isInteger(returnedRows) || returnedRows < 0) return null;
    if (!Number.isInteger(appliedLimit) || appliedLimit <= 0) return null;
    return returnedRows < appliedLimit ? returnedRows : null;
};
