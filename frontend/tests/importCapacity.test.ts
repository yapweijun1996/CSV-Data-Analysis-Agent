import { describe, expect, it } from 'vitest';
import {
    DESKTOP_IMPORT_CAPACITY,
    DESKTOP_DUCKDB_FILE_CAPACITY,
    MOBILE_IMPORT_CAPACITY,
    resolveImportCapacity,
    shouldUseDuckDbFileIntake,
} from '../services/data/importCapacity';

describe('import capacity', () => {
    it('uses the GA desktop in-memory ceiling by default', () => {
        expect(resolveImportCapacity({ userAgent: 'Mozilla/5.0 Chrome/140' }))
            .toEqual(DESKTOP_IMPORT_CAPACITY);
        expect(DESKTOP_IMPORT_CAPACITY).toMatchObject({
            maxBytes: 25 * 1024 * 1024,
            maxRows: 100_000,
        });
    });

    it.each([
        { userAgent: 'Mozilla/5.0 (iPhone) Mobile Safari' },
        { userAgent: 'Mozilla/5.0 (Linux; Android 16) Chrome/140 Mobile' },
        { userAgent: 'Desktop', viewportWidth: 844, coarsePointer: true },
    ])('uses the mobile ceiling for a mobile browser environment', environment => {
        expect(resolveImportCapacity(environment)).toEqual(MOBILE_IMPORT_CAPACITY);
    });

    it('does not classify a resized desktop viewport as mobile without a coarse pointer', () => {
        expect(resolveImportCapacity({
            userAgent: 'Mozilla/5.0 Chrome/140',
            viewportWidth: 390,
            coarsePointer: false,
        })).toEqual(DESKTOP_IMPORT_CAPACITY);
    });

    it('routes only eligible desktop files through DuckDB file intake', () => {
        expect(DESKTOP_DUCKDB_FILE_CAPACITY).toMatchObject({
            maxBytes: 100 * 1024 * 1024,
            maxRows: 1_000_000,
        });
        expect(shouldUseDuckDbFileIntake(26 * 1024 * 1024, DESKTOP_IMPORT_CAPACITY)).toBe(true);
        expect(shouldUseDuckDbFileIntake(101 * 1024 * 1024, DESKTOP_IMPORT_CAPACITY)).toBe(false);
        expect(shouldUseDuckDbFileIntake(26 * 1024 * 1024, MOBILE_IMPORT_CAPACITY)).toBe(false);
    });
});
