import type { Skill } from '@earendil-works/pi-agent-core';

export interface SkillParseDiagnostic {
    path: string;
    message: string;
}

/** Exactly one of `skill` and `diagnostic` is set. */
export interface SkillParseResult {
    skill: Skill | null;
    diagnostic: SkillParseDiagnostic | null;
}

const FRONTMATTER_FENCE = '---';
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1_024;

const isValidSkillName = (name: string): boolean =>
    name.length > 0
    && name.length <= MAX_NAME_LENGTH
    && Array.from(name).every(char => (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') || char === '-');

const parseBoolean = (value: string | undefined): boolean => value?.trim().toLowerCase() === 'true';

/**
 * Parses a `SKILL.md` document: a small frontmatter block (`name`, `description`,
 * optional `disable-model-invocation`) followed by the instructions. The format
 * matches the pi agent harness, so skills can be shared with other pi tooling.
 */
export const parseSkillMarkdown = (text: string, filePath: string): SkillParseResult => {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const fail = (message: string): SkillParseResult => ({ skill: null, diagnostic: { path: filePath, message } });

    if (lines[0]?.trim() !== FRONTMATTER_FENCE) return fail('The skill file must start with a "---" frontmatter block.');
    const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === FRONTMATTER_FENCE);
    if (closingIndex < 0) return fail('The frontmatter block is not closed with "---".');

    const fields = new Map<string, string>();
    for (const line of lines.slice(1, closingIndex)) {
        const separator = line.indexOf(':');
        if (separator <= 0) continue;
        fields.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
    }

    const name = fields.get('name') ?? '';
    const description = fields.get('description') ?? '';
    if (!isValidSkillName(name)) return fail('The skill name must be 1-64 characters of lowercase letters, digits and hyphens.');
    if (!description) return fail('The skill needs a description that says when to use it.');
    if (description.length > MAX_DESCRIPTION_LENGTH) return fail(`The description is longer than ${MAX_DESCRIPTION_LENGTH} characters.`);

    const content = lines.slice(closingIndex + 1).join('\n').trim();
    if (!content) return fail('The skill has no instructions after the frontmatter.');

    return {
        diagnostic: null,
        skill: {
            name,
            description,
            content,
            filePath,
            ...(parseBoolean(fields.get('disable-model-invocation')) ? { disableModelInvocation: true } : {}),
        },
    };
};
