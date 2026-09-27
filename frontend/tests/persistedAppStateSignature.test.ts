import { describe, expect, it } from 'vitest';
import { initialAppState } from '../store/useAppStore';
import { buildPersistedAppState, buildPersistedAppStateSignature } from '../services/persistence/persistedAppState';
import type { AppStore } from '../store/useAppStore';
import { createDataAnalysisSessionState } from '../services/agent/runtime/dataAnalysisSessionState';
import { syncSessionState } from '../services/agent/runtime/analysisSessionHelpers';
import { createSingleTableDatasetBundle } from '../services/data/datasetBundle';

const createState = (): AppStore => ({
    ...initialAppState,
    sessionId: 'session-1',
    currentView: 'analysis_dashboard' as const,
    csvData: {
        fileName: 'sales.csv',
        data: [{ Region: 'East', Revenue: 100 }],
        metadataRows: [],
        summaryRows: [],
        headerDepth: 1,
    },
    workspaceFiles: {},
}) as unknown as AppStore;

describe('buildPersistedAppStateSignature', () => {
    it('changes when column registry display labels change without changing column count', () => {
        const base = createState();
        const withRegistry = {
            ...base,
            columnRegistry: {
                datasetVersion: 'dataset-1',
                generatedAt: '2026-03-25T00:00:00.000Z',
                columns: [
                    {
                        columnId: 'col_region_1',
                        physicalName: 'Region',
                        displayLabel: 'Region',
                        aliases: ['Region'],
                        source: 'parsed_header' as const,
                        analysisRole: 'business_dimension' as const,
                        allowedUsages: { groupBy: true, filter: true, select: true, orderBy: true, aggregationHint: 'dimension_only' as const },
                        isSynthetic: false,
                        isExposedToAi: true,
                    },
                ],
            },
        };
        const relabeled = {
            ...withRegistry,
            columnRegistry: {
                ...withRegistry.columnRegistry,
                columns: withRegistry.columnRegistry.columns.map(column => ({
                    ...column,
                    displayLabel: 'Sales Region',
                })),
            },
        };

        expect(buildPersistedAppStateSignature(withRegistry)).not.toBe(buildPersistedAppStateSignature(relabeled));
    });

    it('changes when aliases or allowed usages change with the same column count', () => {
        const base = createState();
        const withRegistry = {
            ...base,
            columnRegistry: {
                datasetVersion: 'dataset-1',
                generatedAt: '2026-03-25T00:00:00.000Z',
                columns: [
                    {
                        columnId: 'col_region_1',
                        physicalName: 'Region',
                        displayLabel: 'Region',
                        aliases: ['Region'],
                        source: 'parsed_header' as const,
                        analysisRole: 'business_dimension' as const,
                        allowedUsages: { groupBy: true, filter: true, select: true, orderBy: true, aggregationHint: 'dimension_only' as const },
                        isSynthetic: false,
                        isExposedToAi: true,
                    },
                ],
            },
        };
        const changedAliases = {
            ...withRegistry,
            columnRegistry: {
                ...withRegistry.columnRegistry,
                columns: withRegistry.columnRegistry.columns.map(column => ({
                    ...column,
                    aliases: ['Region', 'Sales Region'],
                    allowedUsages: { ...column.allowedUsages, groupBy: false },
                })),
            },
        };

        expect(buildPersistedAppStateSignature(withRegistry)).not.toBe(buildPersistedAppStateSignature(changedAliases));
    });

    it('remains compatible when column registry is absent', () => {
        const base = createState();

        expect(buildPersistedAppStateSignature(base)).toBeTruthy();
    });

    it('persists the app-owned chat insight promotion boundary', () => {
        const base = createState();
        const promoted = {
            ...base,
            lastInsightExtractedAtTurn: 5,
        };

        expect(buildPersistedAppState(promoted).lastInsightExtractedAtTurn)
            .toBe(5);
        expect(buildPersistedAppStateSignature(promoted))
            .not.toBe(buildPersistedAppStateSignature(base));
    });

    it('changes when a material value changes without changing row count', () => {
        const base = createState();
        const mutated = {
            ...base,
            csvData: {
                ...base.csvData!,
                data: [{ Region: 'East', Revenue: 250 }],
            },
        };

        expect(buildPersistedAppStateSignature(base))
            .not.toBe(buildPersistedAppStateSignature(mutated));
    });

    it('tracks the canonical prepared dataset when it differs from the cleaned source', () => {
        const base = createState();
        const canonical = {
            ...base,
            canonicalCsvData: {
                ...base.csvData!,
                fileName: 'sales.canonical.csv',
                data: [{ Region: 'East', Revenue: 100, RowRole: 'fact' }],
            },
        };
        const changedCanonical = {
            ...canonical,
            canonicalCsvData: {
                ...canonical.canonicalCsvData,
                data: [{ Region: 'East', Revenue: 250, RowRole: 'fact' }],
            },
        };

        expect(buildPersistedAppStateSignature(canonical))
            .not.toBe(buildPersistedAppStateSignature(changedCanonical));
    });

    it('does not persist pending clarification as a blocking state across refreshes', () => {
        const base = createState();
        const stateWithClarification = {
            ...base,
            pendingClarification: {
                question: 'Which series should I inspect?',
                options: [],
                allowFreeText: true,
                clarificationMode: 'free_text' as const,
            },
            activeTurn: {
                turnId: 'turn-1',
                userMessage: 'inspect that series',
                status: 'waiting_for_clarification' as const,
                startedAt: new Date('2026-03-25T00:00:00.000Z'),
                budgetStatus: {
                    maxSteps: 6,
                    stepsUsed: 1,
                    retryCounts: {},
                    exhausted: false,
                },
                steps: [],
            },
        };

        const persisted = buildPersistedAppState(stateWithClarification);

        expect(persisted.pendingClarification).toBeNull();
        expect(persisted.activeTurn).toBeNull();
    });

    it('persists bundle lineage metadata without persisting source or prepared rows', () => {
        const base = createState();
        const datasetBundle = createSingleTableDatasetBundle({
            datasetId: 'dataset-1',
            sourceFingerprint: 'fingerprint-1',
            file: { name: 'sales.csv', size: 100, lastModified: 123 },
            data: base.csvData!,
        });
        const persisted = buildPersistedAppState({
            ...base,
            datasetBundle,
            rawCsvData: base.csvData,
            canonicalCsvData: base.csvData,
            initialDataSample: base.csvData!.data,
        });

        expect(persisted.datasetBundle).toEqual(datasetBundle);
        expect(persisted.csvData).toBeNull();
        expect(persisted.rawCsvData).toBeNull();
        expect(persisted.canonicalCsvData).toBeNull();
        expect(persisted.initialDataSample).toBeNull();
        expect(persisted.currentView).toBe('file_upload');
    });

    it('persists finished research-run history and tracks it in the autosave signature', () => {
        const base = createState();
        const session = {
            ...createDataAnalysisSessionState({
                sessionId: base.sessionId,
                origin: 'auto_analysis',
                runId: 'research-1',
            }),
            status: 'completed' as const,
            researchBrief: {
                goal: 'Find revenue drivers',
                datasetVersionId: 'version-1',
                questions: [],
                stopConditions: ['all_hypotheses_exhausted'],
                clarification: null,
                createdAt: new Date('2026-07-25T00:00:00Z'),
            },
        };
        const withHistory = {
            ...base,
            latestAnalysisSession: session,
            analysisSessionHistory: [session],
        };

        expect(buildPersistedAppState(withHistory).analysisSessionHistory).toEqual([session]);
        expect(buildPersistedAppStateSignature(withHistory))
            .not.toBe(buildPersistedAppStateSignature(base));
    });

    it('adds a finished research run to bounded history only once', () => {
        const state = createState();
        const session = {
            ...createDataAnalysisSessionState({
                sessionId: state.sessionId,
                origin: 'auto_analysis',
                runId: 'research-1',
            }),
            status: 'completed' as const,
        };
        const store = {
            getState: () => state,
            setState: (update: Partial<AppStore> | ((current: AppStore) => Partial<AppStore>)) => {
                Object.assign(state, typeof update === 'function' ? update(state) : update);
            },
        };

        syncSessionState(store, session, false);
        syncSessionState(store, session, false);

        expect(state.analysisSessionHistory).toEqual([session]);
        expect(state.activeAnalysisSession).toBeNull();
    });
});
