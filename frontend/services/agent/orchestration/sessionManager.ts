import type { AppStore } from '../../../store/useAppStore';
import { CsvData, ChatMessage } from '../../../types';
import { handleInitialAnalysis } from './initialAnalysisService';
import { proposeAnalysisGoals } from '../planning/goalProposer';
import { createChatMessage } from '../../../utils/messageState';
import { getPreferredAnalysisDataset } from '../reportStructureState';

type StoreApi = {
    getState: () => AppStore;
    setState: (partial: Partial<AppStore> | ((state: AppStore) => Partial<AppStore>)) => void;
};

const LOG_PREFIX = '[SessionManager]';

export const confirmAnalysisGoal = async (goalTitle: string, store: StoreApi) => {
    const { getState, setState } = store;
    const isChanging = getState().isChangingGoal;
    console.log(`${LOG_PREFIX} User confirmed goal: "${goalTitle}". Is changing goal: ${isChanging}`);

    setState(prev => ({
        chatHistory: prev.chatHistory.filter(msg => msg.type !== 'ai_goal_clarification'),
        goalState: 'confirmed',
        confirmedAnalysisGoal: goalTitle,
    }));

    if (isChanging) {
        getState().addProgress(`Goal changed. Resetting analysis...`);
        console.log(`${LOG_PREFIX} Goal is being changed, resetting analysis state.`);
        setState({
            analysisCards: [],
            finalSummary: null,
            aiCoreAnalysisSummary: null,
            planQueue: [],
            contextualSummary: null,
        });
    }

    const userConfirmationMessage: ChatMessage = createChatMessage({
        sender: 'user',
        text: isChanging 
            ? `Okay, let's change the goal to: "${goalTitle}"`
            : `Okay, let's focus on: "${goalTitle}"`,
        timestamp: new Date(),
        type: 'user_message',
    });
    setState(prev => ({ chatHistory: [...prev.chatHistory, userConfirmationMessage] }));

    const dataset = getPreferredAnalysisDataset(getState());
    if (dataset) {
        await handleInitialAnalysis(dataset, goalTitle, store, { trigger: 'manual' });
    }
}

export const regenerateAnalysesWithNewData = async (newData: CsvData, store: StoreApi) => {
    const { getState, setState } = store;
    getState().addProgress('Data has changed. Regenerating all analysis cards...');
    const existingPlans = getState().analysisCards.map(card => card.plan);
    const confirmedGoal = getState().confirmedAnalysisGoal?.trim() || null;
    const hasExistingAnalysis = existingPlans.length > 0
        || Boolean(confirmedGoal)
        || Boolean(getState().finalSummary)
        || Boolean(getState().aiCoreAnalysisSummary);
    setState({ isBusy: true, analysisCards: [], finalSummary: null });
    try {
        if (hasExistingAnalysis) {
            await handleInitialAnalysis(
                newData,
                confirmedGoal || 'Regenerate analysis based on new data.',
                store,
                { trigger: 'manual' },
            );
            getState().addProgress('Analysis refresh completed for the updated dataset.');
        }
    } catch (error) {
        getState().addProgress(`Error updating analyses: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
        setState({ isBusy: false });
    }
};

export const reproposeAnalysisGoals = (store: StoreApi) => {
    const { getState, setState } = store;
    setState({
        isChangingGoal: true,
        isBusy: true,
        isAsideVisible: true,
        goalState: 'pending_ai',
    });
    getState().addProgress('Preparing a few new analysis directions...');

    const dataset = getPreferredAnalysisDataset(getState());
    if (dataset) {
        void proposeAnalysisGoals(dataset, store, { mode: 'change_goal' });
        return;
    }
    setState({ isChangingGoal: false, isBusy: false, goalState: 'confirmed' });
};
