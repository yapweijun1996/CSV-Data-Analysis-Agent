import type { ClarificationOption, ClarificationRequest } from '../../../../types';
import { createChatMessage } from '../../../../utils/messageState';
import { getTranslation } from '../../../../utils/localization';
import { handleAiAction } from '../../actionHandler';
import { getCurrentAnalysisDatasetVersion } from '../../artifactProvenance';
import { validateDataMutatePayload } from '../../execution/dataMutateContract';
import type { StoreApi } from '../../types';
import { finalizeRuntimeOutcome } from '../runtimeFinalize';
import { completeAgentTurn, failAgentTurn } from '../runtimeState';

export const resumePiMutationApproval = async (
    pending: ClarificationRequest,
    choice: ClarificationOption,
    store: StoreApi,
): Promise<void> => {
    const approval = pending.resumeContext?.piMutationApproval;
    if (!approval) throw new Error('The Pi approval request is unavailable.');
    const state = store.getState();
    const validSession = approval.sessionId === state.sessionId;
    const validDataset = approval.datasetVersion === getCurrentAnalysisDatasetVersion(state);
    const approved = choice.value === 'approve';
    const validArgs = validateDataMutatePayload(approval.args).length === 0;
    store.setState(prev => ({
        pendingClarification: null,
        chatHistory: [...prev.chatHistory, createChatMessage({
            sender: 'user',
            text: `${pending.question.split('\n')[0]} ${choice.label}`,
            timestamp: new Date(),
            type: 'user_message',
            clarificationSelection: choice,
        })],
    }));
    let message: string;
    let failed = false;
    if (!approved) {
        message = getTranslation('approval_denied_no_changes', state.settings.language);
    } else if (!validSession || !validDataset || !validArgs) {
        message = 'The dataset or proposed action changed. No data was modified. Start a new request.';
        failed = true;
    } else {
        const result = await handleAiAction({
            type: 'tool_call',
            thought: 'Execute the exact user-approved Pi dataset change.',
            toolName: 'data.mutate',
            args: approval.args,
        }, store, { toolStage: 'analysis', requireRowDeleteConfirmation: true });
        message = result.message;
        failed = result.status !== 'success';
    }
    const turn = store.getState().activeTurn;
    if (!turn) {
        store.setState(prev => ({
            isBusy: false,
            chatLifecycleState: failed ? 'failed' : 'completed',
            chatHistory: [...prev.chatHistory, createChatMessage({
                sender: 'ai', text: message, timestamp: new Date(),
                type: 'ai_message', isError: failed,
            })],
        }));
        return;
    }
    const observation = {
        type: 'tool_result' as const,
        status: failed ? 'error' as const : 'success' as const,
        summary: message,
        toolName: 'data.mutate' as const,
    };
    const finishedTurn = failed
        ? failAgentTurn(turn, observation)
        : completeAgentTurn(turn, message);
    finalizeRuntimeOutcome({
        store,
        turn: finishedTurn,
        preserveActiveTurn: true,
        outcome: {
            runId: `pi-${turn.turnId}`,
            turnId: turn.turnId,
            sessionId: state.sessionId,
            outcomeKind: failed ? 'failed' : 'accepted',
            lifecycleState: failed ? 'failed' : 'completed',
            stage: 'finalizing',
            reason: failed ? 'pi_approval_execution_failed'
                : approved ? 'pi_approved_mutation_completed' : 'pi_approval_denied',
            retryable: false,
            eventType: failed ? 'turn_failed' : 'turn_completed',
            eventMessage: message,
            eventDetail: { runtimeOwner: 'pi', userApproved: approved },
            assistantMessage: message,
            assistantMessageIsError: failed,
        },
    });
};
