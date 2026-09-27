import type {
    ActiveDataQuery,
    CsvData,
    DatasetSemanticSnapshot,
    DuckDbSessionStatus,
} from '../../types';
import {
    buildSemanticDatasetVersion,
    isSemanticSnapshotCurrentForData,
    resolveSemanticDefaultCsvData,
} from './datasetSemantics';
import { getCsvDatasetLoadVersion } from '../../utils/datasetId';

export type DatasetBindingMode = 'cleaning' | 'workspace' | 'analysis';

export interface DatasetBindingTarget {
    mode: DatasetBindingMode;
    dataset: CsvData;
    datasetVersion: string;
    semanticDatasetApplied: boolean;
    semanticDatasetCurrent: boolean;
}

export const resolveDatasetBindingTarget = ({
    mode,
    csvData,
    snapshot,
    semanticDatasetVersion,
}: {
    mode: DatasetBindingMode;
    csvData: CsvData | null | undefined;
    snapshot: DatasetSemanticSnapshot | null | undefined;
    semanticDatasetVersion: string | null | undefined;
}): DatasetBindingTarget | null => {
    if (!csvData) {
        return null;
    }

    if (mode === 'cleaning') {
        return {
            mode,
            dataset: csvData,
            datasetVersion: buildSemanticDatasetVersion(csvData),
            semanticDatasetApplied: false,
            semanticDatasetCurrent: false,
        };
    }

    const semanticDatasetCurrent = isSemanticSnapshotCurrentForData(csvData, snapshot, semanticDatasetVersion);
    const semanticDataset = resolveSemanticDefaultCsvData(csvData, snapshot, semanticDatasetVersion);
    const dataset = semanticDataset ?? csvData;

    return {
        mode,
        dataset,
        datasetVersion: buildSemanticDatasetVersion(dataset),
        semanticDatasetApplied: dataset !== csvData,
        semanticDatasetCurrent,
    };
};

export const isDuckDbSessionCurrentForDataset = (
    status: DuckDbSessionStatus | null | undefined,
    dataset: CsvData | null | undefined,
): boolean => Boolean(
    status
    && dataset
    && status.engine === 'duckdb'
    && status.tableName
    && status.loadVersion
    && status.loadVersion === getCsvDatasetLoadVersion(dataset),
);

export const isActiveDataQueryCurrentForDataset = (
    query: ActiveDataQuery | null | undefined,
    dataset: CsvData | null | undefined,
): boolean => Boolean(
    query
    && dataset
    && query.engine === 'duckdb'
    && query.tableName
    && query.loadVersion
    && query.loadVersion === getCsvDatasetLoadVersion(dataset),
);

export const resolveCurrentDuckDbBinding = ({
    mode,
    csvData,
    snapshot,
    semanticDatasetVersion,
    sessionStatus,
    activeDataQuery,
}: {
    mode: Exclude<DatasetBindingMode, 'cleaning'>;
    csvData: CsvData | null | undefined;
    snapshot: DatasetSemanticSnapshot | null | undefined;
    semanticDatasetVersion: string | null | undefined;
    sessionStatus: DuckDbSessionStatus | null | undefined;
    activeDataQuery: ActiveDataQuery | null | undefined;
}): { tableName: string; loadVersion: string } | null => {
    const bindingTarget = resolveDatasetBindingTarget({
        mode,
        csvData,
        snapshot,
        semanticDatasetVersion,
    });

    if (!bindingTarget) {
        return null;
    }

    if (isDuckDbSessionCurrentForDataset(sessionStatus, bindingTarget.dataset)) {
        return {
            tableName: sessionStatus!.tableName!,
            loadVersion: sessionStatus!.loadVersion!,
        };
    }

    if (isActiveDataQueryCurrentForDataset(activeDataQuery, bindingTarget.dataset)) {
        return {
            tableName: activeDataQuery!.tableName!,
            loadVersion: activeDataQuery!.loadVersion!,
        };
    }

    return null;
};
