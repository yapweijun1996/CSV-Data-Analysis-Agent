// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentSkillsSection } from '../components/modals/AgentSkillsSection';
import { resolveAvailableSkills, resolveSkillEntries } from '../services/agent/skills/skillRegistry';
import {
    MAX_USER_SKILLS,
    MAX_USER_SKILL_CHARS,
    importUserSkills,
    readUserSkillSources,
    removeUserSkill,
    resetUserSkillsForTests,
} from '../services/agent/skills/userSkillStore';
import { createPiSkillTool } from '../services/agent/runtime/pi/piSkillTool';
import { createPiFollowUpSystemPrompt } from '../services/agent/runtime/pi/piContext';

const doc = (name: string, description = 'Use when testing.', body = 'Do the thing.') =>
    `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`;

describe('user skill store', () => {
    beforeEach(resetUserSkillsForTests);

    it('stores valid skills, persists them, and serves them as virtual skill files', () => {
        const result = importUserSkills([{ fileName: 'house.md', text: doc('house-style') }]);

        expect(result).toEqual({ added: ['house-style'], rejected: [] });
        expect(readUserSkillSources()).toEqual({ 'skills/house-style/SKILL.md': doc('house-style') });
        expect(JSON.parse(localStorage.getItem('csv-ai-user-skills-v1')!).skills['house-style']).toBe(doc('house-style'));
    });

    it('rejects invalid, oversized and surplus files with a reason, and stores nothing for them', () => {
        const result = importUserSkills([
            { fileName: 'notes.md', text: '# not a skill' },
            { fileName: 'huge.md', text: doc('huge', 'd', 'x'.repeat(MAX_USER_SKILL_CHARS + 1)) },
        ]);

        expect(result.added).toEqual([]);
        expect(result.rejected.map(item => item.fileName)).toEqual(['notes.md', 'huge.md']);
        expect(result.rejected[0].reason).toContain('frontmatter');
        expect(readUserSkillSources()).toEqual({});

        importUserSkills(Array.from({ length: MAX_USER_SKILLS }, (_, index) => ({ fileName: `s${index}.md`, text: doc(`skill-${index}`) })));
        const surplus = importUserSkills([{ fileName: 'one-more.md', text: doc('one-more') }]);
        expect(surplus.rejected[0].reason).toContain(`At most ${MAX_USER_SKILLS}`);
        // Replacing an existing skill is still allowed at the limit.
        expect(importUserSkills([{ fileName: 'again.md', text: doc('skill-0', 'Updated.') }]).added).toEqual(['skill-0']);
    });

    it('survives a damaged stored value and removes skills', () => {
        localStorage.setItem('csv-ai-user-skills-v1', '{not json');
        expect(readUserSkillSources()).toEqual({});

        importUserSkills([{ fileName: 'a.md', text: doc('a-skill') }]);
        removeUserSkill('a-skill');
        removeUserSkill('never-added');
        expect(readUserSkillSources()).toEqual({});
    });
});

describe('skill precedence and agent use', () => {
    beforeEach(resetUserSkillsForTests);

    it('orders built-in, then Settings skills, then workspace skills, and reports the source', () => {
        importUserSkills([
            { fileName: 'a.md', text: doc('data-quality-check', 'From settings.', 'Settings version.') },
            { fileName: 'b.md', text: doc('house-style', 'From settings.') },
        ]);
        const { entries } = resolveSkillEntries({ 'skills/house-style.md': doc('house-style', 'From workspace.', 'Workspace version.') });
        const source = (name: string) => entries.find(entry => entry.skill.name === name)?.source;

        expect(source('pivot-and-crosstab')).toBe('builtin');
        expect(source('data-quality-check')).toBe('user');
        expect(source('house-style')).toBe('workspace');
        expect(entries.find(entry => entry.skill.name === 'house-style')?.skill.content).toBe('Workspace version.');
    });

    it('lets the agent read and see a skill the person added in Settings', async () => {
        importUserSkills([{ fileName: 'house.md', text: doc('house-style', 'Use for our reporting style.', 'Lead with the decision.') }]);
        const state = { workspaceFiles: {}, settings: { language: 'English' }, csvData: { fileName: 'x.csv', data: [] }, canonicalCsvData: null, analysisCards: [], chatHistory: [] } as never;

        expect(createPiFollowUpSystemPrompt(state)).toContain('<name>house-style</name>');
        const tool = createPiSkillTool({ getState: () => ({ workspaceFiles: {} }) } as never);
        const result = await tool.execute('1', { name: 'house-style' }, undefined as never);
        expect((result.content[0] as { text: string }).text).toContain('Lead with the decision.');
        expect(resolveAvailableSkills().skills.map(skill => skill.name)).toContain('house-style');
    });
});

describe('Agent skills settings section', () => {
    beforeEach(resetUserSkillsForTests);
    afterEach(cleanup);

    const fileWith = (name: string, text: string) => {
        const file = new File([text], name, { type: 'text/markdown' });
        Object.defineProperty(file, 'text', { value: async () => text }); // jsdom may not implement File.text
        return file;
    };

    it('lists built-in skills, imports a skill file, and removes it again', async () => {
        render(<AgentSkillsSection language="English" />);

        expect(screen.getByText('choose-metric-and-aggregation')).toBeTruthy();
        expect(screen.getAllByText('Built-in').length).toBeGreaterThan(0);

        const input = screen.getByLabelText('Add skill files (.md)') as HTMLInputElement;
        await act(async () => {
            fireEvent.change(input, { target: { files: [fileWith('house.md', doc('house-style', 'Use for our reporting style.')), fileWith('bad.md', '# nope')] } });
        });

        await waitFor(() => expect(screen.getByText('house-style')).toBeTruthy());
        expect(screen.getByText('Yours')).toBeTruthy();
        expect(screen.getByRole('status').textContent).toContain('Added: house-style');
        expect(screen.getByRole('status').textContent).toContain('Not added: bad.md');

        fireEvent.click(screen.getByRole('button', { name: 'Remove house-style' }));
        await waitFor(() => expect(screen.queryByText('house-style')).toBeNull());
    });
});
