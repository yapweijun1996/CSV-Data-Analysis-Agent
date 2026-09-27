/**
 * Pure math, date, formatting, and validation utilities for analysis skills.
 * Split from analysisSkillExecutor.ts for cohesion and testability.
 */

import type {
    AnalysisPlan,
    CsvData,
    CsvRow,
    PivotMatrixRequest,
    QueryAggregateFunction,
} from '../../../types';
import { robustParseFloat } from '../../data/dataProfiler';
import {
    datasetHasColumn,
    datasetHasNumericMetricValues,
    getPivotNumericValues,
    pivotAggregateRequiresMetric,
    pivotAggregateRequiresNumericMetric,
} from '../tools/pivotMatrixSupport';

import type { PeriodCompareRequest, CohortRetentionRequest } from '../../../types';

export type Grain = PeriodCompareRequest['grain'];
export type CohortUnit = CohortRetentionRequest['timeUnit'];

const DATE_TEXT_PATTERN = /\d{4}-\d{1,2}(?:-\d{1,2})?|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,?\s+\d{2,4})?/i;

// --- Statistical functions ---

export const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
export const median = (values: number[]) => percentile(values, 0.5);
export const percentile = (values: number[], ratio: number) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const index = (sorted.length - 1) * ratio;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) {
        return sorted[lower] ?? 0;
    }
    const lowerValue = sorted[lower] ?? 0;
    const upperValue = sorted[upper] ?? 0;
    return lowerValue + (upperValue - lowerValue) * (index - lower);
};
export const standardDeviation = (values: number[]) => {
    if (values.length < 2) return 0;
    const average = mean(values);
    return Math.sqrt(values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / (values.length - 1));
};
export const covariance = (left: number[], right: number[]) => {
    if (left.length < 2 || right.length < 2) return 0;
    const leftMean = mean(left);
    const rightMean = mean(right);
    return left.reduce((sum, value, index) => sum + ((value - leftMean) * ((right[index] ?? 0) - rightMean)), 0) / (left.length - 1);
};
export const pearsonCorrelation = (left: number[], right: number[]) => {
    const leftStdDev = standardDeviation(left);
    const rightStdDev = standardDeviation(right);
    if (leftStdDev === 0 || rightStdDev === 0) {
        return 0;
    }
    return covariance(left, right) / (leftStdDev * rightStdDev);
};

// --- Date & period operations ---

export const parseDate = (value: unknown): Date | null => {
    if (value instanceof Date) {
        return Number.isFinite(value.getTime()) ? value : null;
    }
    if (value === null || value === undefined) {
        return null;
    }
    const text = String(value).trim();
    if (!text || !DATE_TEXT_PATTERN.test(text)) {
        return null;
    }
    const parsed = new Date(text);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const toUtcDate = (value: Date) => new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
));

export const startOfPeriod = (date: Date, grain: Grain | CohortUnit) => {
    const utcDate = toUtcDate(date);
    if (grain === 'year') {
        return new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
    }
    if (grain === 'quarter') {
        const quarterMonth = Math.floor(utcDate.getUTCMonth() / 3) * 3;
        return new Date(Date.UTC(utcDate.getUTCFullYear(), quarterMonth, 1));
    }
    if (grain === 'month') {
        return new Date(Date.UTC(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), 1));
    }
    if (grain === 'week') {
        const day = utcDate.getUTCDay();
        const offset = day === 0 ? -6 : 1 - day;
        return new Date(Date.UTC(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate() + offset));
    }
    return utcDate;
};

export const shiftPeriod = (date: Date, grain: Grain, delta: number) => {
    const shifted = new Date(date.getTime());
    if (grain === 'year') {
        shifted.setUTCFullYear(shifted.getUTCFullYear() + delta);
        return startOfPeriod(shifted, grain);
    }
    if (grain === 'quarter') {
        shifted.setUTCMonth(shifted.getUTCMonth() + (delta * 3));
        return startOfPeriod(shifted, grain);
    }
    if (grain === 'month') {
        shifted.setUTCMonth(shifted.getUTCMonth() + delta);
        return startOfPeriod(shifted, grain);
    }
    if (grain === 'week') {
        shifted.setUTCDate(shifted.getUTCDate() + (delta * 7));
        return startOfPeriod(shifted, grain);
    }
    shifted.setUTCDate(shifted.getUTCDate() + delta);
    return startOfPeriod(shifted, grain);
};

export const toPeriodKey = (date: Date, grain: Grain | CohortUnit) => {
    const periodStart = startOfPeriod(date, grain);
    if (grain === 'year') {
        return `${periodStart.getUTCFullYear()}`;
    }
    if (grain === 'quarter') {
        return `${periodStart.getUTCFullYear()}-Q${Math.floor(periodStart.getUTCMonth() / 3) + 1}`;
    }
    if (grain === 'month') {
        return periodStart.toISOString().slice(0, 7);
    }
    return periodStart.toISOString().slice(0, 10);
};

export const diffInPeriods = (cohortDate: Date, activityDate: Date, timeUnit: CohortUnit): number => {
    const cohortStart = startOfPeriod(cohortDate, timeUnit);
    const activityStart = startOfPeriod(activityDate, timeUnit);
    const diffMs = activityStart.getTime() - cohortStart.getTime();
    if (timeUnit === 'day') {
        return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }
    if (timeUnit === 'week') {
        return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7));
    }
    return ((activityStart.getUTCFullYear() - cohortStart.getUTCFullYear()) * 12) + (activityStart.getUTCMonth() - cohortStart.getUTCMonth());
};

// --- Formatting ---

export const compareText = (left: unknown, right: unknown) =>
    String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true, sensitivity: 'base' });

export const formatPercent = (value: number | null) => value === null || !Number.isFinite(value)
    ? 'n/a'
    : `${(value * 100).toFixed(Math.abs(value) >= 0.1 ? 1 : 2)}%`;

export const formatNumber = (value: number | null) => value === null || !Number.isFinite(value)
    ? 'n/a'
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });

export const getNumericValues = (rows: CsvRow[], column: string | undefined) => {
    return getPivotNumericValues(rows, column);
};

// --- Aggregation ---

export const aggregateRows = (
    rows: CsvRow[],
    aggregate: QueryAggregateFunction,
    metricColumn?: string,
): number | null => {
    if (aggregate === 'count') {
        return rows.length;
    }
    if (!metricColumn) {
        return null;
    }
    if (aggregate === 'count_distinct') {
        return new Set(
            rows
                .map(row => row[metricColumn])
                .filter(value => value !== null && value !== undefined && String(value).trim() !== ''),
        ).size;
    }
    const values = getNumericValues(rows, metricColumn);
    if (values.length === 0) {
        return null;
    }
    switch (aggregate) {
        case 'sum':
            return values.reduce((sum, value) => sum + value, 0);
        case 'avg':
            return mean(values);
        case 'min':
            return Math.min(...values);
        case 'max':
            return Math.max(...values);
        case 'median':
            return median(values);
        case 'percentile':
            return percentile(values, 0.5);
        default:
            return null;
    }
};

// --- Correlation & regression ---

export const detectCorrelationStrength = (value: number) => {
    const absoluteValue = Math.abs(value);
    if (absoluteValue >= 0.9) return 'very strong';
    if (absoluteValue >= 0.7) return 'strong';
    if (absoluteValue >= 0.5) return 'moderate';
    if (absoluteValue >= 0.3) return 'weak';
    return 'very weak';
};

export const buildRegression = (xValues: number[], yValues: number[]) => {
    const xMean = mean(xValues);
    const yMean = mean(yValues);
    let numerator = 0;
    let denominator = 0;
    xValues.forEach((xValue, index) => {
        const xDelta = xValue - xMean;
        numerator += xDelta * ((yValues[index] ?? 0) - yMean);
        denominator += xDelta * xDelta;
    });
    const slope = denominator === 0 ? 0 : numerator / denominator;
    const intercept = yMean - (slope * xMean);
    return { slope, intercept };
};

// --- Pivot validation ---

export const getPivotMetricValidationError = (
    request: PivotMatrixRequest,
    csvData: CsvData,
): string | null => {
    if (typeof request.aggregate !== 'string' || request.aggregate.trim() === '') {
        return 'Pivot aggregate is required.';
    }
    const metricColumn = request.metric?.trim() || undefined;
    if (pivotAggregateRequiresMetric(request.aggregate) && !metricColumn) {
        return `Pivot ${request.aggregate} requires a metric column.`;
    }
    if (!metricColumn) {
        return null;
    }
    if (!datasetHasColumn(csvData, metricColumn)) {
        return `Metric column "${metricColumn}" was not found in the current dataset.`;
    }
    if (pivotAggregateRequiresNumericMetric(request.aggregate) && !datasetHasNumericMetricValues(csvData, metricColumn)) {
        return `Metric column "${metricColumn}" contains no numeric values after parsing.`;
    }
    return null;
};

export const getPivotDimensionValidationError = (
    request: PivotMatrixRequest,
    csvData: CsvData,
): string | null => {
    const invalidRow = request.rows.find(column => !datasetHasColumn(csvData, column));
    if (invalidRow) {
        return `Row dimension "${invalidRow}" was not found in the current dataset.`;
    }
    const invalidColumn = (request.columns ?? []).find(column => !datasetHasColumn(csvData, column));
    if (invalidColumn) {
        return `Column dimension "${invalidColumn}" was not found in the current dataset.`;
    }
    return null;
};
