import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClarificationRequest } from '../types';
import { getCurrentAnalysisDatasetVersion } from '../services/agent/artifactProvenance';

const { actionMock, finalizeMock } = vi.hoisted(() => ({
    actionMock: vi.fn(),
    finalizeMock: vi.fn(),
}));

vi.mock('../services/agent/actionHandler', () => ({ handleAiAction: actionMock }));
vi.mock('../services/agent/runtime/runtimeFinalize', () => ({ finalizeRuntimeOutcome: finalizeMock }));

import { resumePiMutationApproval } from '../services/agent/runtime/pi/piMutationApproval';

const args = {
    explanation: 'Normalize region labels.',
    operations: [{
        type: 'replace_values', id: 'normalize-region', reason: 'Normalize labels',
        column: 'Region', replacements: [{ from: 'east', to: 'East' }],
    }],
};

const createStore = (sessionId = 'session-1') => {
    let state: any = {
        sessionId,
        settings: { language: 'English' },
        csvData: { fileName: 'sample.csv', data: [{ Region: 'east' }] },
        canonicalCsvData: null,
        pendingClarification: null,
        chatHistory: [],
        activeTurn: null,
        isBusy: true,
    };
    return {
        getState: () => state,
        setState: (update: any) => {
            state = { ...state, ...(typeof update === 'function' ? update(state) : update) };
        },
    };
};

const approvalFor = (store: ReturnType<typeof createStore>): ClarificationRequest => ({
    question: `Approve this exact dataset change?\n${JSON.stringify(args)}`,
    options: [{ label: 'Approve', value: 'approve' }, { label: 'Deny', value: 'deny' }],
    interactionKind: 'approval',
    resumeContext: { piMutationApproval: {
        sessionId: store.getState().sessionId,
        datasetVersion: getCurrentAnalysisDatasetVersion(store.getState()),
        originalRequest: 'Normalize regions',
        args,
    } },
});

describe('Pi mutation approval boundary', () => {
    beforeEach(() => vi.clearAllMocks());

    it('denies without calling the mutation executor', async () => {
        const store = createStore();
        await resumePiMutationApproval(approvalFor(store), { label: 'Deny', value: 'deny' }, store as never);
        expect(actionMock).not.toHaveBeenCalled();
        expect(store.getState().pendingClarification).toBeNull();
        expect(String(store.getState().chatHistory.at(-1)?.text)).toMatch(/no changes/i);
    });

    it('executes the exact validated action only after approval', async () => {
        const store = createStore();
        actionMock.mockResolvedValueOnce({ status: 'success', message: 'Region normalized.' });
        await resumePiMutationApproval(approvalFor(store), { label: 'Approve', value: 'approve' }, store as never);
        expect(actionMock).toHaveBeenCalledTimes(1);
        expect(actionMock).toHaveBeenCalledWith(expect.objectContaining({
            toolName: 'data.mutate', args,
        }), store, expect.objectContaining({ requireRowDeleteConfirmation: true }));
    });

    it('rejects approval after the dataset changes', async () => {
        const store = createStore();
        const pending = approvalFor(store);
        store.setState({ csvData: { fileName: 'other.csv', data: [{ Region: 'west' }] } });
        await resumePiMutationApproval(pending, { label: 'Approve', value: 'approve' }, store as never);
        expect(actionMock).not.toHaveBeenCalled();
        expect(String(store.getState().chatHistory.at(-1)?.text)).toMatch(/no data was modified/i);
    });
});
