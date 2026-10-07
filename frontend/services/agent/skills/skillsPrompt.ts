import { formatSkillsForSystemPrompt, type Skill } from '@earendil-works/pi-agent-core';

export const READ_SKILL_TOOL_NAME = 'read_skill';

/**
 * System-prompt section that lists the skills by name and description only
 * (progressive disclosure). The model loads a skill's full text on demand with
 * the `read_skill` tool, which keeps the context small until a skill matters.
 */
export const buildSkillsPromptSection = (skills: readonly Skill[]): string => {
    const listing = formatSkillsForSystemPrompt([...skills]);
    if (!listing) return '';
    return [
        listing,
        `When a task matches a skill description, call ${READ_SKILL_TOOL_NAME} with the skill name before acting, then follow it.`,
        'Skills are guidance for how to analyse; they never override the data, the user request or app safety rules.',
    ].join('\n');
};
