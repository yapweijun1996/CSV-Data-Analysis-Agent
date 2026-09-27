import type { ColumnProfile, CsvData } from '../../types';
import { profileDataLightweight } from '../data/dataProfiler';
import { collectOrderedColumnNames } from '../data/columnRegistry';

const normalizeHeader = (value: string) => value.trim().toLowerCase();

export const datasetColumnsMatchProfiles = (
    dataset: CsvData | null | undefined,
    columnProfiles: ColumnProfile[] | null | undefined,
): boolean => {
    if (!dataset?.data?.length || !Array.isArray(columnProfiles) || columnProfiles.length === 0) {
        return false;
    }

    const datasetColumns = collectOrderedColumnNames(dataset.data).map(normalizeHeader);
    const profileColumns = columnProfiles.map(profile => normalizeHeader(profile.name));
    if (datasetColumns.length !== profileColumns.length) {
        return false;
    }

    return datasetColumns.every((column, index) => column === profileColumns[index]);
};

export const resolveAnalysisDatasetProfiles = (
    dataset: CsvData | null | undefined,
    existingProfiles: ColumnProfile[] | null | undefined,
): ColumnProfile[] => {
    if (!dataset?.data?.length) {
        return Array.isArray(existingProfiles) ? existingProfiles : [];
    }

    if (datasetColumnsMatchProfiles(dataset, existingProfiles)) {
        return existingProfiles ?? [];
    }

    return profileDataLightweight(dataset.data).profiles;
};
