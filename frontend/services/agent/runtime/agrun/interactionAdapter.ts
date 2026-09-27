/**
 * AGRUN-006: converts the app's existing clarification/approval selection
 * surface into the typed follow-up runtime interaction contract. Resume tokens
 * remain opaque and are never interpreted by UI components.
 */
import type {
    ClarificationOption,
    ClarificationRequest,
} from '../../../../types';
import type { FollowUpInteractionResolution } from './types';

export class AgrunInteractionResolutionError extends Error {
    readonly code: 'agrun_interaction_stale' | 'agrun_interaction_invalid';

    constructor(
        code: AgrunInteractionResolutionError['code'],
        message: string,
    ) {
        super(message);
        this.name = 'AgrunInteractionResolutionError';
        this.code = code;
    }
}

const readSelection = (choice: ClarificationOption): string =>
    (choice.value || choice.label).trim();

export const createAgrunInteractionResolution = ({
    clarification,
    choice,
    signal,
}: {
    clarification: ClarificationRequest;
    choice: ClarificationOption;
    signal?: AbortSignal;
}): FollowUpInteractionResolution => {
    const metadata = clarification.resumeContext?.followUpRuntimeInteraction;
    if (!metadata || metadata.owner !== 'agrun') {
        throw new AgrunInteractionResolutionError(
            'agrun_interaction_stale',
            'The Agent Runtime JavaScript interaction is no longer available.',
        );
    }

    const selection = readSelection(choice);
    if (!selection) {
        throw new AgrunInteractionResolutionError(
            'agrun_interaction_invalid',
            'A response is required to continue the Agent Runtime JavaScript turn.',
        );
    }

    if (metadata.kind === 'approval') {
        const decision = selection.toLowerCase();
        if (decision !== 'approve' && decision !== 'deny') {
            throw new AgrunInteractionResolutionError(
                'agrun_interaction_invalid',
                'Choose Approve or Deny to continue the Agent Runtime JavaScript turn.',
            );
        }
        if (metadata.resumeToken === undefined || metadata.resumeToken === null) {
            throw new AgrunInteractionResolutionError(
                'agrun_interaction_stale',
                'The Agent Runtime JavaScript approval token is missing or stale.',
            );
        }
        return {
            kind: 'approval',
            sessionId: metadata.sessionId,
            turnId: metadata.turnId,
            decision,
            resumeToken: metadata.resumeToken,
            signal,
        };
    }

    return {
        kind: 'clarification',
        sessionId: metadata.sessionId,
        turnId: metadata.turnId,
        answer: selection,
        resumeToken: metadata.resumeToken,
        signal,
    };
};

export const createAgrunApprovalResumeInput = (
    interaction: Extract<FollowUpInteractionResolution, { kind: 'approval' }>,
) => ({
    type: 'approval_resolution',
    decision: interaction.decision,
    resumeToken: interaction.resumeToken,
});
