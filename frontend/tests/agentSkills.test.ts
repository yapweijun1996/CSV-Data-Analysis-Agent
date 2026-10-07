// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { parseSkillMarkdown } from '../services/agent/skills/skillMarkdown';
import { findSkillByName, resolveAvailableSkills } from '../services/agent/skills/skillRegistry';
import { buildSkillsPromptSection } from '../services/agent/skills/skillsPrompt';
import { createPiSkillTool } from '../services/agent/runtime/pi/piSkillTool';
import { createPiAppTools } from '../services/agent/runtime/pi/piAppTools';
import { createPiFollowUpSystemPrompt } from '../services/agent/runtime/pi/piContext';
import { buildBuiltinToolManifests } from '../services/agent/tools/toolManifestRegistry';

const doc = (name: string, description = 'Use when testing.', body = 'Do the thing.') =>
    `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`;

describe('skill markdown', () => {
    it('parses name, description, flags and instructions', () => {
        const parsed = parseSkillMarkdown(`---\nname: my-skill\ndescription: Use for X.\ndisable-model-invocation: true\n---\n\n# Title\nBody`, 'skills/my-skill/SKILL.md');

        expect(parsed.diagnostic).toBeNull();
        expect(parsed.skill).toMatchObject({
            name: 'my-skill', description: 'Use for X.', filePath: 'skills/my-skill/SKILL.md', disableModelInvocation: true,
        });
        expect(parsed.skill?.content).toBe('# Title\nBody');
    });

    it.each([
        ['no frontmatter', '# Just text'],
        ['unclosed frontmatter', '---\nname: a\ndescription: b\n'],
        ['bad name', doc('Bad Name')],
        ['missing description', '---\nname: ok\n---\nBody'],
        ['empty body', '---\nname: ok\ndescription: d\n---\n'],
    ])('reports a diagnostic for %s', (_label, text) => {
        const parsed = parseSkillMarkdown(text, 'skills/x.md');
        expect(parsed.skill).toBeNull();
        expect(parsed.diagnostic?.path).toBe('skills/x.md');
    });
});

describe('skill registry', () => {
    it('ships valid built-in skills for the analysis lifecycle', () => {
        const { skills, diagnostics } = resolveAvailableSkills();

        expect(diagnostics).toEqual([]);
        expect(skills.map(skill => skill.name)).toEqual(expect.arrayContaining([
            'choose-metric-and-aggregation', 'data-quality-check', 'explore-with-data-query',
            'pivot-and-crosstab', 'compare-periods-and-find-drivers', 'clean-data-safely',
        ]));
    });

    it('only mentions tools that exist, so skills cannot drift from the tool registry', () => {
        const toolNames = new Set(buildBuiltinToolManifests(['A', 'B']).map(manifest => manifest.name.replace(/[^a-zA-Z0-9_-]/g, '_')));
        const prefixes = ['data_', 'analysis_', 'workspace_', 'card_', 'spreadsheet_'];
        for (const skill of resolveAvailableSkills().skills) {
            const mentioned = skill.content.split('`').filter((_, index) => index % 2 === 1)
                .filter(token => prefixes.some(prefix => token.startsWith(prefix)) && !token.includes(' '));
            for (const token of mentioned) {
                expect(toolNames.has(token), `${skill.name} mentions unknown tool ${token}`).toBe(true);
            }
        }
    });

    it('loads user skills from the workspace in both layouts and lets them replace built-ins', () => {
        const { skills, diagnostics } = resolveAvailableSkills({
            'skills/team-rules/SKILL.md': doc('team-rules', 'Use for our house rules.'),
            'skills/quick-note.md': doc('quick-note'),
            'skills/data-quality-check/SKILL.md': doc('data-quality-check', 'Our version.', 'Custom checks.'),
            'skills/broken/SKILL.md': '# no frontmatter',
            'notes/skills/other.md': doc('ignored'),
            'skills/deep/nested/SKILL.md': doc('too-deep'),
        });

        expect(skills.map(skill => skill.name)).toEqual(expect.arrayContaining(['team-rules', 'quick-note']));
        expect(skills.map(skill => skill.name)).not.toContain('ignored');
        expect(skills.map(skill => skill.name)).not.toContain('too-deep');
        expect(findSkillByName(skills, 'data-quality-check')?.content).toBe('Custom checks.');
        expect(skills.filter(skill => skill.name === 'data-quality-check')).toHaveLength(1);
        expect(diagnostics.map(item => item.path)).toEqual(['skills/broken/SKILL.md']);
    });
});

describe('skills in the prompt and as a tool', () => {
    const storeWith = (workspaceFiles: Record<string, string> = {}) => ({ getState: () => ({ workspaceFiles }) }) as never;

    it('lists skills by name and description and tells the model how to load one', () => {
        const section = buildSkillsPromptSection(resolveAvailableSkills().skills);

        expect(section).toContain('<available_skills>');
        expect(section).toContain('<name>pivot-and-crosstab</name>');
        expect(section).toContain('read_skill');
        expect(section).not.toContain('Match the aggregation to the meaning'); // full text is loaded on demand
        expect(buildSkillsPromptSection([])).toBe('');
    });

    it('read_skill returns full instructions, including a skill added moments ago', async () => {
        const files: Record<string, string> = {};
        const tool = createPiSkillTool(storeWith(files));
        const builtin = await tool.execute('1', { name: 'choose-metric-and-aggregation' }, undefined as never);
        expect((builtin.content[0] as { text: string }).text).toContain('Match the aggregation to the meaning');

        files['skills/new-skill.md'] = doc('new-skill', 'Use for new things.', 'Fresh guidance.');
        const added = await tool.execute('2', { name: 'new-skill' }, undefined as never);
        expect((added.content[0] as { text: string }).text).toContain('Fresh guidance.');
    });

    it('read_skill explains unknown names, hides model-disabled skills and caps reads', async () => {
        const tool = createPiSkillTool(storeWith({ 'skills/internal.md': `---\nname: internal\ndescription: d\ndisable-model-invocation: true\n---\nSecret` }), { maxReads: 2 });

        await expect(tool.execute('1', { name: 'nope' }, undefined as never)).rejects.toThrow(/Unknown skill "nope".*Available skills:/);
        await expect(tool.execute('2', { name: 'internal' }, undefined as never)).rejects.toThrow(/Unknown skill/);
        await expect(tool.execute('3', { name: 'data-quality-check' }, undefined as never)).rejects.toThrow(/limit of 2 skill reads/);
    });

    it('gives the follow-up agent the skill tool and the read-only diagnostics', () => {
        const store = {
            getState: () => ({
                workspaceFiles: {}, csvData: { fileName: 'x.csv', data: [{ a: 1 }] }, canonicalCsvData: null,
                columnProfiles: [{ name: 'a' }], rawCsvData: null, semanticDatasetVersion: 'v1',
            }),
        } as never;
        const names = createPiAppTools(store, 'v1').map(tool => tool.name);

        expect(names).toEqual(expect.arrayContaining([
            'read_skill', 'data_query', 'data_describe', 'data_missing', 'data_outliers', 'data_value_counts',
            'workspace_read',
        ]));
        expect(createPiAppTools(store, 'v1', { includeSkills: false }).map(tool => tool.name)).not.toContain('read_skill');
    });

    it('adds the skill listing, with user skills, to the follow-up system prompt', () => {
        const state = {
            settings: { language: 'English' }, csvData: { fileName: 'x.csv', data: [] }, canonicalCsvData: null,
            analysisCards: [], chatHistory: [], workspaceFiles: { 'skills/house.md': doc('house-style', 'Use for our reporting style.') },
        } as never;
        const prompt = createPiFollowUpSystemPrompt(state);

        expect(prompt).toContain('<name>house-style</name>');
        expect(prompt).toContain('<name>clean-data-safely</name>');
    });
});
