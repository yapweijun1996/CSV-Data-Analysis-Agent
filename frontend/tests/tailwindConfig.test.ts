// @vitest-environment node

import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tailwindConfig = require('../tailwind.config.cjs');

describe('tailwind config', () => {
    it('scans icon components so spinner animation classes are generated', () => {
        expect(tailwindConfig.content).toContain('./icons/**/*.{ts,tsx}');
    });
});
