import type {
    CsvCellValue,
    CsvRow,
    SandboxTransformationOutput,
    SandboxTransformationProposal,
    SandboxValidationReport,
} from '../../types';

const NUMERIC_RELATIVE_TOLERANCE = 0.000001;

const toFiniteNumber = (value: CsvCellValue): number | null => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;
    const normalized = value.trim().replace(/,/g, '').replace(/^\((.*)\)$/, '-$1');
    if (!normalized) return null;
    const parsed = Number(normalized.replace(/[%$€£¥]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
};

const sumColumn = (rows: CsvRow[], column: string): number => rows.reduce((sum, row) => {
    const value = toFiniteNumber(row[column]);
    return value === null ? sum : sum + value;
}, 0);

const calculateDerivedValue = (
    row: CsvRow,
    field: NonNullable<SandboxTransformationProposal['derivedFields']>[number],
): number | null => {
    const values = field.inputColumns.map(column => toFiniteNumber(row[column]));
    if (values.some(value => value === null)) return null;
    const numbers = values as number[];
    switch (field.operation) {
        case 'ratio':
            if (numbers[1] === 0) return field.zeroDenominator === 'zero' ? 0 : null;
            return numbers[0] / numbers[1];
        case 'difference':
            return numbers[0] - numbers[1];
        case 'sum':
            return numbers.reduce((sum, value) => sum + value, 0);
        case 'product':
            return numbers.reduce((product, value) => product * value, 1);
    }
};

const hasValidRows = (value: unknown): value is CsvRow[] => Array.isArray(value)
    && value.every(row => row !== null && typeof row === 'object' && !Array.isArray(row));

export const estimateSandboxOutputBytes = (output: SandboxTransformationOutput): number =>
    new TextEncoder().encode(JSON.stringify(output)).byteLength;

export const validateSandboxOutput = (input: {
    inputTableId: string;
    inputRows: CsvRow[];
    proposal: SandboxTransformationProposal;
    output: SandboxTransformationOutput;
    maxOutputBytes: number;
}): SandboxValidationReport => {
    const { inputRows, inputTableId, proposal, output } = input;
    const reasonCodes: string[] = [];
    const warnings: string[] = [];
    const outputBytes = estimateSandboxOutputBytes(output);
    if (outputBytes > input.maxOutputBytes) reasonCodes.push('sandbox_output_limit_exceeded');
    if (!Array.isArray(output.tables) || output.tables.length === 0) reasonCodes.push('sandbox_output_tables_missing');
    if (!Array.isArray(output.lineage)) reasonCodes.push('sandbox_output_lineage_missing');
    if (!Array.isArray(output.relationships)) reasonCodes.push('sandbox_output_relationships_invalid');

    const contractById = new Map(proposal.tables.map(table => [table.tableId, table]));
    const outputTableIds = new Set<string>();
    let outputRowCount = 0;
    for (const table of output.tables ?? []) {
        if (!table || typeof table.tableId !== 'string' || !hasValidRows(table.rows)) {
            reasonCodes.push('sandbox_output_table_invalid');
            continue;
        }
        if (outputTableIds.has(table.tableId)) reasonCodes.push('sandbox_output_table_duplicate');
        outputTableIds.add(table.tableId);
        outputRowCount += table.rows.length;
        const contract = contractById.get(table.tableId);
        if (!contract || contract.name !== table.name || contract.role !== table.role) {
            reasonCodes.push('sandbox_output_table_contract_mismatch');
        }
    }
    if (!outputTableIds.has(proposal.primaryTableId)) reasonCodes.push('sandbox_primary_table_output_missing');
    if (outputTableIds.size !== contractById.size) reasonCodes.push('sandbox_output_table_set_mismatch');

    const lineageKeys = new Set<string>();
    for (const record of output.lineage ?? []) {
        const table = (output.tables ?? []).find(candidate => candidate.tableId === record.outputTableId);
        const key = `${record.outputTableId}:${record.outputRowIndex}`;
        if (!table
            || !Number.isInteger(record.outputRowIndex)
            || record.outputRowIndex < 0
            || record.outputRowIndex >= table.rows.length
            || record.inputTableId !== inputTableId
            || !Array.isArray(record.inputRowIndexes)
            || record.inputRowIndexes.length === 0
            || record.inputRowIndexes.some(index => !Number.isInteger(index) || index < 0 || index >= inputRows.length)) {
            reasonCodes.push('sandbox_row_lineage_invalid');
            continue;
        }
        if (lineageKeys.has(key)) reasonCodes.push('sandbox_row_lineage_duplicate');
        lineageKeys.add(key);
    }
    for (const table of output.tables ?? []) {
        table.rows.forEach((_row, index) => {
            if (!lineageKeys.has(`${table.tableId}:${index}`)) reasonCodes.push('sandbox_row_lineage_missing');
        });
    }

    const primaryRows = (output.tables ?? []).find(table => table.tableId === proposal.primaryTableId)?.rows ?? [];
    const droppedRatio = inputRows.length === 0 ? 0 : Math.max(0, inputRows.length - primaryRows.length) / inputRows.length;
    if (proposal.preserveRowCount && primaryRows.length !== inputRows.length) {
        reasonCodes.push('sandbox_row_count_mismatch');
    } else if (droppedRatio > proposal.maxRowDropRatio) {
        reasonCodes.push('sandbox_row_drop_limit_exceeded');
    } else if (droppedRatio > 0) {
        warnings.push('sandbox_rows_removed_within_declared_limit');
    }

    const preservedNumericTotals: SandboxValidationReport['preservedNumericTotals'] = {};
    for (const column of proposal.preserveNumericColumns) {
        const before = sumColumn(inputRows, column);
        const after = sumColumn(primaryRows, column);
        const denominator = Math.max(Math.abs(before), 1);
        const relativeDelta = Math.abs(after - before) / denominator;
        preservedNumericTotals[column] = { before, after, relativeDelta };
        if (relativeDelta > NUMERIC_RELATIVE_TOLERANCE) reasonCodes.push('sandbox_numeric_reconciliation_failed');
    }

    for (const relationship of output.relationships ?? []) {
        const from = (output.tables ?? []).find(table => table.tableId === relationship.fromTableId);
        const to = (output.tables ?? []).find(table => table.tableId === relationship.toTableId);
        if (!from || !to
            || relationship.fromKeys.length === 0
            || relationship.fromKeys.length !== relationship.toKeys.length
            || relationship.fromKeys.some(key => !from.rows.some(row => key in row))
            || relationship.toKeys.some(key => !to.rows.some(row => key in row))) {
            reasonCodes.push('sandbox_relationship_contract_invalid');
        }
    }

    for (const field of proposal.derivedFields ?? []) {
        const table = (output.tables ?? []).find(candidate => candidate.tableId === field.tableId);
        if (!table) {
            reasonCodes.push('sandbox_derived_field_table_missing');
            continue;
        }
        for (const row of table.rows) {
            const expected = calculateDerivedValue(row, field);
            const actual = toFiniteNumber(row[field.fieldName]);
            if (expected === null) {
                const value = row[field.fieldName];
                const isNull = value === null || value === undefined || value === '';
                if (!field.allowNull || !isNull) reasonCodes.push('sandbox_derived_field_null_policy_failed');
                continue;
            }
            if (actual === null || !Number.isFinite(actual)) {
                reasonCodes.push('sandbox_derived_field_value_invalid');
                continue;
            }
            const denominator = Math.max(Math.abs(expected), 1);
            if (Math.abs(actual - expected) / denominator > NUMERIC_RELATIVE_TOLERANCE) {
                reasonCodes.push('sandbox_derived_field_formula_failed');
            }
        }
    }

    const uniqueReasons = Array.from(new Set(reasonCodes));
    return {
        decision: uniqueReasons.length > 0 ? 'blocked' : warnings.length > 0 ? 'needs_confirmation' : 'trusted',
        reasonCodes: uniqueReasons,
        warnings,
        inputRowCount: inputRows.length,
        outputRowCount,
        outputBytes,
        preservedNumericTotals,
    };
};
