import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskInspectionEntry, TaskInspectionView } from '../components/task/TaskInspection';

const { state, readCode, inspectReview, stop } = vi.hoisted(() => ({ state: {} as Record<string, any>, readCode: vi.fn(), inspectReview: vi.fn(), stop: vi.fn() }));
vi.mock('../store/useAppStore', () => ({ useAppStore: Object.assign((select: (s: typeof state) => unknown) => select(state), { getState: () => state }) }));
vi.mock('../services/agent/runtime/pi/piTaskInspection', () => ({ readTaskProgram: readCode }));
vi.mock('../services/agent/runtime/pi/piCandidateReviewState', () => ({ inspectPiCandidateReview: inspectReview }));
vi.mock('../services/session/sessionOwnership', () => ({ cancelOwnedRun: stop }));
beforeEach(() => {
    vi.resetAllMocks(); Object.keys(state).forEach(k => delete state[k]);
    Object.assign(state, { sessionId: 'session', isBusy: false, activeExecution: null,
        activeAgentTask: { taskId: 'task', sessionId: 'session', revision: 2, status: 'completed', goal: 'Inspect October correlation.',
            scope: { digest: 'scope', answer: { queries: [] } }, inputBindings: [], requiredOutputs: [], budget: { pausedForUser: false,
                limits: { transformationAttempts: 3 }, used: { transformationAttempts: 2 } } },
        taskInspection: { taskId: 'task', sessionId: 'session', runId: 'run', runtime: 'pinned-runtime', programs: [
            { path: '/workspace/program.js', revision: 1, sha256: 'old', byteSize: 4005 }, { path: '/workspace/program.js', revision: 2, sha256: 'new', byteSize: 10 } ],
            observations: [{ id: 'call', tool: 'code.run', runId: 'run', taskRevision: 2, status: 'failed', message: 'Actual syntax error', stderr: 'actual stack', truncated: true }],
            grounding: { status: 'accepted', queryIds: ['current-query'], computationIds: ['current-computation'], reasons: [] } },
        handleClarificationResponse: vi.fn(), setIsWorkspaceModalOpen: vi.fn() });
    inspectReview.mockReturnValue({ available: false, reason: 'Review is historical or unavailable.' });
    readCode.mockImplementation((_store, _task, p, offset) => ({ content: `revision ${p.revision} at ${offset}`, startOffset: offset, endOffset: offset + 3000, complete: p.revision === 2 || offset > 0 }));
});
afterEach(cleanup);
describe('task inspection UI', () => {
    it('offers a collapsed entry, traps focus and closes with Escape restoring its trigger', async () => {
        render(<TaskInspectionEntry />);
        expect(screen.queryByRole('dialog')).toBeNull();
        const trigger = screen.getByRole('button', { name: 'Inspect task' }); trigger.focus(); fireEvent.click(trigger);
        const dialog = screen.getByRole('dialog', { name: 'Task inspection' });
        await waitFor(() => expect(screen.getByRole('button', { name: 'Close task inspection' })).toHaveFocus());
        fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
        expect(dialog.contains(document.activeElement)).toBe(true);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull(); expect(trigger).toHaveFocus();
    });
    it('pages exact revisioned source and renders actual bounded observations and evidence references', async () => {
        render(<TaskInspectionView onOpenRecovery={vi.fn()} />);
        expect(screen.getByText('current-query')).toBeInTheDocument(); expect(screen.getByText('current-computation')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Code' }));
        await screen.findByText('revision 2 at 0');
        fireEvent.change(screen.getByLabelText('Program revision'), { target: { value: '/workspace/program.js@1' } });
        await screen.findByText('revision 1 at 0'); fireEvent.click(screen.getByRole('button', { name: 'Next code range' }));
        await screen.findByText('revision 1 at 3000'); expect(screen.getByRole('button', { name: 'Next code range' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Observations' }));
        expect(screen.getByText('Actual syntax error')).toBeInTheDocument(); expect(screen.getByText(/actual stack/)).toBeInTheDocument();
        expect(screen.getByText(/Observation truncated/)).toBeInTheDocument();
    });
    it('delegates Stop only for the displayed current run', () => {
        state.activeExecution = { runId: 'run' }; render(<TaskInspectionView onOpenRecovery={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Stop task' })); expect(stop).toHaveBeenCalledOnce();
    });
    it('does not let a stale Stop click cancel a later run', () => {
        state.activeExecution = { runId: 'run' }; render(<TaskInspectionView onOpenRecovery={vi.fn()} />);
        const button = screen.getByRole('button', { name: 'Stop task' });
        state.activeExecution = { runId: 'later-run' }; fireEvent.click(button);
        expect(stop).not.toHaveBeenCalled();
    });
    it('presents a three-step review without conflating a pending candidate with the current accepted dataset', () => {
        state.datasetBundle = { datasetVersion: 'accepted-v3', acceptedCommit: { revision: 3, commitId: 'accepted-v3' } };
        state.taskInspection.candidate = { candidateId: 'candidate-next', taskRevision: 2, scopeDigest: 'scope-next', changeDigest: 'change-next',
            requirements: 'grain: ID; metric: Amount', requirementsTruncated: false, tables: [{ name: 'facts', rows: 2, columns: ['ID', 'Amount'] }],
            excludedCount: 0, exclusions: [], diff: 'mappedCells: 4', diffTruncated: false };
        render(<TaskInspectionView onOpenRecovery={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Review' }));
        expect(screen.getByText('Confirm Meaning')).toBeInTheDocument();
        expect(screen.getByText('Independent Validation')).toBeInTheDocument();
        expect(screen.getByText('Approve Dataset')).toBeInTheDocument();
        expect(screen.getByText(/Current accepted dataset: accepted-v3/)).toBeInTheDocument();
        expect(screen.getByText(/Pending candidate: candidate-next/)).toBeInTheDocument();
        expect(screen.getByText(/Review only/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Approve Dataset' })).toBeNull();
    });
    it('marks truncated candidate mapping unavailable and does not present missing exclusions as verified zero', () => {
        state.taskInspection.candidate = { candidateId: 'candidate-truncated', taskRevision: 2, scopeDigest: 'scope', changeDigest: 'change',
            requirements: 'partial mapping preview', requirementsTruncated: true, tables: [{ name: 'facts', rows: 2, columns: ['ID'] }],
            excludedCount: null, exclusions: [], diff: '', diffTruncated: true };
        render(<TaskInspectionView onOpenRecovery={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Review' }));
        expect(screen.getByText(/Mapping unavailable or truncated/)).toBeInTheDocument();
        expect(screen.getByText(/Excluded rows: unknown/)).toBeInTheDocument();
        expect(screen.queryByText('Excluded rows: 0')).toBeNull();
    });
    it('shows captured scope, grain, exclusions and independent reconciliation before review', () => {
        state.taskInspection.candidate = { candidateId: 'candidate', taskRevision: 2, scopeDigest: 'candidate-scope', changeDigest: 'change',
            requirements: 'grain: ID; group: Town', requirementsTruncated: false, tables: [{ name: 'facts', rows: 2, columns: ['ID', 'Amount'] }],
            excludedCount: 1, exclusions: ['source original row 2: subtotal'], diff: 'mappedCells: 4; changedCells: 2', diffTruncated: false,
            validation: { decision: 'validated', reasons: [], checks: ['grain_unique'], reconciliation: 'expectedMinor: -500; actualMinor: -500', truncated: false } };
        render(<TaskInspectionView onOpenRecovery={vi.fn()} />); fireEvent.click(screen.getByRole('button', { name: 'Review' }));
        expect(screen.getByText('grain: ID; group: Town')).toBeInTheDocument(); expect(screen.getByText(/row 2: subtotal/)).toBeInTheDocument();
        expect(screen.getByText(/expectedMinor: -500/)).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    });
    it.each([null, 'candidate_multi_table_atomic_promotion_unavailable'])('does not infer a commit restriction from table count (%s)', commitRestriction => {
        state.taskInspection.candidate = { candidateId: 'candidate', taskRevision: 2, scopeDigest: 'scope', changeDigest: 'change',
            requirements: '', requirementsTruncated: false, tables: [{ name: 'facts', rows: 2, columns: ['ID'] }, { name: 'names', rows: 2, columns: ['ID'] }],
            excludedCount: 0, exclusions: [], diff: '', diffTruncated: false, commitRestriction };
        render(<TaskInspectionView onOpenRecovery={vi.fn()} />); fireEvent.click(screen.getByRole('button', { name: 'Review' }));
        expect(Boolean(screen.queryByText(/Multi-table Draft \/ Uncommitted/))).toBe(Boolean(commitRestriction));
    });
    it('rechecks live approval at click time and withholds historical or stale actions', () => {
        state.pendingClarification = { options: [{ label: 'Approve', value: 'approve' }], resumeContext: { piCandidateApproval: { reviewId: 'live', reviewDigest: 'digest' } } };
        inspectReview.mockReturnValue({ available: true, reason: 'Fresh host recheck required.' });
        render(<TaskInspectionView onOpenRecovery={vi.fn()} />); fireEvent.click(screen.getByRole('button', { name: 'Review' }));
        const approve = screen.getByRole('button', { name: 'Approve' }); inspectReview.mockReturnValue({ available: false, reason: 'Expired' });
        fireEvent.click(approve); expect(state.handleClarificationResponse).not.toHaveBeenCalled();
    });
    it('shows explicit missing authority and recovery rather than an executable restored task', () => {
        state.activeAgentTask = null; state.candidateRecovery = { checkpointId: 'saved' };
        const recovery = vi.fn(); render(<TaskInspectionView onOpenRecovery={recovery} />);
        expect(screen.getByText('No live task inspection')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Open dataset recovery' })); expect(recovery).toHaveBeenCalledOnce();
    });
});
