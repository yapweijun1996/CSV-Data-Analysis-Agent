import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

export const readManifest = async (root, optional = false) => {
  let content;
  try {
    content = await readFile(path.join(root, 'SHA256SUMS.txt'), 'utf8');
  } catch (error) {
    if (optional && error.code === 'ENOENT') return new Map();
    throw error;
  }

  const files = new Map();
  for (const line of content.trim().split('\n')) {
    if (!line) continue;
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match) throw new Error(`Invalid checksum manifest line: ${line}`);
    const relativePath = match[2];
    if (path.posix.normalize(relativePath) !== relativePath
      || relativePath.startsWith('/')
      || relativePath.split('/').includes('..')
      || files.has(relativePath)) {
      throw new Error(`Unsafe checksum manifest path: ${relativePath}`);
    }
    files.set(relativePath, match[1]);
  }
  return files;
};

export const hashFile = async filePath => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
};

export const existingRegularFile = async filePath => {
  try {
    const entry = await lstat(filePath);
    if (!entry.isFile()) throw new Error(`Expected a regular file: ${filePath}`);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
};
