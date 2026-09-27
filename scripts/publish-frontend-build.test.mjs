import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const publisher = fileURLToPath(new URL('./publish-frontend-build.mjs', import.meta.url));
const checksum = value => createHash('sha256').update(value).digest('hex');

const writeBuild = async (root, files) => {
  const lines = [];
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
    lines.push(`${checksum(content)}  ${relativePath}`);
  }
  await writeFile(path.join(root, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
};

test('publishes verified files while preserving unrelated files', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'csv-publish-test-'));
  const source = path.join(temporaryRoot, 'source');
  const target = path.join(temporaryRoot, 'target');
  try {
    await mkdir(source);
    await mkdir(target);
    await writeBuild(source, { 'index.html': 'new', 'assets/new.js': 'new asset' });
    await writeBuild(target, { 'index.html': 'old', 'assets/old.js': 'old asset' });
    await writeFile(path.join(target, 'README.md'), 'keep');

    await execFileAsync(process.execPath, [publisher, source, target]);

    assert.equal(await readFile(path.join(target, 'index.html'), 'utf8'), 'new');
    assert.equal(await readFile(path.join(target, 'assets/new.js'), 'utf8'), 'new asset');
    assert.equal(await readFile(path.join(target, 'README.md'), 'utf8'), 'keep');
    await assert.rejects(readFile(path.join(target, 'assets/old.js')));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('rejects changed managed files before publishing anything', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'csv-publish-test-'));
  const source = path.join(temporaryRoot, 'source');
  const target = path.join(temporaryRoot, 'target');
  try {
    await mkdir(source);
    await mkdir(target);
    await writeBuild(source, { 'index.html': 'new' });
    await writeBuild(target, { 'index.html': 'old' });
    await writeFile(path.join(target, 'index.html'), 'user edit');

    await assert.rejects(execFileAsync(process.execPath, [publisher, source, target]));

    assert.equal(await readFile(path.join(target, 'index.html'), 'utf8'), 'user edit');
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
