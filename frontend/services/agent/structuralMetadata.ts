import type { ColumnProfile } from '../../types';

export const STRUCTURAL_METADATA_COLUMNS = [
    'RowClass',
    'RowRole',
    'ResolvedRowRole',
    'HierarchyDepth',
    'SourceRowIndex',
] as const;

export type StructuralMetadataColumn = typeof STRUCTURAL_METADATA_COLUMNS[number];

const STRUCTURAL_METADATA_TYPES: Record<StructuralMetadataColumn, ColumnProfile['type']> = {
    RowClass: 'categorical',
    RowRole: 'categorical',
    ResolvedRowRole: 'categorical',
    HierarchyDepth: 'numerical',
    SourceRowIndex: 'numerical',
};

const STRUCTURAL_METADATA_LOOKUP = new Set(
    STRUCTURAL_METADATA_COLUMNS.map(column => column.toLowerCase()),
);

const normalizeColumnName = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

export const isStructuralMetadataColumn = (name: string): boolean =>
    STRUCTURAL_METADATA_LOOKUP.has(normalizeColumnName(name));

export const getStructuralMetadataType = (
    name: StructuralMetadataColumn,
): ColumnProfile['type'] => STRUCTURAL_METADATA_TYPES[name];

export const ensureStructuralMetadataOutputColumns = (
    outputColumns: ColumnProfile[],
    columns: StructuralMetadataColumn[] = [...STRUCTURAL_METADATA_COLUMNS],
): ColumnProfile[] => {
    let nextColumns = [...outputColumns];

    for (const column of columns) {
        if (nextColumns.some(candidate => normalizeColumnName(candidate.name) === normalizeColumnName(column))) {
            continue;
        }
        nextColumns = [
            ...nextColumns,
            {
                name: column,
                type: getStructuralMetadataType(column),
            },
        ];
    }

    return nextColumns;
};
