import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
        test: {
            environment: 'jsdom',
            setupFiles: ['./tests/setup.ts'],
            // The corpus and browser-like suites are CPU/memory heavy. Capping
            // workers prevents otherwise healthy per-file tests from timing out
            // under host-level contention in CI and local release checks.
            maxWorkers: 4,
            testTimeout: 15_000,
            include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
            exclude: [
                'sample project for study only/**',
                'dist/**',
                'node_modules/**',
                'tests/live/**',
                'tests/live*.test.ts',
            ],
            env,
        },
    };
});
