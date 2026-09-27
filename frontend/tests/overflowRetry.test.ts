// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { isContextOverflowError, runWithOverflowCompaction } from '../services/ai/overflowRetry';

describe('overflowRetry', () => {
    it('classifies provider-specific overflow errors', () => {
        expect(isContextOverflowError('openai', new Error('maximum context length exceeded'))).toBe(true);
        expect(isContextOverflowError('google', new Error('request too large for context window'))).toBe(true);
        expect(isContextOverflowError('google', new Error('permission denied'))).toBe(false);
    });

    it('retries once with overflow compaction when the first attempt overflows', async () => {
        const execute = vi.fn<(mode: 'normal' | 'overflow_retry') => Promise<string>>()
            .mockRejectedValueOnce(new Error('prompt too long'))
            .mockResolvedValueOnce('ok');

        const result = await runWithOverflowCompaction({
            provider: 'openai',
            execute,
        });

        expect(result).toBe('ok');
        expect(execute).toHaveBeenNthCalledWith(1, 'normal');
        expect(execute).toHaveBeenNthCalledWith(2, 'overflow_retry');
        expect(execute).toHaveBeenCalledTimes(2);
    });
});
