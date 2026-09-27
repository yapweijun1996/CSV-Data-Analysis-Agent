import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const activeRoots = [
  'App.tsx',
  'index.tsx',
  'components',
  'config',
  'hooks',
  'icons',
  'services',
  'store',
  'tests',
  'types',
  'utils',
  'vite.config.ts',
  'vitest.config.ts',
];
const textExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.css']);
const findings = [];
const mergeConflictPattern = /^(<{7}(?: .*)?|={7}|>{7}(?: .*)?|\|{7}(?: .*)?)$/m;

const walk = (relativePath) => {
  const absolutePath = path.join(repoRoot, relativePath);
  const stats = statSync(absolutePath);
  if (stats.isDirectory()) {
    for (const entry of readdirSync(absolutePath)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'output' || entry === 'public') {
        continue;
      }
      walk(path.join(relativePath, entry));
    }
    return;
  }

  const extension = path.extname(relativePath);
  if (!textExtensions.has(extension) && path.basename(relativePath) !== 'package.json') {
    return;
  }

  const source = readFileSync(absolutePath, 'utf8');
  if (mergeConflictPattern.test(source)) {
    findings.push(`${relativePath}: merge conflict markers detected`);
  }
  if (
    /(?:from|import|require\()\s*['"`][^'"`]*sample project for study only\//.test(source)
    || /['"`][^'"`]*sample project for study only\/[^'"`]*['"`]\s*;?/.test(source) && /import\s*\(/.test(source)
  ) {
    findings.push(`${relativePath}: must not reference "sample project for study only/" from active code`);
  }
  if (/from\s+['"]\.?\/?src\//.test(source) || /from\s+['"]@\/src\//.test(source)) {
    findings.push(`${relativePath}: active code should not import from duplicate "src/" tree`);
  }
};

for (const relativePath of activeRoots) {
  walk(relativePath);
}

if (findings.length > 0) {
  console.error('Lint baseline failed:\n');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log('Lint baseline passed.');
