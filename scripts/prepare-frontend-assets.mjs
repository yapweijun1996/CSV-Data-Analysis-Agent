import { cp, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(repositoryRoot, 'frontend', 'public');
const resourceNames = ['duckdb', 'demo-data'];

if (process.argv.includes('--models')) {
  resourceNames.push('public/models');
}

for (const resourceName of resourceNames) {
  const source = path.join(repositoryRoot, resourceName);
  const destination = path.join(publicRoot, path.basename(resourceName));
  if (!(await stat(source)).isDirectory()) {
    throw new Error(`Expected runtime resource directory: ${source}`);
  }
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
}

console.log(`Prepared frontend public resources: ${resourceNames.join(', ')}.`);
