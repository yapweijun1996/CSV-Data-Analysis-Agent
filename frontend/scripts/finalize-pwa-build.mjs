import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { zipSync } from 'fflate';

const root = process.cwd();
const distDirectory = path.join(root, 'dist');
const artifactDirectory = path.join(root, 'release-artifacts');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(packageJson.version);
const stableMtime = new Date('2026-01-01T00:00:00.000Z');

const walk = async (directory, prefix = '') => {
    const names = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of names.sort((left, right) => left.name.localeCompare(right.name))) {
        const relativePath = path.posix.join(prefix, entry.name);
        if (entry.isDirectory()) {
            files.push(...await walk(path.join(directory, entry.name), relativePath));
        } else {
            files.push(relativePath);
        }
    }
    return files;
};

const digest = value => createHash('sha256').update(value).digest('hex');
const indexHtml = await readFile(path.join(distDirectory, 'index.html'), 'utf8');
const buildVersion = `${version}-${digest(indexHtml).slice(0, 12)}`;
const referencedAssets = [...indexHtml.matchAll(/(?:src|href)="([^"#]+)"/g)]
    .map(match => match[1])
    .filter(value => !/^(?:https?:|data:|#)/i.test(value))
    .map(value => value.startsWith('./') ? value : `./${value.replace(/^\//, '')}`);
const essentialOfflinePatterns = [
    'HistoryPanel',
    'DatabaseModal',
    'SettingsModal',
    'AnalysisPanel',
    'SpreadsheetPanel',
    'TabulatorTable',
    'MarkdownRenderer',
    'exportUtils',
    'vendor-ui',
];
const builtFiles = await walk(distDirectory);
const essentialOfflineAssets = builtFiles
    .filter(file => essentialOfflinePatterns.some(pattern => file.includes(pattern)))
    .map(file => `./${file}`);
const precache = [...new Set([
    './',
    './index.html',
    './offline.html',
    './manifest.webmanifest',
    './favicon.svg',
    './app-icon.svg',
    ...referencedAssets,
    ...essentialOfflineAssets,
])].sort();

const workerPath = path.join(distDirectory, 'service-worker.js');
const workerTemplate = await readFile(path.join(root, 'public', 'service-worker.js'), 'utf8');
const worker = workerTemplate
    .replace('__PWA_BUILD_VERSION__', buildVersion)
    .replace(/\/\*__PWA_PRECACHE__\*\/\s*\[[\s\S]*?\];/, `${JSON.stringify(precache, null, 2)};`);
if (worker === workerTemplate) {
    throw new Error('PWA service-worker template markers were not replaced.');
}
await writeFile(workerPath, worker);

const filesBeforeManifest = (await walk(distDirectory))
    .filter(file => file !== 'SHA256SUMS.txt');
const checksumLines = [];
for (const file of filesBeforeManifest) {
    checksumLines.push(`${digest(await readFile(path.join(distDirectory, file)))}  ${file}`);
}
await writeFile(
    path.join(distDirectory, 'SHA256SUMS.txt'),
    `${checksumLines.join('\n')}\n`,
);

const finalFiles = await walk(distDirectory);
const archiveEntries = {};
for (const file of finalFiles) {
    archiveEntries[file] = [
        new Uint8Array(await readFile(path.join(distDirectory, file))),
        { mtime: stableMtime },
    ];
}
await mkdir(artifactDirectory, { recursive: true });
const archivePath = path.join(
    artifactDirectory,
    `react-csv-data-analysis-agent-${version}-rollback.zip`,
);
await writeFile(archivePath, zipSync(archiveEntries, { level: 9 }));

console.log(`Finalized PWA ${buildVersion} with ${precache.length} shell entries.`);
console.log(`Wrote ${checksumLines.length} SHA-256 entries and ${path.relative(root, archivePath)}.`);
