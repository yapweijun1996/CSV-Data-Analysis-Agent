import { describe, expect, it } from 'vitest';
import {
    isRecoverableChunkLoadError,
    shouldReloadForStaleChunk,
} from '../utils/staleChunkRecovery';

function createStorage(initialValue: string | null = null) {
    let currentValue = initialValue;

    return {
        getItem: () => currentValue,
        setItem: (_key: string, value: string) => {
            currentValue = value;
        },
        read: () => currentValue,
    };
}

describe('staleChunkRecovery', () => {
    it('detects dynamic import fetch failures', () => {
        expect(isRecoverableChunkLoadError(
            new TypeError('Failed to fetch dynamically imported module: http://localhost:4173/assets/chunk.js'),
        )).toBe(true);
        expect(isRecoverableChunkLoadError(
            'ChunkLoadError: Loading chunk 42 failed.',
        )).toBe(true);
        expect(isRecoverableChunkLoadError({
            reason: { message: 'Importing a module script failed.' },
        })).toBe(true);
    });

    it('ignores unrelated warnings and errors', () => {
        expect(isRecoverableChunkLoadError(
            'Unable to determine content-length from response headers. Will expand buffer when needed.',
        )).toBe(false);
        expect(isRecoverableChunkLoadError(
            new Error('Network request timed out.'),
        )).toBe(false);
        expect(isRecoverableChunkLoadError(null)).toBe(false);
    });

    it('allows a single reload attempt within the cooldown window', () => {
        const storage = createStorage();
        const href = 'http://localhost:4173/';
        const now = 1_000;

        expect(shouldReloadForStaleChunk(storage, href, now)).toBe(true);
        expect(shouldReloadForStaleChunk(storage, href, now + 5_000)).toBe(false);
    });

    it('permits reload after cooldown expiry', () => {
        const storage = createStorage();
        const href = 'http://localhost:4173/';
        const now = 1_000;

        expect(shouldReloadForStaleChunk(storage, href, now)).toBe(true);
        expect(shouldReloadForStaleChunk(storage, href, now + 16_000)).toBe(true);
    });

    it('tracks reload attempts per href', () => {
        const storage = createStorage();
        const firstHref = 'http://localhost:4173/';
        const secondHref = 'http://localhost:4173/report';

        expect(shouldReloadForStaleChunk(storage, firstHref, 1_000)).toBe(true);
        expect(shouldReloadForStaleChunk(storage, secondHref, 2_000)).toBe(true);
        expect(storage.read()).toContain(secondHref);
    });
});
