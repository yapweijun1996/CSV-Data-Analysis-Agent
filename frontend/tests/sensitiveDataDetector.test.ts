// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { detectSensitiveData } from '../services/privacy/sensitiveDataDetector';

describe('detectSensitiveData', () => {
    it('detects high-confidence header and sampled-value signals', () => {
        const result = detectSensitiveData({
            fileName: 'contacts.csv',
            data: [
                { customer: 'A', email: 'person@example.com', reference: 'S1234567D' },
                { customer: 'B', email: 'other@example.com', reference: 'invoice-2' },
            ],
        });

        expect(result).toEqual({
            reasonCodes: ['contact_information', 'identity_document'],
            matchedColumns: ['email', 'reference'],
            sampleMatchCount: 3,
        });
    });

    it('uses Luhn validation before treating a card field as payment data', () => {
        const result = detectSensitiveData({
            fileName: 'payments.csv',
            data: [
                { card_number: '4242 4242 4242 4242', amount: 25 },
                { card_number: '1234 5678 9012 3456', amount: 35 },
            ],
        });

        expect(result?.reasonCodes).toContain('payment_card');
        expect(result?.sampleMatchCount).toBe(1);
    });

    it('does not flag ordinary business data', () => {
        expect(detectSensitiveData({
            fileName: 'sales.csv',
            data: [
                { order_id: 'SO-1001', town: 'WOODLANDS', resale_price: 603789953 },
            ],
        })).toBeNull();
    });

    it('limits scanning to a bounded sample', () => {
        const data = Array.from({ length: 201 }, (_, index) => ({
            value: index === 200 ? 'late@example.com' : `row-${index}`,
        }));

        expect(detectSensitiveData({ fileName: 'bounded.csv', data })).toBeNull();
    });
});
