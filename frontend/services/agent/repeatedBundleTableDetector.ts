import type { CsvData } from '../../types';
import { getColumns } from './reportShapeUtils';

const REPEATED_SUFFIX_PATTERN = /_\d+$/u;
const STRONG_BUNDLE_FAMILY_PATTERN = /^(?:date|number|qty|quantity|uom|amount|status)$/i;

type HeaderGroup = {
    label: string;
    width: number;
};

export type RepeatedBundleTableDetection = {
    isRepeatedBundleTable: boolean;
    repeatedFamilies: string[];
    strongRepeatedFamilies: string[];
    repeatedColumnCount: number;
    descriptorColumnCount: number;
    headerGroupCount: number;
};

const normalizeBaseColumnName = (value: string) =>
    (value.split('::').at(-1) ?? value)
        .replace(REPEATED_SUFFIX_PATTERN, '')
        .trim()
        .toLowerCase();

const getPrimaryHeaderGroups = (data: CsvData | null): HeaderGroup[] => {
    const headerLayer = (data?.headerLayers ?? []).find(row =>
        Array.isArray(row) && row.some(value => String(value ?? '').trim().length > 0),
    );
    if (!headerLayer?.length) {
        return [];
    }

    const groups: HeaderGroup[] = [];
    let activeLabel = '';
    let currentGroup: HeaderGroup | null = null;

    headerLayer.forEach(rawValue => {
        const nextLabel = String(rawValue ?? '').trim();
        if (nextLabel) {
            activeLabel = nextLabel;
        }

        if (!activeLabel) {
            currentGroup = null;
            return;
        }

        if (!currentGroup || currentGroup.label !== activeLabel) {
            currentGroup = {
                label: activeLabel,
                width: 0,
            };
            groups.push(currentGroup);
        }

        currentGroup.width += 1;
    });

    return groups;
};

export const detectRepeatedBundleTable = (data: CsvData | null): RepeatedBundleTableDetection => {
    const columns = getColumns(data);
    if (columns.length < 10) {
        return {
            isRepeatedBundleTable: false,
            repeatedFamilies: [],
            strongRepeatedFamilies: [],
            repeatedColumnCount: 0,
            descriptorColumnCount: columns.length,
            headerGroupCount: 0,
        };
    }

    const familyColumns = columns.reduce<Map<string, string[]>>((groups, column) => {
        const family = normalizeBaseColumnName(column);
        groups.set(family, [...(groups.get(family) ?? []), column]);
        return groups;
    }, new Map());
    const repeatedFamilies = [...familyColumns.entries()]
        .filter(([, familyColumns]) => familyColumns.length >= 3)
        .map(([family]) => family);
    const strongRepeatedFamilies = repeatedFamilies.filter(family => STRONG_BUNDLE_FAMILY_PATTERN.test(family));
    const repeatedFamilySet = new Set(repeatedFamilies);
    const repeatedColumnCount = columns.filter(column => repeatedFamilySet.has(normalizeBaseColumnName(column))).length;
    const descriptorColumnCount = columns.filter(column => !repeatedFamilySet.has(normalizeBaseColumnName(column))).length;

    const headerGroups = getPrimaryHeaderGroups(data);
    const headerGroupCount = headerGroups.length;

    const isRepeatedBundleTable = repeatedFamilies.length >= 3
        && strongRepeatedFamilies.length >= 2
        && repeatedColumnCount >= 8
        && descriptorColumnCount >= 4
        && headerGroupCount >= 3;

    return {
        isRepeatedBundleTable,
        repeatedFamilies,
        strongRepeatedFamilies,
        repeatedColumnCount,
        descriptorColumnCount,
        headerGroupCount,
    };
};

export const isRepeatedAttributeBundleTable = (data: CsvData | null) =>
    detectRepeatedBundleTable(data).isRepeatedBundleTable;
