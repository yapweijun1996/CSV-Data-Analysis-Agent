import type { CsvRow, SandboxTransformationOutput } from '../../types';

const tableRowsByBundle = new Map<string, Map<string, CsvRow[]>>();

export const registerSandboxTableRows = (
    bundleId: string,
    output: SandboxTransformationOutput,
): void => {
    tableRowsByBundle.set(bundleId, new Map(output.tables.map(table => [
        table.tableId,
        table.rows.map(row => ({ ...row })),
    ])));
};

export const getSandboxTableRows = (
    bundleId: string,
    tableId: string,
): CsvRow[] | null => tableRowsByBundle.get(bundleId)?.get(tableId)?.map(row => ({ ...row })) ?? null;

export const clearSandboxTableRows = (bundleId?: string | null): void => {
    if (bundleId) {
        tableRowsByBundle.delete(bundleId);
        return;
    }
    tableRowsByBundle.clear();
};
