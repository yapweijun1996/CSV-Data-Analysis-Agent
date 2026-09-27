import { copyFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existingRegularFile, hashFile, readManifest } from './site-manifest.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.resolve(process.argv[2] ?? path.join(repositoryRoot, 'frontend', 'dist'));
const targetRoot = path.resolve(process.argv[3] ?? repositoryRoot);

const nextFiles = await readManifest(sourceRoot);
const currentFiles = await readManifest(targetRoot, true);
if (nextFiles.size === 0) throw new Error('The frontend build has no checksum entries.');

// Check every managed path before changing the published root.
for (const [relativePath, expectedHash] of nextFiles) {
  const sourcePath = path.join(sourceRoot, relativePath);
  if (!(await existingRegularFile(sourcePath)) || await hashFile(sourcePath) !== expectedHash) {
    throw new Error(`Build checksum mismatch: ${relativePath}`);
  }
  const targetPath = path.join(targetRoot, relativePath);
  if (await existingRegularFile(targetPath)) {
    const currentHash = await hashFile(targetPath);
    if (currentHash !== currentFiles.get(relativePath) && currentHash !== expectedHash) {
      throw new Error(`Refusing to overwrite a changed or unmanaged file: ${relativePath}`);
    }
  }
}

for (const [relativePath, expectedHash] of currentFiles) {
  if (nextFiles.has(relativePath)) continue;
  const targetPath = path.join(targetRoot, relativePath);
  if (!(await existingRegularFile(targetPath)) || await hashFile(targetPath) !== expectedHash) {
    throw new Error(`Refusing to remove a changed build file: ${relativePath}`);
  }
}

for (const relativePath of nextFiles.keys()) {
  const targetPath = path.join(targetRoot, relativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(path.join(sourceRoot, relativePath), targetPath);
}
for (const relativePath of currentFiles.keys()) {
  if (!nextFiles.has(relativePath)) await unlink(path.join(targetRoot, relativePath));
}
await copyFile(path.join(sourceRoot, 'SHA256SUMS.txt'), path.join(targetRoot, 'SHA256SUMS.txt'));
console.log(`Published ${nextFiles.size} verified build files to ${targetRoot}.`);
