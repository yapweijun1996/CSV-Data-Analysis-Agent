import { describe, expect, it } from 'vitest';
import { isInitialAnalysisProviderFailure } from '../services/agent/runtime/pi/initialAnalysisFailure';

describe('initial analysis failure classification', () => {
    it('recognizes provider transport, authentication, and timeout failures', () => {
        expect(isInitialAnalysisProviderFailure({ status: 503, message: 'Service unavailable' })).toBe(true);
        expect(isInitialAnalysisProviderFailure(new Error('Invalid API key'))).toBe(true);
        expect(isInitialAnalysisProviderFailure(new Error('Failed to fetch'))).toBe(true);
        expect(isInitialAnalysisProviderFailure(new Error('Provider request timed out'))).toBe(true);
    });

    it('does not label analysis evidence or Pi budget failures as provider outages', () => {
        expect(isInitialAnalysisProviderFailure(new Error('No verified analysis cards'))).toBe(false);
        expect(isInitialAnalysisProviderFailure(new Error('The Pi initial-analysis time budget expired.'))).toBe(false);
        expect(isInitialAnalysisProviderFailure(new Error('Structure review is required.'))).toBe(false);
    });
});
