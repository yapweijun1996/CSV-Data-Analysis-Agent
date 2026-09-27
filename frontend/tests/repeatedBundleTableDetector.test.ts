import { describe, expect, it } from 'vitest';
import { detectRepeatedBundleTable } from '../services/agent/repeatedBundleTableDetector';
import type { CsvData } from '../types';

describe('detectRepeatedBundleTable', () => {
    it('classifies repeated leaf attributes after multi-layer headers add band prefixes', () => {
        const columns = [
            'RowNumber',
            'Sales Order :: Date',
            'Sales Order :: Number',
            'Sales Order :: Customer',
            'Sales Order :: Sales Exec',
            'Sales Order :: Description',
            'Sales Invoice :: Date',
            'Sales Invoice :: Number',
            'Sales Invoice :: Qty',
            'Sales Invoice :: UOM',
            'Sales Invoice :: Date_2',
            'Sales Invoice :: Number_2',
            'Sales Invoice :: Qty_2',
            'Sales Invoice :: UOM_2',
            'Sales Invoice :: Date_3',
            'Sales Invoice :: Number_3',
            'Sales Invoice :: Qty_3',
            'Sales Invoice :: UOM_3',
        ];
        const data: CsvData = {
            fileName: 'lifecycle.csv',
            data: [Object.fromEntries(columns.map(column => [column, 'value']))],
            metadataRows: [],
            headerLayers: [[
                '',
                'Sales Order',
                '',
                '',
                '',
                'Purchase Order',
                '',
                '',
                '',
                'Sales Invoice',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
            ]],
            summaryRows: [],
            headerDepth: 2,
        };

        expect(detectRepeatedBundleTable(data)).toMatchObject({
            isRepeatedBundleTable: true,
            repeatedFamilies: expect.arrayContaining(['date', 'number', 'qty', 'uom']),
            strongRepeatedFamilies: expect.arrayContaining(['date', 'number', 'qty', 'uom']),
        });
    });
});
