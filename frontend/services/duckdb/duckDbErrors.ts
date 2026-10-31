// DuckDB can overflow its HUGEINT accumulator before SQL-level decimal guards run.
export const translateDuckDbQueryError = (error: unknown): unknown => {
    if (error instanceof Error && (/^Out of Range Error:\s*Overflow in (?:(?:HUGEINT|DECIMAL)\b|(?:addition|subtraction|multiplication|division) of INT128\b)/i.test(error.message)
        || /^(?:Invalid Input Error:\s*)?exact_decimal_overflow$/.test(error.message))) {
        return new Error('exact_decimal_overflow');
    }
    return error;
};
