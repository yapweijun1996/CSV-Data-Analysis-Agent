import type { CsvData, CsvRow, SensitiveDataReasonCode, SensitiveDataWarning } from '../../types';

const MAX_SAMPLE_ROWS = 200;
const MAX_MATCHED_COLUMNS = 12;

interface HeaderSignal {
    reasonCode: SensitiveDataReasonCode;
    pattern: RegExp;
}

const HEADER_SIGNALS: HeaderSignal[] = [
    { reasonCode: 'identity_document', pattern: /^(nric|fin|passport(?:_?(?:no|number))?|social_?security(?:_?(?:no|number))?|ssn)$/i },
    { reasonCode: 'contact_information', pattern: /^(e_?mail|email_?address|phone|phone_?(?:no|number)|mobile|mobile_?(?:no|number)|telephone|contact_?(?:no|number)|home_?address|date_?of_?birth|dob)$/i },
    { reasonCode: 'financial_account', pattern: /^(bank_?account|bank_?account_?(?:no|number)|iban|swift|bic)$/i },
    { reasonCode: 'health_information', pattern: /^(patient_?(?:id|name)|diagnosis|medical_?(?:record|condition)|health_?(?:record|condition)|medication)$/i },
    { reasonCode: 'payment_card', pattern: /^(credit_?card|debit_?card|card_?(?:no|number)|pan)$/i },
];

const normalizeHeader = (value: string): string =>
    value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const matchesNric = (value: string): boolean => /^[STFGM]\d{7}[A-Z]$/i.test(value.trim());

const matchesEmail = (value: string): boolean =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.trim().length <= 254;

const passesLuhn = (digits: string): boolean => {
    let sum = 0;
    let doubleDigit = false;
    for (let index = digits.length - 1; index >= 0; index -= 1) {
        let digit = Number(digits[index]);
        if (doubleDigit) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
        doubleDigit = !doubleDigit;
    }
    return sum % 10 === 0;
};

const matchesPaymentCard = (value: string): boolean => {
    const digits = value.replace(/[\s-]/g, '');
    return /^\d{13,19}$/.test(digits) && passesLuhn(digits);
};

const getHeaderSignal = (column: string): SensitiveDataReasonCode | null => {
    const normalized = normalizeHeader(column);
    return HEADER_SIGNALS.find(signal => signal.pattern.test(normalized))?.reasonCode ?? null;
};

const getRowColumns = (rows: CsvRow[]): string[] => {
    const columns = new Set<string>();
    rows.slice(0, MAX_SAMPLE_ROWS).forEach(row => {
        Object.keys(row).forEach(column => columns.add(column));
    });
    return [...columns];
};

/**
 * Detects only high-confidence sensitive-data signals in a bounded local sample.
 * The result is used for a local acknowledgement gate and is never telemetry.
 */
export const detectSensitiveData = (
    csvData: CsvData | null | undefined,
): SensitiveDataWarning | null => {
    if (!csvData?.data?.length) return null;

    const rows = csvData.data.slice(0, MAX_SAMPLE_ROWS);
    const columns = getRowColumns(rows);
    const reasons = new Set<SensitiveDataReasonCode>();
    const matchedColumns = new Set<string>();
    let sampleMatchCount = 0;

    columns.forEach(column => {
        const headerReason = getHeaderSignal(column);
        if (headerReason) {
            reasons.add(headerReason);
            matchedColumns.add(column);
        }

        rows.forEach(row => {
            const rawValue = row[column];
            if (rawValue === null || rawValue === undefined) return;
            const value = String(rawValue).trim();
            if (!value) return;

            if (matchesNric(value)) {
                reasons.add('identity_document');
                matchedColumns.add(column);
                sampleMatchCount += 1;
            } else if (matchesEmail(value)) {
                reasons.add('contact_information');
                matchedColumns.add(column);
                sampleMatchCount += 1;
            } else if (headerReason === 'payment_card' && matchesPaymentCard(value)) {
                reasons.add('payment_card');
                matchedColumns.add(column);
                sampleMatchCount += 1;
            }
        });
    });

    if (reasons.size === 0) return null;
    return {
        reasonCodes: [...reasons].sort(),
        matchedColumns: [...matchedColumns].slice(0, MAX_MATCHED_COLUMNS),
        sampleMatchCount,
    };
};
