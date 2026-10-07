// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { detectReportShape } from '../services/agent/reportShapeDetector';
import type { CsvData } from '../types';

const makeData = (seriesNames: string[]): CsvData => ({
    fileName: 'report.csv',
    headerLayers: [['', '', ...seriesNames.map(() => 'Cost centre'), '']],
    data: Array.from({ length: 12 }, (_, index) => ({
        Description: `Item ${index}`,
        Notes: `Note ${index}`,
        ...Object.fromEntries(seriesNames.map((name, column) => [name, (index + 1) * (column + 2) * 100])),
        Total: (index + 1) * 1000,
    })),
}) as unknown as CsvData;

describe('report series columns', () => {
    it('treats numeric columns as the detail series whatever their header words are', () => {
        const profile = detectReportShape(makeData(['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon']));
        const series = profile.columnRoles.filter(role => role.role === 'detail_series').map(role => role.columnName);

        expect(series).toEqual(expect.arrayContaining(['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon']));
    });

    it('does not take text columns named like entities as series', () => {
        const data = makeData(['Alpha', 'Beta', 'Gamma', 'Delta']);
        const profile = detectReportShape({
            ...data,
            data: data.data.map(row => ({ ...row, Project: 'P-1', Office: 'HQ' })),
        } as CsvData);
        const series = profile.columnRoles.filter(role => role.role === 'detail_series').map(role => role.columnName);

        expect(series).not.toContain('Project');
        expect(series).not.toContain('Office');
    });
});
