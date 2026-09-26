import { copyFile, lstat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existingRegularFile, hashFile, readManifest } from './site-manifest.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.resolve(process.argv[2] ?? repositoryRoot);
const outputRoot = path.resolve(process.argv[3] ?? path.join(repositoryRoot, 'pages-artifact'));
const rootFiles = new Set([
  '404.html', '_headers', '_redirects', 'app-icon.svg', 'favicon.svg',
  'index.html', 'manifest.webmanifest', 'offline.html', 'service-worker.js',
]);
const assetDirectories = ['assets/', 'demo-data/', 'duckdb/', 'pyodide/', 'sandbox/'];
const requiredFiles = ['index.html', 'manifest.webmanifest', 'offline.html', 'service-worker.js'];

const manifest = await readManifest(sourceRoot);
if (manifest.size === 0 || ![...manifest.keys()].some(relativePath => relativePath.startsWith('assets/'))) {
  throw new Error('No application assets are listed in the build manifest.');
}
for (const requiredFile of requiredFiles) {
  if (!manifest.has(requiredFile)) throw new Error(`Missing required site file: ${requiredFile}`);
}

// The deployment allowlist prevents source and test files from entering the Pages artifact.
for (const [relativePath, expectedHash] of manifest) {
  if (!rootFiles.has(relativePath)
    && !assetDirectories.some(directory => relativePath.startsWith(directory))) {
    throw new Error(`Unexpected path in build manifest: ${relativePath}`);
  }
  const sourcePath = path.join(sourceRoot, relativePath);
  if (!(await existingRegularFile(sourcePath)) || await hashFile(sourcePath) !== expectedHash) {
    throw new Error(`Build checksum mismatch: ${relativePath}`);
  }
}

try {
  await lstat(outputRoot);
  throw new Error(`Refusing to replace an existing artifact directory: ${outputRoot}`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

await mkdir(outputRoot, { recursive: true });
for (const relativePath of manifest.keys()) {
  const destination = path.join(outputRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join(sourceRoot, relativePath), destination);
}
await copyFile(path.join(sourceRoot, 'SHA256SUMS.txt'), path.join(outputRoot, 'SHA256SUMS.txt'));
await writeFile(path.join(outputRoot, '.nojekyll'), '');
console.log(`Staged ${manifest.size} verified site files in ${outputRoot}.`);
