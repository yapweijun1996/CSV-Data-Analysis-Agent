import type {
    UnpivotColumnsOperation,
    UnpivotHierarchyDepthMapping,
    UnpivotLabelColumn,
    UnpivotLabelMapping,
} from '../../../types';

const isValidLabelMapping = (mapping: UnpivotLabelMapping | null | undefined): mapping is UnpivotLabelMapping =>
    Boolean(mapping?.sourceColumn);

const isValidLabelColumn = (labelColumn: UnpivotLabelColumn | null | undefined): labelColumn is UnpivotLabelColumn =>
    Boolean(labelColumn?.outputColumn) && Array.isArray(labelColumn?.mappings) && labelColumn.mappings.some(isValidLabelMapping);

export const normalizeUnpivotLabelColumns = (operation: Pick<UnpivotColumnsOperation, 'labelColumn' | 'labelMappings' | 'labelColumns'>): UnpivotLabelColumn[] => {
    if (Array.isArray(operation.labelColumns) && operation.labelColumns.length > 0) {
        return operation.labelColumns
            .map(labelColumn => ({
                outputColumn: labelColumn.outputColumn,
                mappings: (labelColumn.mappings ?? []).filter(isValidLabelMapping),
            }))
            .filter(isValidLabelColumn);
    }
    if (operation.labelColumn && Array.isArray(operation.labelMappings) && operation.labelMappings.length > 0) {
        return [{
            outputColumn: operation.labelColumn,
            mappings: operation.labelMappings.filter(isValidLabelMapping),
        }].filter(isValidLabelColumn);
    }
    return [];
};

export const normalizeUnpivotHierarchyDepthMappings = (
    operation: Pick<UnpivotColumnsOperation, 'hierarchyDepthMappings'>,
): UnpivotHierarchyDepthMapping[] =>
    Array.isArray(operation.hierarchyDepthMappings)
        ? operation.hierarchyDepthMappings.filter(mapping =>
            Number.isInteger(mapping?.sourceRowIndex)
            && mapping.sourceRowIndex >= 0
            && Number.isInteger(mapping?.depth)
            && mapping.depth >= 0,
        )
        : [];
