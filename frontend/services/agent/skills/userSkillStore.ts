import { parseSkillMarkdown } from './skillMarkdown';

/**
 * Skills the person added in Settings. They persist in localStorage (so the
 * existing "Clear all local data" removes them) and are served to the agent as
 * virtual `skills/<name>/SKILL.md` files, the same layout the loader reads.
 */
const STORAGE_KEY = 'csv-ai-user-skills-v1';
export const MAX_USER_SKILLS = 30;
export const MAX_USER_SKILL_CHARS = 20_000;

export interface UserSkillImportResult {
    added: string[];
    rejected: Array<{ fileName: string; reason: string }>;
}

let memoryFallback: Record<string, string> = {};
const listeners = new Set<() => void>();

const virtualPath = (name: string) => `skills/${name}/SKILL.md`;

const readAll = (): Record<string, string> => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as { skills?: Record<string, unknown> };
        const entries = Object.entries(parsed?.skills ?? {})
            .filter((entry): entry is [string, string] => typeof entry[1] === 'string');
        return Object.fromEntries(entries);
    } catch {
        // Unavailable storage or a damaged value: fall back to what this tab holds in memory.
        return memoryFallback;
    }
};

const writeAll = (skills: Record<string, string>): void => {
    memoryFallback = skills;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, skills }));
    } catch {
        // Hardened/private modes: the skills still work for this tab.
    }
    listeners.forEach(listener => listener());
};

/** Stored user skills as virtual workspace-style files (`skills/<name>/SKILL.md` → text). */
export const readUserSkillSources = (): Record<string, string> =>
    Object.fromEntries(Object.entries(readAll()).map(([name, text]) => [virtualPath(name), text]));

export const subscribeUserSkills = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

/** A stable snapshot string for useSyncExternalStore. */
export const getUserSkillsSnapshot = (): string => {
    try {
        return localStorage.getItem(STORAGE_KEY) ?? JSON.stringify(memoryFallback);
    } catch {
        return JSON.stringify(memoryFallback);
    }
};

/**
 * Validates and stores skill files. A valid file replaces a stored skill with
 * the same name; invalid files are reported and never stored.
 */
export const importUserSkills = (files: Array<{ fileName: string; text: string }>): UserSkillImportResult => {
    const current = readAll();
    const next = { ...current };
    const result: UserSkillImportResult = { added: [], rejected: [] };

    for (const { fileName, text } of files) {
        if (text.length > MAX_USER_SKILL_CHARS) {
            result.rejected.push({ fileName, reason: `The file is longer than ${MAX_USER_SKILL_CHARS.toLocaleString()} characters.` });
            continue;
        }
        const parsed = parseSkillMarkdown(text, fileName);
        if (!parsed.skill) {
            result.rejected.push({ fileName, reason: parsed.diagnostic?.message ?? 'The file is not a valid skill.' });
            continue;
        }
        if (!(parsed.skill.name in next) && Object.keys(next).length >= MAX_USER_SKILLS) {
            result.rejected.push({ fileName, reason: `At most ${MAX_USER_SKILLS} skills can be added. Remove one first.` });
            continue;
        }
        next[parsed.skill.name] = text;
        result.added.push(parsed.skill.name);
    }

    if (result.added.length > 0) writeAll(next);
    return result;
};

export const removeUserSkill = (name: string): void => {
    const current = readAll();
    if (!(name in current)) return;
    const { [name]: _removed, ...rest } = current;
    writeAll(rest);
};

export const resetUserSkillsForTests = (): void => {
    memoryFallback = {};
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    listeners.forEach(listener => listener());
};
