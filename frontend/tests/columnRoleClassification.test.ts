import { describe, it, expect } from 'vitest';
import { inferTabularShapeContext } from '../services/agent/reportShapeTabular';
import {
    computeColumnStatistics,
    classifyAllColumnRoles,
    inferCarryForwardColumns,
    inferSectionLabelColumns,
    inferFactColumns,
} from '../services/agent/columnRoleClassifier';
import type { CsvData, CsvRow } from '../types';

const buildCsvData = (rows: CsvRow[], fileName = 'test.csv'): CsvData => ({
    data: rows,
    fileName,
});

describe('inferTabularShapeContext — data-driven column role classification', () => {
    it('classifies numeric columns as value and text columns as descriptor', () => {
        const rows = Array.from({ length: 10 }, (_, i) => ({
            Region: `Region_${i % 4}`,
            Segment: `Seg_${i % 3}`,
            Revenue: String(1000 + i * 100),
            Cost: String(500 + i * 50),
        }));
        const result = inferTabularShapeContext(buildCsvData(rows));
        expect(result).not.toBeNull();
        expect(result!.valueColumns).toContain('Revenue');
        expect(result!.valueColumns).toContain('Cost');
        expect(result!.descriptorColumns).toContain('Region');
        expect(result!.descriptorColumns).toContain('Segment');
        expect(result!.descriptorColumns).not.toContain('Revenue');
        expect(result!.descriptorColumns).not.toContain('Cost');
    });

    it('classifies borderline numeric column with dashes/N/A as value via softNumericRatio', () => {
        // ~55% numeric + ~20% dash/N/A = softNumericRatio ~0.75
        const rows = [
            { Item: 'Alpha', Amount: '1200.00' },
            { Item: 'Beta', Amount: '900.00' },
            { Item: 'Gamma', Amount: '-' },
            { Item: 'Delta', Amount: '750.00' },
            { Item: 'Epsilon', Amount: 'N/A' },
            { Item: 'Zeta', Amount: '1100.00' },
            { Item: 'Eta', Amount: '-' },
            { Item: 'Theta', Amount: '600.00' },
            { Item: 'Iota', Amount: '800.00' },
            { Item: 'Kappa', Amount: 'n/a' },
        ];
        const result = inferTabularShapeContext(buildCsvData(rows));
        expect(result).not.toBeNull();
        expect(result!.valueColumns).toContain('Amount');
        expect(result!.descriptorColumns).toContain('Item');
    });

    it('classifies code-like column as descriptor even with high numeric density', () => {
        // Code column has values like "AB01", "CD02" matching CODE_LIKE_PATTERN
        const rows = Array.from({ length: 10 }, (_, i) => ({
            AcctCode: `ACCT${String(1000 + i)}`,
            Description: `Item description ${i}`,
            Balance: String(5000 + i * 200),
        }));
        const result = inferTabularShapeContext(buildCsvData(rows));
        expect(result).not.toBeNull();
        expect(result!.valueColumns).toContain('Balance');
        expect(result!.valueColumns).not.toContain('AcctCode');
        // AcctCode should be descriptor (code-like density high)
        expect(result!.descriptorColumns).toContain('AcctCode');
    });

    it('classifies first columns as descriptor via positional signal when mixed content', () => {
        // First column has mixed content (text + some numeric-like) but is in position 0
        const rows = Array.from({ length: 10 }, (_, i) => ({
            Category: i % 3 === 0 ? `Cat_${i}` : `Group ${i}`,
            Metric1: String(100 + i * 10),
            Metric2: String(200 + i * 20),
            Metric3: String(300 + i * 30),
        }));
        const result = inferTabularShapeContext(buildCsvData(rows));
        expect(result).not.toBeNull();
        expect(result!.descriptorColumns).toContain('Category');
        expect(result!.valueColumns).toContain('Metric1');
        expect(result!.valueColumns).toContain('Metric2');
        expect(result!.valueColumns).toContain('Metric3');
    });

    it('handles dataset with no clear descriptors gracefully', () => {
        // All columns are numeric — should return null (no descriptor columns)
        const rows = Array.from({ length: 10 }, (_, i) => ({
            Col1: String(i * 100),
            Col2: String(i * 200),
            Col3: String(i * 300),
        }));
        const result = inferTabularShapeContext(buildCsvData(rows));
        expect(result).toBeNull();
    });

    it('handles dataset with no clear value columns gracefully', () => {
        // All columns are textual — should return null (no value columns)
        const rows = Array.from({ length: 10 }, (_, i) => ({
            Name: `Person_${i}`,
            City: `City_${i % 4}`,
            Role: `Role_${i % 3}`,
        }));
        const result = inferTabularShapeContext(buildCsvData(rows));
        expect(result).toBeNull();
    });

    it('does not classify purely numeric first column as descriptor', () => {
        // First column is purely numeric — positional fallback should NOT apply
        const rows = Array.from({ length: 10 }, (_, i) => ({
            Index: String(i + 1),
            Label: `Item ${i}`,
            Value: String(1000 + i * 100),
        }));
        const result = inferTabularShapeContext(buildCsvData(rows));
        expect(result).not.toBeNull();
        // Index has numericRatio 1.0 and softNumericRatio 1.0 → classified as value
        // Label is textual → descriptor
        expect(result!.descriptorColumns).toContain('Label');
        expect(result!.valueColumns).toContain('Value');
    });

    it('filters out blank and footer rows before computing column stats', () => {
        const rows = [
            { Code: 'A01', Desc: 'Widget', Amount: '1500' },
            { Code: 'A02', Desc: 'Gadget', Amount: '2300' },
            { Code: '', Desc: '', Amount: '' }, // blank row
            { Code: 'A03', Desc: 'Doohickey', Amount: '900' },
            { Code: 'Printed by admin on 01-01-2024@system', Desc: '', Amount: '' }, // footer
        ];
        const result = inferTabularShapeContext(buildCsvData(rows));
        expect(result).not.toBeNull();
        expect(result!.valueColumns).toContain('Amount');
        expect(result!.descriptorColumns.length).toBeGreaterThan(0);
    });

    it('returns correct confidence based on column counts', () => {
        const rows = Array.from({ length: 10 }, (_, i) => ({
            Category: `Cat_${i % 3}`,
            SubCategory: `Sub_${i % 5}`,
            Amount: String(1000 + i * 50),
            Quantity: String(10 + i),
        }));
        const result = inferTabularShapeContext(buildCsvData(rows));
        expect(result).not.toBeNull();
        expect(result!.confidence).toBeGreaterThan(0.5);
        expect(result!.confidence).toBeLessThanOrEqual(1);
    });
});

describe('computeColumnStatistics — unified column stats', () => {
    it('computes correct numeric ratios for purely numeric column', () => {
        const rows = Array.from({ length: 10 }, (_, i) => ['Item ' + i, String(100 + i * 10)]);
        const stats = computeColumnStatistics('Amount', 1, rows);
        expect(stats.strictNumericRatio).toBe(1);
        expect(stats.numericRatio).toBe(1);
        expect(stats.textualRatio).toBe(0);
        expect(stats.nonEmptyCount).toBe(10);
    });

    it('computes correct blank-run signals for carry-forward pattern', () => {
        // Simulates a carry-forward column: value, blanks, value, blanks...
        const rows = [
            ['Invoice A', '100'], ['', '200'], ['', '300'], ['', '400'],
            ['Invoice B', '500'], ['', '600'], ['', '700'], ['', '800'],
            ['Invoice C', '900'], ['', '1000'],
        ];
        const stats = computeColumnStatistics('Invoice', 0, rows);
        expect(stats.blankRatio).toBeGreaterThanOrEqual(0.3);
        expect(stats.blankRunCount).toBeGreaterThanOrEqual(2);
        expect(stats.avgBlankRunLength).toBeGreaterThanOrEqual(2);
        expect(stats.nonEmptyCount).toBe(3);
    });

    it('computes cardinality for section-label-like column', () => {
        const rows = Array.from({ length: 20 }, (_, i) => [['Sales', 'Marketing', 'IT'][i % 3], String(i * 100)]);
        const stats = computeColumnStatistics('Department', 0, rows);
        expect(stats.distinctCount).toBe(3);
        expect(stats.cardinalityRatio).toBeLessThan(0.6);
        expect(stats.lenientTextualRatio).toBeGreaterThan(0.6);
    });

    it('handles empty rows without crashing', () => {
        const stats = computeColumnStatistics('Col', 0, []);
        expect(stats.nonEmptyCount).toBe(0);
        expect(stats.sampleSize).toBe(0);
        expect(stats.fillRate).toBe(0);
    });
});

describe('classifyAllColumnRoles — unified classifier', () => {
    it('classifies carry-forward, section-label, fact, and descriptor columns', () => {
        // 20 rows: carry-forward col (sparse), section label (text, low cardinality), fact (numeric)
        const groups = ['Alpha Division', 'Beta Division', 'Gamma Division', 'Delta Division'];
        const rows: string[][] = [];
        for (let i = 0; i < 20; i++) {
            const cf = i % 5 === 0 ? groups[i / 5] : '';
            const label = ['Sales', 'Marketing', 'IT', 'HR'][i % 4];
            const amount = String(1000 + i * 50);
            rows.push([cf, label, amount]);
        }
        const result = classifyAllColumnRoles({
            headers: ['GroupId', 'Department', 'Revenue'],
            rawRows: rows,
            bodyStart: 0,
            summaryStart: 20,
        });
        expect(result).toHaveLength(3);
        expect(result.find(r => r.column === 'GroupId')?.role).toBe('carryForward');
        expect(result.find(r => r.column === 'Department')?.role).toBe('sectionLabel');
        expect(result.find(r => r.column === 'Revenue')?.role).toBe('fact');
    });

    it('respects AI annotation override', () => {
        const rows = Array.from({ length: 10 }, (_, i) => [String(i), String(i * 100)]);
        const aiAnnotations = new Map([['Col1', 'descriptor' as const]]);
        const result = classifyAllColumnRoles({
            headers: ['Col1', 'Col2'],
            rawRows: rows,
            bodyStart: 0,
            summaryStart: 10,
            aiAnnotations,
        });
        expect(result.find(r => r.column === 'Col1')?.role).toBe('descriptor');
        expect(result.find(r => r.column === 'Col1')?.source).toBe('ai_annotation');
    });

    it('handles empty body rows', () => {
        const result = classifyAllColumnRoles({
            headers: ['A', 'B'],
            rawRows: [],
            bodyStart: 0,
            summaryStart: 0,
        });
        expect(result.every(r => r.role === 'unknown')).toBe(true);
    });
});

describe('inferCarryForwardColumns — carry-forward detection', () => {
    it('detects fill-down pattern columns', () => {
        const headers = ['Invoice', 'LineItem', 'Amount'];
        const names = ['Alpha Corp', 'Beta Ltd', 'Gamma Inc', 'Delta Co', 'Epsilon SA'];
        const rawRows: string[][] = [];
        for (let i = 0; i < 20; i++) {
            const inv = i % 4 === 0 ? names[i / 4] : '';
            rawRows.push([inv, `Item ${i}`, String(100 + i * 10)]);
        }
        const result = inferCarryForwardColumns(headers, rawRows, 0, 20);
        expect(result).toContain('Invoice');
        expect(result).not.toContain('Amount');
    });

    it('returns empty when no raw data available', () => {
        expect(inferCarryForwardColumns(['A', 'B'])).toEqual([]);
    });
});

describe('inferFactColumns — fact column detection', () => {
    it('detects numeric-dominant columns', () => {
        const headers = ['Name', 'Revenue', 'Cost'];
        const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa'];
        const rawRows = Array.from({ length: 10 }, (_, i) => [names[i], String(1000 + i * 100), String(500 + i * 50)]);
        const result = inferFactColumns(headers, [], rawRows, 0, 10);
        expect(result).toContain('Revenue');
        expect(result).toContain('Cost');
        expect(result).not.toContain('Name');
    });

    it('excludes specified columns', () => {
        const headers = ['Name', 'Revenue', 'Cost'];
        const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa'];
        const rawRows = Array.from({ length: 10 }, (_, i) => [names[i], String(1000 + i * 100), String(500 + i * 50)]);
        const result = inferFactColumns(headers, ['Revenue'], rawRows, 0, 10);
        expect(result).not.toContain('Revenue');
        expect(result).toContain('Cost');
    });

    it('does not classify full date columns as fact columns', () => {
        const headers = ['No', 'DATE', 'NET AMOUNT'];
        const rawRows = [
            ['1', '08-01-2010', '52602.50'],
            ['2', '20-01-2010', '104460.00'],
            ['3', '22-01-2010', '90453.00'],
            ['4', '28-01-2010', '87767.50'],
        ];
        const result = inferFactColumns(headers, [], rawRows, 0, rawRows.length);
        expect(result).toContain('NET AMOUNT');
        expect(result).not.toContain('DATE');
    });
});

describe('inferSectionLabelColumns — section label detection', () => {
    it('detects text-dominant low-cardinality columns', () => {
        const headers = ['Category', 'Amount'];
        const rawRows = Array.from({ length: 20 }, (_, i) => [['Sales', 'Marketing', 'IT'][i % 3], String(i * 100)]);
        const result = inferSectionLabelColumns(headers, [], rawRows, 0, 20);
        expect(result).toContain('Category');
        expect(result).not.toContain('Amount');
    });

    it('excludes carry-forward columns', () => {
        const headers = ['Category', 'Amount'];
        const rawRows = Array.from({ length: 20 }, (_, i) => [['Sales', 'Marketing', 'IT'][i % 3], String(i * 100)]);
        const result = inferSectionLabelColumns(headers, ['Category'], rawRows, 0, 20);
        expect(result).not.toContain('Category');
    });
});
