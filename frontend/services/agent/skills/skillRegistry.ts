import type { Skill } from '@earendil-works/pi-agent-core';
import { parseSkillMarkdown, type SkillParseDiagnostic } from './skillMarkdown';

const SKILLS_DIR = 'skills/';
const SKILL_FILE = 'SKILL.md';
const MARKDOWN_EXTENSION = '.md';

// Built-in skills ship with the app as markdown, so they are plain text anyone can read and review.
const builtinSources = import.meta.glob('./builtin/*/SKILL.md', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;

export interface ResolvedSkills {
    skills: Skill[];
    diagnostics: SkillParseDiagnostic[];
}

const loadBuiltinSkills = (): ResolvedSkills => {
    const skills: Skill[] = [];
    const diagnostics: SkillParseDiagnostic[] = [];
    for (const [sourcePath, text] of Object.entries(builtinSources).sort(([left], [right]) => left.localeCompare(right))) {
        const virtualPath = `${SKILLS_DIR}${sourcePath.replace('./builtin/', '')}`;
        const parsed = parseSkillMarkdown(text, virtualPath);
        if (parsed.skill) skills.push(parsed.skill);
        else if (parsed.diagnostic) diagnostics.push(parsed.diagnostic);
    }
    return { skills, diagnostics };
};

/** `skills/<name>/SKILL.md` or `skills/<name>.md` inside the workspace. */
const isUserSkillPath = (path: string): boolean => {
    if (!path.startsWith(SKILLS_DIR) || !path.endsWith(MARKDOWN_EXTENSION)) return false;
    const relative = path.slice(SKILLS_DIR.length);
    const segments = relative.split('/');
    if (segments.some(segment => segment.length === 0)) return false;
    return segments.length === 1 || (segments.length === 2 && segments[1] === SKILL_FILE);
};

const loadUserSkills = (workspaceFiles: Record<string, string> | undefined): ResolvedSkills => {
    const skills: Skill[] = [];
    const diagnostics: SkillParseDiagnostic[] = [];
    for (const path of Object.keys(workspaceFiles ?? {}).filter(isUserSkillPath).sort()) {
        const parsed = parseSkillMarkdown(workspaceFiles![path], path);
        if (parsed.skill) skills.push(parsed.skill);
        else if (parsed.diagnostic) diagnostics.push(parsed.diagnostic);
    }
    return { skills, diagnostics };
};

/**
 * Built-in skills plus the user's own skills from the workspace. A user skill
 * with the same name replaces the built-in one, so teams can adapt guidance
 * without changing the app. Invalid files are reported, never thrown.
 */
export const resolveAvailableSkills = (workspaceFiles?: Record<string, string>): ResolvedSkills => {
    const builtin = loadBuiltinSkills();
    const user = loadUserSkills(workspaceFiles);
    const byName = new Map<string, Skill>();
    for (const skill of [...builtin.skills, ...user.skills]) byName.set(skill.name, skill);
    return {
        skills: Array.from(byName.values()),
        diagnostics: [...builtin.diagnostics, ...user.diagnostics],
    };
};

export const findSkillByName = (skills: readonly Skill[], name: string): Skill | undefined =>
    skills.find(skill => skill.name === name.trim());
