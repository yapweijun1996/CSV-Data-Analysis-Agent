import { describe, expect, it } from 'vitest';
import { sanitizeToolLogDetail } from '../services/agent/toolLogSanitizer';

describe('sanitizeToolLogDetail', () => {
    it('replaces workspace.replace raw payloads with compact summaries', () => {
        const detail = sanitizeToolLogDetail('workspace.replace', {
            path: '/dataset/cleaned.csv',
            oldText: 'header1,header2\nvalue1,value2\n',
            newText: '',
            replaceAll: false,
        });

        expect(detail).toEqual(expect.objectContaining({
            path: '/dataset/cleaned.csv',
            replaceAll: false,
        }));
        expect(detail).toHaveProperty('diffSummary');
        expect(detail).toHaveProperty('oldTextSummary');
        expect(detail).toHaveProperty('newTextSummary');
        expect(detail).not.toHaveProperty('oldText');
        expect(detail).not.toHaveProperty('newText');
    });

    it('replaces workspace.write raw content with a compact summary', () => {
        const detail = sanitizeToolLogDetail('workspace.write', {
            path: '/dataset/cleaned.csv',
            content: 'header1,header2\nvalue1,value2\n',
        });

        expect(detail).toEqual(expect.objectContaining({
            path: '/dataset/cleaned.csv',
            mode: 'write',
        }));
        expect(detail).toHaveProperty('contentSummary');
        expect(detail).not.toHaveProperty('content');
    });
});
