import type { ClarificationRequest, ToolGroup, ToolManifest, ToolName } from '../../../types';
import { createAnalysisToolManifests } from './manifests/analysisToolManifests';
import { createDataToolManifests } from './manifests/dataToolManifests';
import { createRuntimeToolManifests } from './manifests/runtimeToolManifests';
import { createWorkspaceToolManifests } from './manifests/workspaceToolManifests';
import { createPresentationToolManifests } from './manifests/presentationToolManifests';
import { clarificationSchema } from './toolManifestSchemas';
import { validateClarification } from './toolManifestSupport';
import {
    createInitialAnalysisStageToolManifests,
} from './manifests/initialAnalysisStageManifests';

export { createInitialAnalysisStageToolManifests };

const createConversationToolManifests = (): ToolManifest[] => [
    {
        name: 'conversation.request_clarification',
        description: 'Ask the user a structured clarification question.',
        category: 'conversation',
        risk: 'medium',
        enabledByDefault: true,
        inputSchema: clarificationSchema,
        groups: ['conversation.clarification'],
        promptHints: [
            'LAST RESORT — only use when you genuinely cannot proceed (e.g., ambiguous entity, missing critical filter). If you have data and can analyze it, just do it.',
            'MUST provide 2-3 concrete labeled options describing specific analytical paths. Never ask vague questions like "How would you like to proceed?".',
            'If you truly need an open-ended reply, provide a concise question only and let the runtime fall back to free-text clarification.',
        ],
        resultShape: 'Stops execution and waits for user input.',
        validate: args => validateClarification(args as ClarificationRequest),
    },
];

export const buildBuiltinToolManifests = (columnNames: string[]): ToolManifest[] => ([
    ...createAnalysisToolManifests(columnNames),
    ...createDataToolManifests(),
    ...createRuntimeToolManifests(),
    ...createWorkspaceToolManifests(),
    ...createConversationToolManifests(),
    ...createPresentationToolManifests(),
]);

export const buildToolGroups = (manifests: ToolManifest[]): Partial<Record<ToolGroup, ToolName[]>> =>
    manifests.reduce<Partial<Record<ToolGroup, ToolName[]>>>((accumulator, manifest) => {
        (manifest.groups ?? []).forEach(group => {
            const existing = accumulator[group] ?? [];
            accumulator[group] = [...existing, manifest.name];
        });
        return accumulator;
    }, {});
