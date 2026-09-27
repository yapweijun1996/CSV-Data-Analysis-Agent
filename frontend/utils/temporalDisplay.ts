import type { CsvCellValue } from '../types';
import { isSequentialDimensionName } from './ordinalSortOrder';

const EPOCH_SECONDS_MIN = 1_000_000_000;
const EPOCH_SECONDS_MAX = 99_999_999_999;
const EPOCH_MILLISECONDS_MIN = 100_000_000_000;
const EPOCH_MILLISECONDS_MAX = 99_999_999_999_999;

const ISO_DATE_PATTERN = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/;
const DAY_FIRST_DATE_PATTERN = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})(?:[T\s].*)?$/;
const COMPACT_YMD_PATTERN = /^(\d{4})(\d{2})(\d{2})$/;

const isFiniteDate = (value: Date): boolean => Number.isFinite(value.getTime());

const normalizeYear = (year: number): number => {
    if (year >= 100) {
        return year;
    }
    return year >= 50 ? 1900 + year : 2000 + year;
};

const buildUtcDate = (year: number, month: number, day: number): Date | null => {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return null;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) {
        return null;
    }

    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (
        candidate.getUTCFullYear() !== year
        || candidate.getUTCMonth() !== month - 1
        || candidate.getUTCDate() !== day
    ) {
        return null;
    }
    return candidate;
};

const parseEpochNumber = (value: number): Date | null => {
    if (!Number.isFinite(value)) {
        return null;
    }

    const absolute = Math.abs(value);
    if (absolute >= EPOCH_MILLISECONDS_MIN && absolute <= EPOCH_MILLISECONDS_MAX) {
        const date = new Date(value);
        return isFiniteDate(date) ? date : null;
    }

    if (absolute >= EPOCH_SECONDS_MIN && absolute <= EPOCH_SECONDS_MAX) {
        const date = new Date(value * 1000);
        return isFiniteDate(date) ? date : null;
    }

    return null;
};

const parseDateText = (value: string): Date | null => {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const compactMatch = trimmed.match(COMPACT_YMD_PATTERN);
    if (compactMatch) {
        return buildUtcDate(
            Number(compactMatch[1]),
            Number(compactMatch[2]),
            Number(compactMatch[3]),
        );
    }

    const isoMatch = trimmed.match(ISO_DATE_PATTERN);
    if (isoMatch) {
        return buildUtcDate(
            Number(isoMatch[1]),
            Number(isoMatch[2]),
            Number(isoMatch[3]),
        );
    }

    const dayFirstMatch = trimmed.match(DAY_FIRST_DATE_PATTERN);
    if (dayFirstMatch) {
        return buildUtcDate(
            normalizeYear(Number(dayFirstMatch[3])),
            Number(dayFirstMatch[2]),
            Number(dayFirstMatch[1]),
        );
    }

    if (/^\d+$/.test(trimmed)) {
        return parseEpochNumber(Number(trimmed));
    }

    if (/[a-z]/i.test(trimmed)) {
        const parsed = new Date(trimmed);
        return isFiniteDate(parsed) ? parsed : null;
    }

    return null;
};

export const isTemporalDisplayColumn = (columnName: string | null | undefined): boolean =>
    isSequentialDimensionName(columnName);

export const getTemporalSortTimestamp = (
    value: unknown,
    columnName?: string | null,
): number | null => {
    if (columnName && !isTemporalDisplayColumn(columnName)) {
        return null;
    }

    if (value instanceof Date) {
        return isFiniteDate(value) ? value.getTime() : null;
    }

    if (typeof value === 'number') {
        return parseEpochNumber(value)?.getTime() ?? null;
    }

    if (typeof value === 'string') {
        return parseDateText(value)?.getTime() ?? null;
    }

    return null;
};

const pad = (value: number): string => String(value).padStart(2, '0');

export const formatTemporalDisplayValue = (
    columnName: string | null | undefined,
    value: CsvCellValue,
): string | null => {
    const timestamp = getTemporalSortTimestamp(value, columnName);
    if (timestamp === null) {
        return null;
    }

    const date = new Date(timestamp);
    return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
};
