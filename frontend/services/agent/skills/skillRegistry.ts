import type { Skill } from '@earendil-works/pi-agent-core';
import { parseSkillMarkdown, type SkillParseDiagnostic } from './skillMarkdown';
import { readDisabledSkillNames, readUserSkillSources } from './userSkillStore';

const SKILLS_DIR = 'skills/';
const SKILL_FILE = 'SKILL.md';
const MARKDOWN_EXTENSION = '.md';

// Built-in skills ship with the app as markdown, so they are plain text anyone can read and review.
const builtinSources = import.meta.glob('./builtin/*/SKILL.md', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;

export type SkillSource = 'builtin' | 'user' | 'workspace';

export interface ResolvedSkills {
    skills: Skill[];
    diagnostics: SkillParseDiagnostic[];
}

export interface SkillEntry {
    skill: Skill;
    source: SkillSource;
    /** False when the person switched the skill off in Settings. */
    enabled: boolean;
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
 * Every available skill with where it came from. Precedence, lowest to highest:
 * built-in, skills the person added in Settings, skills in the workspace. A
 * skill with the same name replaces the one below it, so guidance can be
 * adapted without changing the app. Invalid files are reported, never thrown.
 */
export const resolveSkillEntries = (
    workspaceFiles?: Record<string, string>,
    userSkillSources: Record<string, string> = readUserSkillSources(),
    disabledNames: ReadonlySet<string> = readDisabledSkillNames(),
): { entries: SkillEntry[]; diagnostics: SkillParseDiagnostic[] } => {
    const builtin = loadBuiltinSkills();
    const stored = loadUserSkills(userSkillSources);
    const workspace = loadUserSkills(workspaceFiles);
    const byName = new Map<string, SkillEntry>();
    for (const skill of builtin.skills) byName.set(skill.name, { skill, source: 'builtin', enabled: !disabledNames.has(skill.name) });
    for (const skill of stored.skills) byName.set(skill.name, { skill, source: 'user', enabled: !disabledNames.has(skill.name) });
    for (const skill of workspace.skills) byName.set(skill.name, { skill, source: 'workspace', enabled: !disabledNames.has(skill.name) });
    return {
        entries: Array.from(byName.values()),
        diagnostics: [...builtin.diagnostics, ...stored.diagnostics, ...workspace.diagnostics],
    };
};

export const resolveAvailableSkills = (
    workspaceFiles?: Record<string, string>,
    userSkillSources?: Record<string, string>,
): ResolvedSkills => {
    const { entries, diagnostics } = resolveSkillEntries(workspaceFiles, userSkillSources);
    return { skills: entries.filter(entry => entry.enabled).map(entry => entry.skill), diagnostics };
};

export const findSkillByName = (skills: readonly Skill[], name: string): Skill | undefined =>
    skills.find(skill => skill.name === name.trim());
