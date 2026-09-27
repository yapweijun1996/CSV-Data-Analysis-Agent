/** Convert a saved app clarification into a fresh Pi follow-up request. */
import type { ClarificationOption } from '../../../../types';
import { createChatMessage } from '../../../../utils/messageState';
import type { StoreApi } from '../../types';
import type {
    GroundingResult,
    QueryUnderstandingArtifact,
} from '../intentClassificationTypes';
import {
    buildClarificationFollowUpPrompt,
    evaluateClarificationResponse,
    resolveEffectivePendingClarification,
} from '../runtimeClarification';
import { resolveClarificationOriginalUserRequest } from '../runtimeClarificationPolicy';

export interface PiClarificationCompatibilityRequest {
    message: string;
    queryUnderstandingArtifact?: QueryUnderstandingArtifact;
    groundingResult?: GroundingResult;
}

const buildSelectionText = (choice: ClarificationOption): string => {
    const label = choice.label.trim();
    const value = choice.value.trim();
    return value && value !== label
        ? `${label} [value: ${value}]`
        : label || value;
};

export const preparePiClarificationCompatibilityRequest = async (
    choice: ClarificationOption,
    store: StoreApi,
): Promise<PiClarificationCompatibilityRequest | null> => {
    const { getState, setState } = store;
    const clarification = resolveEffectivePendingClarification(getState());
    if (!clarification) return null;

    const selection = buildSelectionText(choice);
    const resumePrefix =
        clarification.resumeContext?.resumeMessagePrefix
        ?? 'Clarification selected';
    const visibleSelection = `${resumePrefix}: ${selection}`;
    const assessment = await evaluateClarificationResponse({
        clarification,
        userChoice: choice,
        availableColumns:
            getState().columnProfiles?.map(column => column.name) ?? [],
        settings: getState().settings,
    });

    if (assessment.status === 'still_ambiguous') {
        setState(prev => ({
            chatHistory: [
                ...prev.chatHistory,
                createChatMessage({
                    sender: 'user',
                    text: visibleSelection,
                    timestamp: new Date(),
                    type: 'user_message',
                    clarificationSelection: choice,
                }),
                createChatMessage({
                    sender: 'ai',
                    text: buildClarificationFollowUpPrompt(
                        clarification,
                        getState().settings.language,
                    ),
                    timestamp: new Date(),
                    type: 'ai_message',
                }),
            ],
        }));
        return null;
    }

    const originalRequest = resolveClarificationOriginalUserRequest(
        clarification.resumeContext?.resumeOriginalUserMessage,
        clarification.resumeContext?.originalUserRequest,
        getState().activeTurn?.userMessage,
    );
    if (!originalRequest) return null;

    setState(prev => ({
        pendingClarification: null,
        activeTurn: null,
        chatHistory: [
            ...prev.chatHistory,
            createChatMessage({
                sender: 'user',
                text: visibleSelection,
                timestamp: new Date(),
                type: 'user_message',
                clarificationSelection: choice,
            }),
        ],
    }));

    return {
        message: [
            'Continue the original request using the user clarification below.',
            `Original user request: ${originalRequest.trim()}`,
            `Clarification question: ${clarification.question.trim()}`,
            `Selected option: ${selection}`,
            ...(clarification.resumeContext?.selectedPath
                ? [`Selected path: ${clarification.resumeContext.selectedPath}`]
                : []),
            ...(clarification.resumeContext?.mustPreserveOutcome
                ? [`Must preserve outcome: ${clarification.resumeContext.mustPreserveOutcome}`]
                : []),
            `Clarification assessment: ${assessment.status}`,
            ...(assessment.assumptionSummary
                ? [`Assumption summary: ${assessment.assumptionSummary}`]
                : []),
            'Do not ask the same clarification again unless a new ambiguity remains.',
        ].join('\n'),
        queryUnderstandingArtifact:
            clarification.resumeContext?.queryUnderstandingArtifact,
        groundingResult: clarification.resumeContext?.groundingResult,
    };
};
