// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAllOpfsDatasetData } from '../services/data/opfsDatasetStorage';

describe('clearAllOpfsDatasetData', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('removes only the app-owned OPFS root recursively', async () => {
        const removeEntry = vi.fn(async () => undefined);
        vi.stubGlobal('navigator', {
            storage: { getDirectory: vi.fn(async () => ({ removeEntry })) },
        });

        await expect(clearAllOpfsDatasetData()).resolves.toBe(true);
        expect(removeEntry).toHaveBeenCalledWith('csv-analysis-agent-temp', { recursive: true });
    });

    it('treats a missing app directory as already cleared', async () => {
        const error = new DOMException('missing', 'NotFoundError');
        vi.stubGlobal('navigator', {
            storage: {
                getDirectory: vi.fn(async () => ({
                    removeEntry: vi.fn(async () => { throw error; }),
                })),
            },
        });

        await expect(clearAllOpfsDatasetData()).resolves.toBe(true);
    });
});
