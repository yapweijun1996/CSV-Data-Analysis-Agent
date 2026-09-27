// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
    AgentActivityLifecycle,
    AgentEvent,
    AgentRuntimeEvent,
} from '../types';
import {
    normalizeAgentActivityEvent,
    projectRuntimeEventToActivity,
    restoreAgentActivityHistory,
    selectReportScopedActivity,
} from '../services/agent/activity/agentActivity';
import { AgentActivityView } from '../components/agent-activity/AgentActivityView';
import { createAgentSlice } from '../store/slices/agentSlice';
import { resetAgentTelemetryBuffers } from '../store/slices/agentTelemetryHelpers';
import type { AppStore } from '../store/useAppStore';

const runtimeEvent = (
    type: AgentRuntimeEvent['type'],
    index: number,
): AgentRuntimeEvent => ({
    id: `runtime-${index}`,
    sessionId: 'session-1',
    runId: 'run-1',
    turnId: 'turn-1',
    type,
    message: `Runtime event ${type}`,
    timestamp: new Date(`2026-07-25T00:00:0${index}.000Z`),
});

const legacyEvent = (
    id: string,
    sessionId: string,
    runId: string,
    status: AgentEvent['status'],
): AgentEvent => ({
    id,
    sessionId,
    datasetId: 'dataset-1',
    runId,
    timestamp: new Date(`2026-07-25T00:00:0${id.length % 10}.000Z`),
    phase: 'execution',
    step: id,
    status,
    message: `Event ${id}`,
});

describe('unified assistant activity projection', () => {
    it('maps runtime events to every reader-facing lifecycle state', () => {
        const cases: Array<[AgentRuntimeEvent['type'], AgentActivityLifecycle]> = [
            ['turn_queued', 'queued'],
            ['turn_started', 'running'],
            ['clarification_requested', 'waiting'],
            ['retry_scheduled', 'degraded'],
            ['turn_failed', 'failed'],
            ['turn_cancelled', 'cancelled'],
            ['turn_completed', 'completed'],
        ];

        for (const [type, expected] of cases) {
            expect(projectRuntimeEventToActivity(runtimeEvent(type, cases.findIndex(item => item[0] === type) + 1)))
                .toMatchObject({
                    sessionId: 'session-1',
                    runId: 'run-1',
                    activity: {
                        lifecycle: expected,
                        eventType: type,
                        source: type === 'clarification_requested' ? 'approval' : 'runtime',
                    },
                });
        }
    });

    it('normalizes legacy app events into the same envelope', () => {
        const normalized = normalizeAgentActivityEvent(
            legacyEvent('upload_received', 'session-1', 'file-run', 'in_progress'),
        );

        expect(normalized.activity).toMatchObject({
            lifecycle: 'running',
            eventType: 'upload_received',
            title: 'Upload Received',
        });
    });

    it('keeps restored history report-scoped and closes non-terminal runs', () => {
        const restored = restoreAgentActivityHistory([
            legacyEvent('run-start', 'old-session', 'run-open', 'in_progress'),
            {
                ...legacyEvent('run-done', 'old-session', 'run-done', 'done'),
                activity: {
                    kind: 'terminal',
                    lifecycle: 'completed',
                    source: 'runtime',
                    eventType: 'turn_completed',
                    title: 'Turn Completed',
                },
            },
        ], 'restored-session');

        expect(restored.every(event => event.sessionId === 'restored-session')).toBe(true);
        expect(restored).toContainEqual(expect.objectContaining({
            runId: 'run-open',
            activity: expect.objectContaining({
                kind: 'terminal',
                lifecycle: 'cancelled',
                eventType: 'restored_run_interrupted',
            }),
        }));
        expect(restored.filter(event => event.runId === 'run-done')).toHaveLength(1);
        expect(selectReportScopedActivity(restored, { sessionId: 'other-session' })).toHaveLength(0);
    });

    it('projects recordRuntimeEvent into the visible agent event buffer', () => {
        let state = {
            sessionId: 'session-1',
            currentDatasetId: 'dataset-1',
            activeTurn: null,
            cleaningRun: null,
            activeSpreadsheetFilter: null,
            agentEvents: [],
            runtimeEvents: [],
            agentToolLogs: [],
            isAgentModalOpen: false,
            isDebugLogsModalOpen: false,
            isDataPreparationModalOpen: false,
        } as unknown as AppStore;
        const setState = (update: Partial<AppStore> | ((current: AppStore) => Partial<AppStore>)) => {
            const partial = typeof update === 'function' ? update(state) : update;
            state = { ...state, ...partial };
        };
        const getState = () => state;
        state = {
            ...state,
            ...createAgentSlice(setState as never, getState as never, {} as never),
        };

        state.recordRuntimeEvent({
            type: 'turn_started',
            runId: 'run-visible',
            message: 'Started a visible run.',
        });
        state.syncTelemetryToStore();

        expect(state.runtimeEvents).toHaveLength(1);
        expect(state.agentEvents).toContainEqual(expect.objectContaining({
            runId: 'run-visible',
            activity: expect.objectContaining({
                kind: 'follow_up',
                lifecycle: 'running',
                source: 'runtime',
            }),
        }));
    });

    it('uses structured activity labels from runtime diagnostics', () => {
        const event = projectRuntimeEventToActivity({
            ...runtimeEvent('tool_degraded', 20),
            reason: 'row_inspection_unavailable',
            detail: {
                activityTitle: '2/9 Detect Noise Rows',
                activityKind: 'preparation',
                activityExplanation: 'No row inspection artifact was available.',
            },
        });

        expect(event.activity).toMatchObject({
            kind: 'preparation',
            lifecycle: 'degraded',
            title: '2/9 Detect Noise Rows',
            explanation: 'No row inspection artifact was available.',
        });
    });
});

describe('AgentActivityView', () => {
    beforeEach(() => {
        resetAgentTelemetryBuffers();
    });

    afterEach(() => {
        cleanup();
        resetAgentTelemetryBuffers();
    });

    it('renders distinguishable lifecycle badges and filters another report session', () => {
        const lifecycleEvents: AgentEvent[] = (
            ['running', 'waiting', 'degraded', 'failed', 'cancelled', 'completed'] as AgentActivityLifecycle[]
        ).map((lifecycle, index) => ({
            ...legacyEvent(`event-${lifecycle}`, 'session-1', `run-${index}`, lifecycle === 'failed' ? 'error' : 'done'),
            activity: {
                kind: lifecycle === 'waiting' ? 'approval' : 'follow_up',
                lifecycle,
                source: lifecycle === 'waiting' ? 'approval' : 'runtime',
                eventType: `event_${lifecycle}`,
                title: `Event ${lifecycle}`,
            },
        }));
        lifecycleEvents.push({
            ...legacyEvent('other-report', 'session-2', 'other-run', 'done'),
            activity: {
                kind: 'terminal',
                lifecycle: 'completed',
                source: 'app',
                eventType: 'other_report',
                title: 'Other Report',
            },
        });

        const { container } = render(
            <AgentActivityView events={lifecycleEvents} sessionId="session-1" datasetId={null} />,
        );

        for (const lifecycle of ['running', 'waiting', 'degraded', 'failed', 'cancelled', 'completed']) {
            expect(container.querySelector(`[data-agent-lifecycle="${lifecycle}"]`)).not.toBeNull();
        }
        expect(screen.queryByText('Other Report')).toBeNull();
        expect(screen.getByRole('list', { name: 'Assistant activity' })).toBeTruthy();
    });
});
