import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, 'node_modules', 'pyodide');
const targetRoot = path.join(projectRoot, 'public', 'pyodide');
const files = [
    'pyodide.js',
    'pyodide.asm.js',
    'pyodide.asm.wasm',
    'python_stdlib.zip',
    'pyodide-lock.json',
];

await fs.mkdir(targetRoot, { recursive: true });
await Promise.all(files.map(fileName => fs.copyFile(
    path.join(sourceRoot, fileName),
    path.join(targetRoot, fileName),
)));

console.log(`Synced ${files.length} Pyodide runtime assets to public/pyodide.`);
