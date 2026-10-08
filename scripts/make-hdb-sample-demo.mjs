// Builds the small HDB demo sample from the full raw demo CSV.
// Takes every STEP-th data row (first row included) byte for byte: no cleaning, no reordering,
// so the sample keeps every era's quirks. Re-run after `demo:hdb:refresh` changes the full file.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const STEP = 197;
const dir = path.resolve('demo-data');
const fullPath = path.join(dir, 'singapore-hdb-resale-prices.csv');
const samplePath = path.join(dir, 'singapore-hdb-resale-prices-sample.csv');
const manifestPath = path.join(dir, 'singapore-hdb-resale-prices.manifest.json');

const lines = (await readFile(fullPath, 'utf8')).split('\n');
if (lines.at(-1) === '') lines.pop();
const [header, ...rows] = lines;
const picked = rows.filter((_, index) => index % STEP === 0);
const sample = `${[header, ...picked].join('\n')}\n`;
await writeFile(samplePath, sample);

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.sample = {
    file: path.basename(samplePath),
    method: `Every ${STEP}th data row of the full file, starting with the first, in source order; row text is copied byte for byte (no cleaning, no reordering).`,
    rowCount: picked.length,
    sha256: createHash('sha256').update(sample).digest('hex'),
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${picked.length} sample rows to ${samplePath}`);
