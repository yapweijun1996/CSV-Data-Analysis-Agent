import { describe, expect, it } from 'vitest';
import { isDebugModeEnabled } from '../utils/debugMode';

describe('isDebugModeEnabled', () => {
    it('is off by default', () => {
        expect(isDebugModeEnabled({ search: '', hash: '' })).toBe(false);
        expect(isDebugModeEnabled({ search: '?debug_yn=n', hash: '' })).toBe(false);
    });
    it('is on for ?debug_yn=y in query or hash route', () => {
        expect(isDebugModeEnabled({ search: '?debug_yn=y', hash: '' })).toBe(true);
        expect(isDebugModeEnabled({ search: '?a=1&debug_yn=Y', hash: '' })).toBe(true);
        expect(isDebugModeEnabled({ search: '', hash: '#/x?debug_yn=y' })).toBe(true);
    });
});
