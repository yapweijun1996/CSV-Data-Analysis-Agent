import { type AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from '@earendil-works/pi-ai';
import { findSkillByName, resolveAvailableSkills } from '../../skills/skillRegistry';
import { READ_SKILL_TOOL_NAME } from '../../skills/skillsPrompt';
import type { StoreApi } from '../../types';

/** Each load costs a model round trip; two skills are enough for one request. */
export const PI_MAX_SKILL_READS_PER_TURN = 2;

/**
 * Lets Pi load a skill's full instructions on demand. Skills are looked up when
 * called, so a skill the user just added to the workspace is available at once.
 */
export const createPiSkillTool = (
    store: StoreApi,
    options: { maxReads?: number } = {},
): AgentTool => {
    const maxReads = options.maxReads ?? PI_MAX_SKILL_READS_PER_TURN;
    let reads = 0;
    return {
        name: READ_SKILL_TOOL_NAME,
        label: 'Read skill',
        description: 'Load the full instructions of one skill listed in <available_skills>. Use it when the task matches that skill.',
        parameters: Type.Object({
            name: Type.String({ description: 'The skill name exactly as listed in <available_skills>.' }),
        }),
        executionMode: 'sequential',
        replay: 'safe',
        execute: async (_toolCallId, args) => {
            const requested = typeof (args as { name?: unknown })?.name === 'string'
                ? (args as { name: string }).name
                : '';
            if (reads >= maxReads) {
                throw new Error(`The limit of ${maxReads} skill reads per request was reached. Continue with what you have loaded.`);
            }
            reads += 1;
            // Skills marked disable-model-invocation are for explicit app use only.
            const skills = resolveAvailableSkills(store.getState().workspaceFiles).skills
                .filter(entry => !entry.disableModelInvocation);
            const skill = findSkillByName(skills, requested);
            if (!skill) {
                const available = skills.map(entry => entry.name);
                throw new Error(`Unknown skill "${requested}". Available skills: ${available.join(', ') || 'none'}.`);
            }
            return {
                details: undefined,
                content: [{ type: 'text', text: `<skill name="${skill.name}">\n${skill.content}\n</skill>` }],
            };
        },
    };
};
