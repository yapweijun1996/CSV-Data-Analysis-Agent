import { describe, expect, it } from 'vitest';
import { buildSandboxCodeRef, validateSandboxCode, validateSandboxProposal } from '../services/sandbox/sandboxPolicy';

describe('sandbox policy', () => {
    it('accepts a bounded JavaScript transform contract', () => {
        const code = 'function transform(rows, context) { return { tables: [{ tableId: context.inputTableId, name: "Rows", role: "fact", rows: rows.map(row => ({ ...row })) }], lineage: rows.map((row, index) => ({ outputTableId: context.inputTableId, outputRowIndex: index, inputTableId: context.inputTableId, inputRowIndexes: [index] })), relationships: [] }; }';
        expect(validateSandboxCode('javascript', code)).toEqual([]);
        expect(buildSandboxCodeRef('javascript', code)).toMatch(/^sandbox-javascript-[0-9a-f]{8}$/);
    });

    it.each([
        ['fetch("https://example.com")', 'sandbox_network_access_denied'],
        ['document.body', 'sandbox_dom_or_global_access_denied'],
        ['indexedDB.open("x")', 'sandbox_storage_access_denied'],
        ['import("./x.js")', 'sandbox_module_loading_denied'],
        ['Function("return 1")', 'sandbox_dynamic_code_denied'],
        ['postMessage({})', 'sandbox_worker_control_denied'],
    ])('blocks JavaScript capability escape %s', (fragment, reason) => {
        expect(validateSandboxCode('javascript', `function transform(rows) { ${fragment}; return rows; }`)).toContain(reason);
    });

    it('accepts restricted Python and blocks imports and dunder traversal', () => {
        expect(validateSandboxCode('python', 'def transform(rows, context):\n    return {"tables": [], "lineage": [], "relationships": []}')).toEqual([]);
        expect(validateSandboxCode('python', 'import js\ndef transform(rows, context):\n    return {}')).toContain('sandbox_python_import_denied');
        expect(validateSandboxCode('python', 'def transform(rows, context):\n    return rows[0].__class__')).toContain('sandbox_python_dunder_access_denied');
    });

    it('validates table identity and row-drop bounds before execution', () => {
        const errors = validateSandboxProposal({
            language: 'javascript',
            explanation: 'Test',
            code: 'function transform(rows) { return rows; }',
            primaryTableId: 'missing',
            tables: [{ tableId: 'fact', name: 'Fact', role: 'fact' }],
            preserveRowCount: false,
            maxRowDropRatio: 0.9,
            preserveNumericColumns: [],
        });
        expect(errors).toEqual(expect.arrayContaining([
            'sandbox_primary_table_unknown',
            'sandbox_row_drop_ratio_invalid',
        ]));
    });

    it('rejects incomplete or ambiguous derived-field contracts', () => {
        const errors = validateSandboxProposal({
            language: 'javascript',
            explanation: 'Test',
            code: 'function transform(rows) { return rows; }',
            primaryTableId: 'fact',
            tables: [{ tableId: 'fact', name: 'Fact', role: 'fact' }],
            preserveRowCount: true,
            maxRowDropRatio: 0,
            preserveNumericColumns: [],
            derivedFields: [{
                tableId: 'fact',
                fieldName: 'marginRate',
                operation: 'ratio',
                inputColumns: ['profit'],
                unit: '',
                grain: 'one row',
                allowNull: true,
                zeroDenominator: 'null',
            }],
        });
        expect(errors).toEqual(expect.arrayContaining([
            'sandbox_derived_field_contract_invalid',
            'sandbox_derived_field_arity_invalid',
        ]));
    });
});
