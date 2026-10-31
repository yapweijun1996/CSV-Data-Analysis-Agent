import { describe, expect, it } from 'vitest';
import { translateDuckDbQueryError } from '../services/duckdb/duckDbErrors';

describe('DuckDB query error translation', () => {
    it('replaces native HUGEINT overflow without leaking the original message', () => {
        const translated = translateDuckDbQueryError(new Error('Out of Range Error: Overflow in HUGEINT addition'));
        expect(translated).toBeInstanceOf(Error);
        expect((translated as Error).message).toBe('exact_decimal_overflow');
    });

    it('replaces native INT128 multiplication overflow', () => {
        const translated = translateDuckDbQueryError(new Error('Out of Range Error: Overflow in multiplication of INT128 (values)!'));
        expect((translated as Error).message).toBe('exact_decimal_overflow');
    });

    it('normalizes the SQL-level decimal guard', () => {
        expect((translateDuckDbQueryError(new Error('Invalid Input Error: exact_decimal_overflow')) as Error).message)
            .toBe('exact_decimal_overflow');
    });

    it('preserves unrelated errors unchanged', () => {
        const error = new Error('Binder Error: unrelated');
        expect(translateDuckDbQueryError(error)).toBe(error);
        expect(translateDuckDbQueryError('unrelated')).toBe('unrelated');
    });
});
