import type { CsvCellValue, CsvRow } from './intake';
import type { FilterPredicate, FilterRowsOperation } from './operations';

export type SpreadsheetFilterOrigin = 'chat' | 'spreadsheet_panel';

export interface SpreadsheetFilterObservation {
    selectedColumn: string | null;
    operator: FilterPredicate['operator'] | null;
    value: CsvCellValue | CsvCellValue[] | null;
    matchedRowCount: number;
    previewRows: CsvRow[];
}

export interface ActiveSpreadsheetFilter {
    requestId: string;
    origin: SpreadsheetFilterOrigin;
    query: string;
    operation: FilterRowsOperation;
    observation: SpreadsheetFilterObservation;
    finalReply: string;
    appliedAt: Date;
}
