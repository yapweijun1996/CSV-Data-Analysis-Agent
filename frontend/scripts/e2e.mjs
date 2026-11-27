// Unified e2e runner: serves the built frontend/dist with `vite preview`, then runs the
// browser smoke scripts against it. Never talks to external services.
//   npm run e2e                 -> build (if dist missing) + fast suite
//   npm run e2e -- --full       -> also run the slow source-record-stream smoke (~1-2 min)
//   npm run e2e -- --no-build   -> fail instead of building when dist is missing
//   npm run e2e -- --only dialog-frames -> run just the named suite(s) (repeatable); used by the Pages workflow
// Env: E2E_OUTPUT_DIR (screenshots written by suites that support it, e.g. dialog-frames).
// Env: CHROMIUM_PATH (browser binary; default Playwright's bundled chromium), E2E_PORT (default 4191), HEADED=1.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const only = rawArgs.flatMap((arg, i) => (arg === '--only' && rawArgs[i + 1] ? [rawArgs[i + 1]] : []));
const port = process.env.E2E_PORT ?? '4191';
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, CSV_BASE_URL: base };
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (!existsSync(`${root}dist/index.html`)) {
    if (args.has('--no-build')) { console.error('dist/ missing; run `npm run build` first.'); process.exit(2); }
    if (spawnSync(npm, ['run', 'build'], { cwd: root, stdio: 'inherit' }).status !== 0) process.exit(2);
}

const suite = [
    ['local-preview', 'local-preview-browser-smoke.mjs'],
    ['unit-guard', 'unit-guard-browser-smoke.mjs'],
    ['upload-review-privacy', 'upload-review-privacy-browser-smoke.mjs'],
    ['production-startup', 'production-startup-browser-smoke.mjs'],
    ['dialog-frames', 'dialog-frames-browser-smoke.mjs'],
];
if (args.has('--full')) suite.push(['source-record-stream', 'source-record-stream-browser-smoke.mjs']);
if (only.length) {
    const unknown = only.filter(name => !suite.some(([suiteName]) => suiteName === name));
    if (unknown.length) { console.error(`unknown suite(s): ${unknown.join(', ')}`); process.exit(2); }
    suite.splice(0, suite.length, ...suite.filter(([name]) => only.includes(name)));
}

const server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', port, '--strictPort'], { cwd: root, stdio: 'ignore' });
const stop = () => { if (!server.killed) server.kill(); };
process.on('exit', stop);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop(); process.exit(130); });

let up = false;
for (let i = 0; i < 60 && !up; i++) {
    up = await fetch(base).then(r => r.ok, () => false);
    if (!up) await new Promise(r => setTimeout(r, 500));
}
if (!up) { console.error(`preview server did not start on ${base}`); stop(); process.exit(2); }

const results = [];
for (const [name, file] of suite) {
    console.log(`\n=== ${name}`);
    const started = Date.now();
    const run = spawnSync(process.execPath, [`scripts/${file}`, base], { cwd: root, env, stdio: 'inherit' });
    results.push({ name, ok: run.status === 0, seconds: Math.round((Date.now() - started) / 1000) });
}
stop();
console.log('\n=== e2e summary');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} (${r.seconds}s)`);
process.exit(results.every(r => r.ok) ? 0 : 1);
