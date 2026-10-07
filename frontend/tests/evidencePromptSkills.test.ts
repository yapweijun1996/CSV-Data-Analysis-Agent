// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildEvidenceSkillGuidance } from '../services/agent/skills/evidencePromptSkills';

const userSkill = (name: string, body = 'Always report a count next to every average.') =>
    `---\nname: ${name}\ndescription: Team rule for averages.\n---\n${body}\n`;

describe('buildEvidenceSkillGuidance', () => {
    it('includes the metric and query skills but not unrelated built-ins', () => {
        const text = buildEvidenceSkillGuidance({});
        expect(text).toContain('### Skill: choose-metric-and-aggregation');
        expect(text).toContain('### Skill: explore-with-data-query');
        expect(text).not.toContain('### Skill: clean-data-safely');
    });

    it('adds skills the person saved in Settings', () => {
        const text = buildEvidenceSkillGuidance({ 'skills/team-rule.md': userSkill('team-rule') });
        expect(text).toContain('### Skill: team-rule');
        expect(text).toContain('Always report a count');
    });

    it('leaves out skills that hide themselves from the model and caps the size', () => {
        const hidden = '---\nname: hidden-rule\ndescription: x\ndisable-model-invocation: true\n---\nSecret.\n';
        const big = userSkill('huge-rule', 'x'.repeat(20_000));
        const text = buildEvidenceSkillGuidance({ 'skills/hidden.md': hidden, 'skills/huge.md': big });
        expect(text).not.toContain('hidden-rule');
        expect(text).not.toContain('huge-rule');
        expect(text.length).toBeLessThan(7_000);
    });
});
