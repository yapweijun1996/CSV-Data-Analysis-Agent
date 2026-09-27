import fs from 'fs';
import path from 'path';

const DIST_DIR = path.resolve('dist');
const INDEX_HTML_PATH = path.join(DIST_DIR, 'index.html');
const BASELINE_PATH = path.resolve('scripts/bundle-budget-baseline.json');
const ENTRY_BUDGET_BYTES = 850 * 1024;
const EAGER_CHUNK_BUDGET_BYTES = 900 * 1024;
const FORBIDDEN_EAGER_PATTERNS = [
  /vendor-monaco/i,
  /vendor-ai-local/i,
  /agrun/i,
  /vendor-duckdb/i,
  /duckDbWorker/i,
  /duckdb-browser/i,
  /app-agent/i,
  /app-ai/i,
];
const FORBIDDEN_EAGER_CONTENT = [
  {
    label: 'Agent Runtime JavaScript distribution',
    pattern: /agrun\.trace\.v1/,
  },
];

const failures = [];
const warnings = [];

const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
// Production asset filenames are content-hashed. The capture group excludes
// any query defensively so statSync/basename operate on the real filename.
const entryMatch = html.match(/<script type="module" crossorigin src="([^"?]+csv_data_analysis_index[^"?]*\.js)(?:\?[^"]*)?"><\/script>/);

if (!entryMatch) {
  throw new Error('Unable to locate the production entry script in dist/index.html.');
}

const preloadMatches = [...html.matchAll(/<link rel="modulepreload" crossorigin href="([^"?]+\.js)(?:\?[^"]*)?">/g)];

// Fail loud if the preload regex silently under-matches (e.g. a Vite upgrade
// reorders/adds attributes like as="script"): otherwise dropped eager chunks
// would escape both the byte budget and the forbidden-eager-pattern check.
const preloadTagCount = (html.match(/<link rel="modulepreload"/g) || []).length;
if (preloadMatches.length !== preloadTagCount) {
  throw new Error(
    `Bundle budget: parsed ${preloadMatches.length} of ${preloadTagCount} modulepreload links in `
    + 'dist/index.html — the preload <link> attribute shape changed (likely a Vite upgrade). '
    + 'Update the preload regex in scripts/check-bundle-budget.mjs.',
  );
}
const eagerScripts = [entryMatch[1], ...preloadMatches.map(match => match[1])];

const toAbsoluteDistPath = (assetPath) => {
  const normalizedAssetPath = assetPath.replace(/^\//, '');
  return path.join(DIST_DIR, normalizedAssetPath);
};

const eagerAssetSummaries = eagerScripts.map((assetPath) => {
  const absolutePath = toAbsoluteDistPath(assetPath);
  const bytes = fs.statSync(absolutePath).size;
  return {
    assetPath,
    bytes,
    fileName: path.basename(assetPath),
  };
});

const entryAsset = eagerAssetSummaries[0];
if (entryAsset.bytes >= ENTRY_BUDGET_BYTES) {
  failures.push(
    `Entry chunk ${entryAsset.fileName} is ${entryAsset.bytes} bytes, exceeding the ${ENTRY_BUDGET_BYTES} byte budget.`,
  );
}

for (const summary of eagerAssetSummaries) {
  if (summary.bytes >= EAGER_CHUNK_BUDGET_BYTES) {
    failures.push(
      `Eager chunk ${summary.fileName} is ${summary.bytes} bytes, exceeding the ${EAGER_CHUNK_BUDGET_BYTES} byte budget.`,
    );
  }

  if (FORBIDDEN_EAGER_PATTERNS.some(pattern => pattern.test(summary.fileName))) {
    failures.push(`Lazy-only asset ${summary.fileName} was included in the eager preload chain.`);
  }

  const source = fs.readFileSync(toAbsoluteDistPath(summary.assetPath), 'utf8');
  for (const forbidden of FORBIDDEN_EAGER_CONTENT) {
    if (forbidden.pattern.test(source)) {
      failures.push(
        `${forbidden.label} was bundled into eager asset ${summary.fileName}.`,
      );
    }
  }
}

const baseline = fs.existsSync(BASELINE_PATH)
  ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
  : null;

const findMaxBytesByPattern = (directory, pattern) => {
  if (!fs.existsSync(directory)) {
    return null;
  }
  const entries = fs.readdirSync(directory)
    .filter(fileName => pattern.test(fileName))
    .map(fileName => fs.statSync(path.join(directory, fileName)).size);
  return entries.length > 0 ? Math.max(...entries) : null;
};

if (baseline) {
  const duckDbWasmMaxBytes = findMaxBytesByPattern(path.join(DIST_DIR, 'assets'), /^duckdb-.*\.wasm$/);
  const ortWasmMaxBytes = findMaxBytesByPattern(path.join(DIST_DIR, 'transformers-wasm'), /^ort-wasm.*\.wasm$/);

  if (duckDbWasmMaxBytes && duckDbWasmMaxBytes > baseline.duckdb_wasm_max_bytes * 1.1) {
    warnings.push(
      `DuckDB WASM assets grew to ${duckDbWasmMaxBytes} bytes, more than 10% above the ${baseline.duckdb_wasm_max_bytes} byte baseline.`,
    );
  }

  if (ortWasmMaxBytes && ortWasmMaxBytes > baseline.ort_wasm_max_bytes * 1.1) {
    warnings.push(
      `ONNX runtime WASM assets grew to ${ortWasmMaxBytes} bytes, more than 10% above the ${baseline.ort_wasm_max_bytes} byte baseline.`,
    );
  }
}

console.log('Bundle budget summary:');
for (const summary of eagerAssetSummaries) {
  console.log(`- eager ${summary.fileName}: ${summary.bytes} bytes`);
}

if (warnings.length > 0) {
  console.warn('Bundle budget warnings:');
  warnings.forEach(warning => console.warn(`- ${warning}`));
}

if (failures.length > 0) {
  console.error('Bundle budget failures:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Bundle budget checks passed.');
