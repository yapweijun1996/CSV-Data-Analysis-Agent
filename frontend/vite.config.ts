
import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

// FIX: Define __dirname for an ESM context.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function stripLocalModelAssetsPlugin(): Plugin {
  return {
    name: 'strip-local-model-assets',
    apply: 'build',
    closeBundle() {
      const distModelsPath = path.resolve(__dirname, 'dist', 'models');
      if (fs.existsSync(distModelsPath)) {
        fs.rmSync(distModelsPath, { recursive: true, force: true });
      }
    },
  };
}

function shouldExcludeFromModulePreload(file: string): boolean {
  return file.includes('vendor-monaco')
    || file.includes('vendor-ai-local')
    || file.includes('app-agent')
    || file.includes('app-ai')
    || file.includes('duckDbWorker')
    || file.includes('duckdb-browser')
    || file.includes('duckdb-');
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const singleFileBuild = mode === 'single';
  // Content hashes keep every ESM import URL canonical. Appending a version
  // query only in index.html makes Rollup's circular chunk imports load the
  // entry a second time without that query, creating duplicate React/Zustand
  // runtimes in WebKit.
  const jsFileName = 'assets/csv_data_analysis_[name]-[hash].js';
  const assetFileName = 'assets/csv_data_analysis_[name]-[hash].[ext]';

  return {
    base: './',
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    // Keep dependency scanning scoped to the actual browser entry point.
    optimizeDeps: {
      entries: ['index.html'],
    },
    plugins: [
      react(),
      stripLocalModelAssetsPlugin(),
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: [
        { find: /^onnxruntime-web$/, replacement: 'onnxruntime-web/wasm' },
        { find: /^@\//, replacement: `${path.resolve(__dirname, '.')}/` },
      ],
    },
        build: {
            sourcemap: false,
            modulePreload: {
                resolveDependencies: (_filename, dependencies) =>
                    dependencies.filter(dependency => !shouldExcludeFromModulePreload(dependency)),
            },
            minify: false,
            cssCodeSplit: false,
            chunkSizeWarningLimit: singleFileBuild ? 1500 : 900,
            rollupOptions: {
                output: {
                    entryFileNames: jsFileName,
                    chunkFileNames: jsFileName,
                    assetFileNames: assetFileName,
                    inlineDynamicImports: singleFileBuild,
                    ...(!singleFileBuild && {
                        manualChunks(id) {
                            // correlation.ts is a pure utility (no runtime agent deps)
                            // that must remain synchronously importable for telemetry.
                            if (id.includes('/services/agent/correlation')) {
                              return undefined;
                            }
                            // The AI, agent, planning, and reporting modules form one runtime
                            // lifecycle with intentional bidirectional dependencies. Keep them in
                            // one lazy chunk: splitting those directories from each other creates
                            // cross-chunk TDZ failures after dependency upgrades, while leaving all
                            // of them in the entry chunk exceeds the cold-start budget.
                            if (
                              id.includes('/services/ai/')
                              || id.includes('/services/prompts/')
                              || id.includes('/services/agent/')
                              || id.includes('/services/reporting/')
                              || id.includes('/services/dashboard/')
                              || id.includes('/types/preFilter')
                            ) {
                              return 'app-agent';
                            }
                            if (!id.includes('node_modules')) return undefined;
                            // Keep the React runtime family in one chunk to avoid
                            // cross-chunk CommonJS initialization cycles in production.
                            if (
                              id.includes('/react/')
                              || id.includes('/react-dom/')
                              || id.includes('/scheduler/')
                              || id.includes('/use-sync-external-store/')
                            ) {
                              return 'vendor-react-core';
                            }
                            if (id.includes('/node_modules/monaco-editor/')) {
                              return 'vendor-monaco';
                            }
                            if (id.includes('/@duckdb/duckdb-wasm/')) {
                              return 'vendor-duckdb';
                            }
                            if (id.includes('/@huggingface/transformers/') || id.includes('/onnxruntime-web/')) {
                              return 'vendor-ai-local';
                            }
                            if (id.includes('/node_modules/@ai-sdk/google/')) {
                              return 'vendor-ai-google';
                            }
                            if (id.includes('/node_modules/@ai-sdk/openai/')) {
                              return 'vendor-ai-openai';
                            }
                            if (
                              id.includes('/node_modules/@ai-sdk/')
                              || id.includes('/node_modules/ai/')
                            ) {
                              return 'vendor-ai-sdk';
                            }
                            if (
                              id.includes('/chart.js/')
                              || id.includes('/chartjs-plugin-zoom/')
                              || id.includes('/chartjs-plugin-datalabels/')
                              || id.includes('/tabulator-tables/')
                              || id.includes('/highlight.js/')
                              || id.includes('/react-masonry-css/')
                            ) {
                              return 'vendor-ui';
                            }
                            if (id.includes('/papaparse/') || id.includes('/json5/')) {
                              return 'vendor-data';
                            }
                            if (id.includes('/zustand/')) {
                              return 'vendor-state';
                            }
                            if (id.includes('/idb/')) {
                              return 'vendor-storage';
              }
              // Let Rollup place the remaining packages by their real import
              // graph. A catch-all vendor chunk can import React adapters that
              // also depend on vendor-react-core, creating a circular startup
              // edge in production builds.
              return undefined;
            },
          }),
        },
      },
    },
    worker: {
      format: 'es',
      rollupOptions: {
        output: {
          entryFileNames: jsFileName,
          chunkFileNames: jsFileName,
          assetFileNames: 'assets/[name].[ext]',
          inlineDynamicImports: singleFileBuild,
        },
      },
    },
  };
});
