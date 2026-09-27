// @vitest-environment node

/**
 * Tests for the aggregate_integrity verification signal.
 *
 * computeAggregateIntegrityDeviation compares numeric column SUMs before
 * and after cleaning to detect unintentional data loss or truncation.
 */

import { describe, expect, it } from 'vitest';
import { computeAggregateIntegrityDeviation } from '../services/agent/reportShapeVerification';
import { buildCleaningVerificationReport } from '../services/agent/cleaningVerification';
import type { CsvData, CsvRow } from '../types';

const makeCsvData = (data: CsvRow[], fileName = 'test.csv'): CsvData => ({
    fileName,
    data,
    metadataRows: [],
    headerLayers: [],
    summaryRows: [],
    headerDepth: 1,
});

describe('computeAggregateIntegrityDeviation', () => {
    it('returns null when raw data is empty', () => {
        const result = computeAggregateIntegrityDeviation(
            makeCsvData([]),
            makeCsvData([{ Amount: '100' }]),
        );
        expect(result).toBeNull();
    });

    it('returns null when cleaned data is empty', () => {
        const result = computeAggregateIntegrityDeviation(
            makeCsvData([{ Amount: '100' }]),
            makeCsvData([]),
        );
        expect(result).toBeNull();
    });

    it('returns null when no numeric columns exist', () => {
        const result = computeAggregateIntegrityDeviation(
            makeCsvData([{ Name: 'Alice' }, { Name: 'Bob' }]),
            makeCsvData([{ Name: 'Alice' }]),
        );
        expect(result).toBeNull();
    });

    it('returns 0 deviation when sums match exactly', () => {
        const data = [
            { Region: 'East', Amount: '100' },
            { Region: 'West', Amount: '200' },
        ];
        const result = computeAggregateIntegrityDeviation(
            makeCsvData(data),
            makeCsvData(data),
        );
        expect(result).not.toBeNull();
        expect(result!.maxDeviation).toBe(0);
    });

    it('detects small deviation when metadata rows are dropped (pass threshold)', () => {
        const raw = [
            { Region: 'Header', Amount: '0' },      // metadata row
            { Region: 'East', Amount: '1000' },
            { Region: 'West', Amount: '2000' },
        ];
        const cleaned = [
            { Region: 'East', Amount: '1000' },
            { Region: 'West', Amount: '2000' },
        ];
        const result = computeAggregateIntegrityDeviation(
            makeCsvData(raw),
            makeCsvData(cleaned),
        );
        expect(result).not.toBeNull();
        // Deviation = 0 because dropped row had Amount=0
        expect(result!.maxDeviation).toBe(0);
    });

    it('detects moderate deviation when data rows are accidentally dropped (warn)', () => {
        const raw = [
            { Region: 'East', Amount: '1000' },
            { Region: 'West', Amount: '200' },
            { Region: 'North', Amount: '50' },
        ];
        const cleaned = [
            { Region: 'East', Amount: '1000' },
            { Region: 'West', Amount: '200' },
            // North accidentally dropped — 50/1250 = 4% deviation
        ];
        const result = computeAggregateIntegrityDeviation(
            makeCsvData(raw),
            makeCsvData(cleaned),
        );
        expect(result).not.toBeNull();
        expect(result!.maxDeviation).toBeGreaterThan(0.001);  // > warn threshold
        expect(result!.maxDeviation).toBeLessThanOrEqual(0.05); // ≤ fail threshold
        expect(result!.column).toBe('Amount');
    });

    it('detects large deviation when values are truncated (fail)', () => {
        const raw = [
            { Region: 'East', Amount: '10000' },
            { Region: 'West', Amount: '5000' },
        ];
        const cleaned = [
            { Region: 'East', Amount: '1000' },   // truncated! 10000 → 1000
            { Region: 'West', Amount: '5000' },
        ];
        const result = computeAggregateIntegrityDeviation(
            makeCsvData(raw),
            makeCsvData(cleaned),
        );
        expect(result).not.toBeNull();
        expect(result!.maxDeviation).toBeGreaterThan(0.05); // > fail threshold
        expect(result!.column).toBe('Amount');
    });

    it('picks the column with the worst deviation', () => {
        const raw = [
            { Revenue: '1000', Cost: '500' },
            { Revenue: '2000', Cost: '1000' },
        ];
        const cleaned = [
            { Revenue: '1000', Cost: '500' },
            { Revenue: '2000', Cost: '100' },  // Cost truncated: 1000 → 100
        ];
        const result = computeAggregateIntegrityDeviation(
            makeCsvData(raw),
            makeCsvData(cleaned),
        );
        expect(result).not.toBeNull();
        expect(result!.column).toBe('Cost'); // Cost has worse deviation
    });
});

describe('aggregate_integrity signal in verification report', () => {
    it('emits pass signal when sums match', () => {
        const data = makeCsvData([
            { Region: 'East', Amount: '100' },
            { Region: 'West', Amount: '200' },
        ]);
        const report = buildCleaningVerificationReport(data, data);
        const signal = report.signals.find(s => s.key === 'aggregate_integrity');
        expect(signal).toBeDefined();
        expect(signal!.status).toBe('pass');
        expect(signal!.value).toBe(0);
    });

    it('emits warn signal when moderate deviation detected', () => {
        const raw = makeCsvData([
            { Region: 'East', Amount: '1000' },
            { Region: 'West', Amount: '200' },
            { Region: 'North', Amount: '50' },
        ]);
        const cleaned = makeCsvData([
            { Region: 'East', Amount: '1000' },
            { Region: 'West', Amount: '200' },
        ]);
        const report = buildCleaningVerificationReport(raw, cleaned);
        const signal = report.signals.find(s => s.key === 'aggregate_integrity');
        expect(signal).toBeDefined();
        expect(signal!.status).toBe('warn');
    });

    it('emits fail signal when large deviation detected', () => {
        const raw = makeCsvData([
            { Region: 'East', Amount: '10000' },
            { Region: 'West', Amount: '5000' },
        ]);
        const cleaned = makeCsvData([
            { Region: 'East', Amount: '1000' },
            { Region: 'West', Amount: '5000' },
        ]);
        const report = buildCleaningVerificationReport(raw, cleaned);
        const signal = report.signals.find(s => s.key === 'aggregate_integrity');
        expect(signal).toBeDefined();
        expect(signal!.status).toBe('fail');
    });

    it('does not emit signal when no numeric columns', () => {
        const raw = makeCsvData([{ Name: 'Alice' }]);
        const cleaned = makeCsvData([{ Name: 'Alice' }]);
        const report = buildCleaningVerificationReport(raw, cleaned);
        const signal = report.signals.find(s => s.key === 'aggregate_integrity');
        expect(signal).toBeUndefined();
    });
});
