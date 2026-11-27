// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, stat, symlink, readdir, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeFixtureSuite } from '../scripts/coding-agent-evaluation/fixtureKit.mjs';
import { freezeQualification, inspectQualification, loadFrozenAgentInput } from '../scripts/coding-agent-evaluation/qualificationPreflight.mjs';

let temporary: string;
let suite: string;
let frozen: Awaited<ReturnType<typeof freezeQualification>>;
const repository = path.resolve('..');
// The pinned deployment is the production build in frontend/dist; it is no longer checked in, so run `npm run build` first.
const hasDeploymentBuild = existsSync(path.join(repository, 'frontend/dist/SHA256SUMS.txt'));
beforeAll(async () => {
    if (!hasDeploymentBuild) return;
    temporary = await mkdtemp(path.join(tmpdir(), 'coding-qualification-'));
    suite = path.join(temporary, 'suite');
    await writeFixtureSuite(suite);
    frozen = await freezeQualification(repository, suite);
}, 30000);
afterAll(async () => { if (temporary) await rm(temporary, { recursive: true, force: true }); });

describe.skipIf(!hasDeploymentBuild)('CA-173 offline qualification preflight', () => {
    it('pins public evaluator artifacts without requiring ignored operator reports', () => {
        const paths = frozen.pins.evaluator.map((pin: { path: string }) => pin.path);
        const ignored = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], {
            cwd: repository, input: paths.join('\n') + '\n', encoding: 'utf8',
        });
        expect(ignored.status).toBe(1);
        expect(paths).toContain('frontend/scripts/coding-agent-evaluation/qualificationContract.mjs');
        expect(frozen.evaluation.thresholds).toEqual({ solvableCorrect: 108, solvableRuns: 120,
            familyMinimumCorrect: 12, familyRuns: 15, ambiguityCorrect: 29, ambiguityRuns: 30,
            adversarialRuns: 30, maximumCriticalFailures: 0, admittedEvidenceCoverage: 1,
            deterministicAcceptanceCoverage: 1, minimumNovelRepairCases: 16, minimumNewMethodCases: 1 });
    });
    it('freezes the current single profile and exact denominator without claiming launch authorization', async () => {
        const manifest = frozen;
        const result = await inspectQualification(repository, suite, manifest);
        expect(result).toMatchObject({ status: 'preflight_complete', providerCalls: 0, evaluatedRuns: 0,
            paidSpendUsd: 0, liveRunAuthorized: false, capabilityAcceptance: 'pending', launchReady: false });
        expect(manifest.schedule).toHaveLength(180);
        expect(new Set(manifest.schedule.map((run: { id: string }) => run.id)).size).toBe(180);
        expect(result.launchBlockers).toContain('paid_authorization_missing');
        expect(result.launchBlockers).toContain('resolved_provider_model_missing');
        expect(result.launchBlockers).toContain('holdout_fault_recovery_not_live_qualified');
        expect(result).toMatchObject({ denominators: { solvable: 120, family: 15, ambiguous: 30, adversarial: 30 },
            thresholds: { solvableCorrect: 108, familyMinimumCorrect: 12, ambiguityCorrect: 29, maximumCriticalFailures: 0 } });
        expect(manifest.suite.failureRecovery.map((item: { caseId: string }) => item.caseId)).toEqual(['S1-4', 'S6-4', 'S8-4']);
        expect(manifest.candidate.runtime.preflightNode).toBe(process.versions.node);
        expect(manifest.candidate.skills).toHaveLength(11);
        // Every checksum-verified deployment file is pinned; derive the count so new demo data does not need a manual bump.
        const deploymentEntries = (await readFile(path.join(repository, 'frontend/dist/SHA256SUMS.txt'), 'utf8')).split('\n').filter(line => line.trim()).length;
        expect(manifest.pins.deployment).toHaveLength(deploymentEntries);
        // The runtime no longer caps task dimensions; the manifest must say so rather than keep old ceilings.
        const unbounded = Number.MAX_SAFE_INTEGER;
        expect(manifest.candidate.settings.taskLimits).toEqual({ toolCalls: unbounded, skillReads: unbounded,
            providerTurns: unbounded, transformationAttempts: unbounded, activeMs: unbounded });
    });

    it('makes no fetch call and does not consult credential environment variables', async () => {
        const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Provider forbidden'));
        vi.stubEnv('OPENAI_API_KEY', 'secret-test-value-never-persist');
        try {
            const result = await inspectQualification(repository, suite, frozen);
            expect(result.status).toBe('preflight_complete');
            expect(fetch).not.toHaveBeenCalled();
            expect(JSON.stringify({ result, frozen })).not.toContain('secret-test-value-never-persist');
        } finally { fetch.mockRestore(); vi.unstubAllEnvs(); }
    });

    it.each(['empty', 'duplicate', 'wrong_seed', 'pooled_profile', 'weakened_threshold', 'hash_drift',
        'claimed_model', 'claimed_authorization', 'contradictory_runtime', 'extra_secret_field'])
    ('refuses %s rather than deriving a ready aggregate', async kind => {
        const changed = structuredClone(frozen);
        if (kind === 'empty') changed.schedule = [];
        if (kind === 'duplicate') changed.schedule[1] = changed.schedule[0];
        if (kind === 'wrong_seed') changed.schedule[0].seed = '17';
        if (kind === 'pooled_profile') changed.schedule[0].pairId = 'full';
        if (kind === 'weakened_threshold') changed.evaluation.thresholds.solvableCorrect = 1;
        if (kind === 'hash_drift') changed.pins.source[0].sha256 = '0'.repeat(64);
        if (kind === 'claimed_model') changed.candidate.resolvedProviderModel = 'unobserved-model';
        if (kind === 'claimed_authorization') changed.candidate.paidAuthorization = { approved: true, spendUsd: 100 };
        if (kind === 'contradictory_runtime') changed.candidate.settings.runtimeCaptured = true;
        if (kind === 'extra_secret_field') changed.candidate.apiKey = 'do-not-echo-this';
        const result = await inspectQualification(repository, suite, changed);
        expect(result).toMatchObject({ status: 'invalid', launchReady: false, liveRunAuthorized: false,
            reasons: ['qualification_manifest_drift'], providerCalls: 0 });
        expect(JSON.stringify(result)).not.toContain('do-not-echo-this');
    });

    it('accepts harmless object key order while maintaining exact array identities', async () => {
        const ordered = Object.fromEntries(Object.entries(frozen).reverse());
        expect((await inspectQualification(repository, suite, ordered)).status).toBe('preflight_complete');
    });

    it.each([NaN, Infinity, undefined])('rejects an invalid raw ceiling instead of normalizing it to a missing value (%s)', async value => {
        const changed = structuredClone(frozen);
        changed.candidate.proposedCeilings.spendUsd = value;
        expect(await inspectQualification(repository, suite, changed)).toMatchObject({ status: 'invalid',
            reasons: ['qualification_value_invalid'], launchReady: false });
    });

    it('projects only declared raw agent inputs and goals for method, ambiguity and failure cases', async () => {
        for (const id of ['S8-2', 'A-2', 'S1-4']) {
            const inputs = await loadFrozenAgentInput(suite, id);
            expect(inputs.map((file: { name: string }) => file.name)).toEqual(id === 'S1-4'
                ? ['input.csv', 'dialect.txt', 'task.json'] : ['input.csv', 'task.json']);
            const payload = inputs.map((file: { bytes: Buffer }) => file.bytes.toString()).join('\n');
            expect(payload).not.toMatch(/expectedFacts|faultSchedule|expectedBehavior|canonical\.csv|solution\.py/);
        }
        await expect(loadFrozenAgentInput(suite, '../evaluator/S8-2')).rejects.toThrow('case_identity_invalid');
    });

    it('rejects actual fixture drift before releasing agent inputs', async () => {
        const file = path.join(suite, 'agent/S1-1/input.csv');
        const old = await readFile(file);
        try {
            await writeFile(file, 'not the frozen input');
            expect(await inspectQualification(repository, suite, frozen)).toMatchObject({ status: 'invalid',
                reasons: ['fixture_integrity_invalid'], launchReady: false });
            await expect(loadFrozenAgentInput(suite, 'S1-1')).rejects.toThrow('fixture_integrity_invalid');
        } finally { await writeFile(file, old); }
    });

    it('detects actual source/deployment drift and source symlink substitution in an isolated repository copy', async () => {
        const isolated = path.join(temporary, 'repository');
        const files = [...new Set([...frozen.pins.source, ...frozen.pins.evaluator, ...frozen.pins.deployment,
            frozen.pins.deploymentManifest].map((pin: { path: string }) => pin.path))];
        for (const relative of files) {
            const target = path.join(isolated, relative);
            await mkdir(path.dirname(target), { recursive: true });
            await copyFile(path.join(repository, relative), target);
        }
        await symlink(path.join(repository, '.git'), path.join(isolated, '.git'));
        expect((await inspectQualification(isolated, suite, frozen)).status).toBe('preflight_complete');
        const source = path.join(isolated, 'frontend/App.tsx'), sourceBytes = await readFile(source);
        await writeFile(source, Buffer.concat([sourceBytes, Buffer.from('\n// Unfrozen change\n')]));
        expect(await inspectQualification(isolated, suite, frozen)).toMatchObject({ status: 'invalid',
            reasons: ['qualification_manifest_drift'] });
        await writeFile(source, sourceBytes);
        const deployment = path.join(isolated, 'frontend/dist/index.html');
        await writeFile(deployment, 'changed deployment');
        expect(await inspectQualification(isolated, suite, frozen)).toMatchObject({ status: 'invalid',
            reasons: ['deployment_hash_mismatch'] });
        await copyFile(path.join(repository, 'frontend/dist/index.html'), deployment);
        await rm(source); await symlink(path.join(isolated, 'frontend/index.tsx'), source);
        expect(await inspectQualification(isolated, suite, frozen)).toMatchObject({ status: 'invalid',
            reasons: ['pin_symlink_denied'] });
    }, 30000);

    it('matches real CLI exit/report status and never treats complete preflight as an approved launch', async () => {
        const command = path.resolve('scripts/coding-agent-qualification-preflight.mjs');
        const manifest = path.join(temporary, 'qualification.json'), report = path.join(temporary, 'report.json');
        const frozenCli = spawnSync(process.execPath, [command, '--suite', suite, '--freeze', manifest, '--report', report], { encoding: 'utf8' });
        expect(frozenCli.status).toBe(0);
        const output = JSON.parse(frozenCli.stdout);
        expect(output.status).toBe('preflight_complete');
        expect(output.launchReady).toBe(false);
        expect(JSON.parse(await readFile(report, 'utf8'))).toEqual(output);
        expect((await stat(manifest)).mode & 0o777).toBe(0o600);
        expect((await stat(report)).mode & 0o777).toBe(0o600);
        const saved = await readFile(manifest, 'utf8');
        const deniedOverwrite = spawnSync(process.execPath, [command, '--suite', suite, '--freeze', manifest, '--report', report], { encoding: 'utf8' });
        expect(deniedOverwrite.status).toBe(2);
        expect(await readFile(manifest, 'utf8')).toBe(saved);
        expect(JSON.parse(await readFile(report, 'utf8'))).toEqual(JSON.parse(deniedOverwrite.stdout));
        const changed = JSON.parse(saved); changed.schedule = [];
        await writeFile(manifest, JSON.stringify(changed));
        const invalid = spawnSync(process.execPath, [command, '--suite', suite, '--manifest', manifest, '--report', report], { encoding: 'utf8' });
        expect(invalid.status).toBe(2);
        expect(JSON.parse(await readFile(report, 'utf8'))).toEqual(JSON.parse(invalid.stdout));
        expect(JSON.parse(invalid.stdout).status).toBe('invalid');
        expect(invalid.stdout).not.toContain(temporary);
        const alias = path.join(temporary, 'qualification-alias'); await symlink(manifest, alias);
        const denied = spawnSync(process.execPath, [command, '--suite', suite, '--manifest', alias, '--report', report], { encoding: 'utf8' });
        expect(denied.status).toBe(2);
        expect(JSON.parse(await readFile(report, 'utf8'))).toEqual(JSON.parse(denied.stdout));
        const reportBytes = await readFile(report, 'utf8');
        const reportAlias = path.join(temporary, 'report-alias'); await symlink(report, reportAlias);
        const reportDenied = spawnSync(process.execPath, [command, '--suite', suite, '--manifest', manifest, '--report', reportAlias], { encoding: 'utf8' });
        expect(reportDenied.status).toBe(2);
        expect(JSON.parse(reportDenied.stdout).reportPublicationFailed).toBe(true);
        expect(await readFile(report, 'utf8')).toBe(reportBytes);
        expect((await readdir(temporary)).filter(name => name.startsWith('.artifact-'))).toEqual([]);
    });

    it.each(['--launch', '--provider', '--api-key', '--approve-spend'])('refuses an unsupported %s flag without calling a provider', flag => {
        const command = path.resolve('scripts/coding-agent-qualification-preflight.mjs');
        const result = spawnSync(process.execPath, [command, '--suite', suite, flag, 'test', '--report', path.join(temporary, 'unsupported.json')], { encoding: 'utf8' });
        expect(result.status).toBe(2);
        expect(JSON.parse(result.stdout)).toMatchObject({ status: 'invalid', liveRunAuthorized: false,
            launchReady: false, providerCalls: 0, evaluatedRuns: 0, paidSpendUsd: 0 });
    });
});
