import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [base = 'http://127.0.0.1:4187', output = '/tmp/pi-a60-repeat', countArg = '3', timeoutArg = '300000'] = process.argv.slice(2);
const count = Number(countArg), timeout = Number(timeoutArg);
if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 2147483647) {
    throw new Error('Usage: node scripts/pi-a60-repeat-smoke.mjs [base] [output-prefix] [runs>=1] [timeout-ms>=1]');
}
const script = fileURLToPath(new URL('./pi-dual-grain-browser-smoke.mjs', import.meta.url));
for (let run = 1; run <= count; run++) {
    const started = Date.now();
    const child = spawn(process.execPath, [script, base, `${output}.${run}.json`, 'A60'], { stdio: 'inherit', detached: true });
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }, timeout);
    const result = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code, signal) => resolve({ code, signal }));
    }).finally(() => clearTimeout(timer));
    console.log(`A60 run ${run}/${count}: ${Date.now() - started} ms (${timedOut ? 'TIMEOUT' : result.code === 0 ? 'PASS' : `FAIL ${result.code ?? result.signal}`})`);
    if (timedOut || result.code !== 0) process.exit(1);
}
