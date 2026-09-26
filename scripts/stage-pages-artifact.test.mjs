import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const stager = fileURLToPath(new URL('./stage-pages-artifact.mjs', import.meta.url));
const checksum = value => createHash('sha256').update(value).digest('hex');

const writeSite = async (root, extraFiles = {}) => {
  const files = {
    'index.html': '<html></html>',
    'service-worker.js': 'self.addEventListener("install", () => {});',
    'manifest.webmanifest': '{}',
    'offline.html': '<html>Offline</html>',
    'assets/app.js': 'export {}',
    ...extraFiles,
  };
  const lines = [];
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
    lines.push(`${checksum(content)}  ${relativePath}`);
  }
  await writeFile(path.join(root, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
};

test('stages only verified deployment files', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'csv-pages-test-'));
  const source = path.join(temporaryRoot, 'source');
  const output = path.join(temporaryRoot, 'output');
  try {
    await mkdir(source);
    await writeSite(source);
    await mkdir(path.join(source, 'frontend'));
    await writeFile(path.join(source, 'frontend', 'App.tsx'), 'private source');

    await execFileAsync(process.execPath, [stager, source, output]);

    assert.equal(await readFile(path.join(output, 'assets/app.js'), 'utf8'), 'export {}');
    assert.equal(await readFile(path.join(output, '.nojekyll'), 'utf8'), '');
    await assert.rejects(readFile(path.join(output, 'frontend', 'App.tsx')));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('rejects source paths and tampered build files before creating an artifact', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'csv-pages-test-'));
  const source = path.join(temporaryRoot, 'source');
  const output = path.join(temporaryRoot, 'output');
  try {
    await mkdir(source);
    await writeSite(source, { 'frontend/App.tsx': 'unexpected source' });
    await assert.rejects(execFileAsync(process.execPath, [stager, source, output]));
    await assert.rejects(readFile(path.join(output, 'index.html')));

    await writeSite(source);
    await writeFile(path.join(source, 'assets/app.js'), 'tampered');
    await assert.rejects(execFileAsync(process.execPath, [stager, source, output]));
    await assert.rejects(readFile(path.join(output, 'index.html')));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
