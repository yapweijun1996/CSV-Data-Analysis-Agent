// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmAnalysisGoal, regenerateAnalysesWithNewData, reproposeAnalysisGoals } from '../services/agent/orchestration/sessionManager';

const { handleInitialAnalysisMock, proposeAnalysisGoalsMock } = vi.hoisted(() => ({
    handleInitialAnalysisMock: vi.fn(),
    proposeAnalysisGoalsMock: vi.fn(),
}));

vi.mock('../services/agent/orchestration/initialAnalysisService', () => ({
    handleInitialAnalysis: handleInitialAnalysisMock,
}));

vi.mock('../services/agent/planning/goalProposer', () => ({
    proposeAnalysisGoals: proposeAnalysisGoalsMock,
}));

type MockStoreState = {
    addProgress: ReturnType<typeof vi.fn>;
    analysisCards: Array<{ plan: { title: string } }>;
    confirmedAnalysisGoal: string | null;
    finalSummary: string | null;
    aiCoreAnalysisSummary: string | null;
    isBusy: boolean;
};

const createStore = (overrides: Partial<MockStoreState> = {}) => {
    let state: MockStoreState = {
        addProgress: vi.fn(),
        analysisCards: [],
        confirmedAnalysisGoal: null,
        finalSummary: null,
        aiCoreAnalysisSummary: null,
        isBusy: false,
        ...overrides,
    };

    return {
        getState: () => state,
        setState: (partial: Partial<MockStoreState> | ((current: MockStoreState) => Partial<MockStoreState>)) => {
            const next = typeof partial === 'function' ? partial(state) : partial;
            state = { ...state, ...next };
        },
    };
};

describe('sessionManager regenerateAnalysesWithNewData', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('reruns initial analysis when a confirmed goal exists even if analysis cards were cleared', async () => {
        const store = createStore({
            confirmedAnalysisGoal: 'Evaluate Project Financial Performance',
        });
        const nextData = {
            fileName: 'cleaned.csv',
            data: [{ Code: '6000', Value: 100 }],
        };

        await regenerateAnalysesWithNewData(nextData as never, store as never);

        expect(handleInitialAnalysisMock).toHaveBeenCalledOnce();
        expect(handleInitialAnalysisMock).toHaveBeenCalledWith(
            nextData,
            'Evaluate Project Financial Performance',
            expect.objectContaining({
                getState: expect.any(Function),
                setState: expect.any(Function),
            }),
            { trigger: 'manual' },
        );
        expect(store.getState().addProgress).toHaveBeenCalledWith('Analysis refresh completed for the updated dataset.');
    });

    it('skips reanalysis when no prior analysis state exists', async () => {
        const store = createStore();
        const nextData = {
            fileName: 'cleaned.csv',
            data: [{ Code: '6000', Value: 100 }],
        };

        await regenerateAnalysesWithNewData(nextData as never, store as never);

        expect(handleInitialAnalysisMock).not.toHaveBeenCalled();
    });

    it('uses the manual trigger when a user confirms an analysis goal', async () => {
        let state = {
            addProgress: vi.fn(),
            analysisCards: [],
            confirmedAnalysisGoal: null,
            finalSummary: null,
            aiCoreAnalysisSummary: null,
            isBusy: false,
            isChangingGoal: false,
            chatHistory: [],
            goalState: 'idle',
            csvData: {
                fileName: 'cleaned.csv',
                data: [{ Code: '6000', Value: 100 }],
            },
        } as any;
        const store = {
            getState: () => state,
            setState: (partial: any) => {
                const next = typeof partial === 'function' ? partial(state) : partial;
                state = { ...state, ...next };
            },
        };

        await confirmAnalysisGoal('Evaluate Project Financial Performance', store);

        expect(handleInitialAnalysisMock).toHaveBeenCalledWith(
            expect.objectContaining({ fileName: 'cleaned.csv' }),
            'Evaluate Project Financial Performance',
            expect.objectContaining({
                getState: expect.any(Function),
                setState: expect.any(Function),
            }),
            { trigger: 'manual' },
        );
    });

    it('opens the assistant and enters an explicit change-goal state before proposing alternatives', () => {
        let state = {
            addProgress: vi.fn(),
            isChangingGoal: false,
            isBusy: false,
            isAsideVisible: false,
            goalState: 'confirmed',
            csvData: {
                fileName: 'cleaned.csv',
                data: [{ Code: '6000', Value: 100 }],
            },
        } as any;
        const store = {
            getState: () => state,
            setState: (partial: any) => {
                const next = typeof partial === 'function' ? partial(state) : partial;
                state = { ...state, ...next };
            },
        };

        reproposeAnalysisGoals(store as never);

        expect(state).toMatchObject({
            isChangingGoal: true,
            isBusy: true,
            isAsideVisible: true,
            goalState: 'pending_ai',
        });
        expect(proposeAnalysisGoalsMock).toHaveBeenCalledWith(
            expect.objectContaining({ fileName: 'cleaned.csv' }),
            store,
            { mode: 'change_goal' },
        );
    });
});
