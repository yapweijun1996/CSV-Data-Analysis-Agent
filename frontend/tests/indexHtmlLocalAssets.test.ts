import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('index.html localhost assets', () => {
    it('does not reference remote CDN or import-map runtime assets', () => {
        const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

        expect(html).not.toContain('https://cdn.tailwindcss.com');
        expect(html).not.toContain('https://unpkg.com/');
        expect(html).not.toContain('https://cdn.jsdelivr.net/');
        expect(html).not.toContain('https://aistudiocdn.com/');
        expect(html).not.toContain('https://esm.sh/');
        expect(html).not.toContain('type="importmap"');
    });

    it('uses one product name and never reopens the boot overlay after React mounts', () => {
        const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

        expect(html).toContain('<div class="loader-title">AI Analysis</div>');
        expect(html).not.toContain('<div class="loader-title">AI Data Analysis</div>');
        expect(html).not.toContain('showOverlay(!initialDismissed)');
        expect(html).toContain('progress belongs to the relevant in-app surface');
    });
});
