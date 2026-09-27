import { AppState } from './app';
import type { DatasetLineageManifest } from './lineage';

export interface Report {
    id: string;
    filename: string;
    createdAt: Date;
    updatedAt: Date;
    appState: AppState;
    /**
     * DATA-201 storage manifest. Optional only for backward compatibility with
     * reports written before IndexedDB v9; storage reads normalize it lazily.
     */
    lineage?: DatasetLineageManifest;
}

export interface ReportListItem {
    id: string;
    filename: string;
    createdAt: Date;
    updatedAt: Date;
    reportTitle?: string | null;
    reportDescription?: string | null;
}
