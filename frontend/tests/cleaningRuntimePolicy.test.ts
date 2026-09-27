import { describe, expect, it } from 'vitest';
import {
    createCleaningRuntimeState,
    getAllowedCleaningToolNames,
    trackCleaningProgress,
    transitionCleaningPhase,
    validateCleaningActionForPhase,
} from '../services/agent/orchestration/cleaningRuntimePolicy';
import type { AiAction, ToolExecutionResult } from '../types';
import {
    createMultiHeaderProjectMatrixCase,
    createWeakSignalMixedReportCase,
} from './reportShapeFixtures/cases';

describe('cleaning runtime policy', () => {
    it('keeps edit phase limited to deterministic mutate plus cleaning control tools', () => {
        const allowed = [...getAllowedCleaningToolNames('edit', 'openai')].sort();
        expect(allowed).toEqual(['cleaning.restart', 'cleaning.resume', 'data.mutate']);
    });

    it('treats data.mutate with deterministic operations as an applied staged edit', () => {
        const initial = {
            ...createCleaningRuntimeState(),
            phase: 'edit' as const,
        };
        const action: AiAction = {
            type: 'tool_call',
            thought: 'Drop blank rows.',
            toolName: 'data.mutate',
            args: {
                explanation: 'Remove blank rows.',
                operations: [
                    {
                        id: 'drop-blanks',
                        type: 'drop_blank_rows',
                        reason: 'Remove empty rows.',
                    },
                ],
            },
        };
        const result: ToolExecutionResult = {
            status: 'success',
            toolName: 'data.mutate',
            message: 'Executed data.mutate',
            shouldStop: false,
        };

        const next = trackCleaningProgress(initial, action, result);

        expect(next.editApplied).toBe(true);
        expect(next.mutateCount).toBe(1);
        expect(next.lastMutationSynced).toBe(true);
        expect(next.noProgressReason).toBeNull();
    });

    it('treats single-operation data.mutate payloads as applied staged edits', () => {
        const initial = {
            ...createCleaningRuntimeState(),
            phase: 'edit' as const,
        };
        const action: AiAction = {
            type: 'tool_call',
            thought: 'Drop blank rows.',
            toolName: 'data.mutate',
            args: {
                explanation: 'Remove blank rows.',
                operation: {
                    id: 'drop-blanks',
                    type: 'drop_blank_rows',
                    reason: 'Remove empty rows.',
                },
            },
        };
        const result: ToolExecutionResult = {
            status: 'success',
            toolName: 'data.mutate',
            message: 'Executed data.mutate',
            shouldStop: false,
        };

        const next = trackCleaningProgress(initial, action, result);

        expect(next.editApplied).toBe(true);
        expect(next.mutateCount).toBe(1);
        expect(next.lastMutationSynced).toBe(true);
        expect(next.noProgressReason).toBeNull();
    });

    it('resets inspect read tracking when looping back from edit to inspect', () => {
        const initial = {
            ...createCleaningRuntimeState(),
            phase: 'edit' as const,
            editApplied: true,
            inspectedCleaned: true,
        };

        const next = transitionCleaningPhase(initial, 'inspect');

        expect(next.phase).toBe('inspect');
        expect(next.inspectedCleaned).toBe(false);
        expect(next.verifyCompleted).toBe(false);
    });

    it('rejects malformed data.mutate actions before executor runtime', () => {
        const initial = {
            ...createCleaningRuntimeState(),
            phase: 'edit' as const,
        };
        const action: AiAction = {
            type: 'tool_call',
            thought: 'Try to reshape the table.',
            toolName: 'data.mutate',
            args: {
                explanation: 'Remove metadata rows and unpivot project columns.',
                operations: [
                    {
                        id: 'remove_metadata_rows',
                        type: 'unpivot_columns',
                        indices: [0, 1],
                    },
                ],
            },
        };

        const validationError = validateCleaningActionForPhase(action, initial, 'openai');

        expect(validationError).toContain('unpivot_columns requires');
    });

    it('accepts edit-phase operations when type and reason can be inferred safely', () => {
        const initial = {
            ...createCleaningRuntimeState(),
            phase: 'edit' as const,
        };
        const action: AiAction = {
            type: 'tool_call',
            thought: 'Apply deterministic cleanup.',
            toolName: 'data.mutate',
            args: {
                explanation: 'Remove header noise and promote the real header row.',
                operations: [
                    {
                        id: 'drop_rows_by_index',
                        indices: [0, 1, 3],
                    },
                    {
                        id: 'promote_header_row',
                        rowIndex: 0,
                    },
                    {
                        id: 'drop_blank_rows',
                    },
                ],
                outputColumns: [],
            },
        };

        const validationError = validateCleaningActionForPhase(action, initial, 'openai');

        expect(validationError).toBeNull();
    });

    it('accepts single-operation mutate payloads that normalize into a valid deterministic edit', () => {
        const initial = {
            ...createCleaningRuntimeState(),
            phase: 'edit' as const,
        };
        const action: AiAction = {
            type: 'tool_call',
            thought: 'Apply deterministic cleanup.',
            toolName: 'data.mutate',
            args: {
                explanation: 'Remove remaining blank rows.',
                operation: {
                    id: 'drop_blank_rows',
                },
                outputColumns: [],
            },
        };

        const validationError = validateCleaningActionForPhase(action, initial, 'openai');

        expect(validationError).toBeNull();
    });

    it('requires raw.csv to be inspected first for report-shaped datasets', () => {
        const testCase = createMultiHeaderProjectMatrixCase();
        const initial = {
            ...createCleaningRuntimeState(),
            phase: 'inspect' as const,
        };
        const action: AiAction = {
            type: 'tool_call',
            thought: 'Inspect the staged file.',
            toolName: 'workspace.read',
            args: {
                path: '/dataset/cleaned.csv',
            },
        };

        const validationError = validateCleaningActionForPhase(action, initial, 'openai', testCase.rawLike);

        expect(validationError).toContain('/dataset/raw.csv');
    });

    it('requires raw.csv first when IR signals repeated headers even if raw csv facade looks flat', () => {
        const initial = {
            ...createCleaningRuntimeState(),
            phase: 'inspect' as const,
        };
        const action: AiAction = {
            type: 'tool_call',
            thought: 'Inspect the staged file.',
            toolName: 'workspace.read',
            args: {
                path: '/dataset/cleaned.csv',
            },
        };
        const flatRawLike = {
            fileName: 'flat.csv',
            data: [{ QuotationNumber: 'TS1004', Customer: 'JEWEL' }],
            metadataRows: [],
            headerLayers: [],
            summaryRows: [],
            headerDepth: 1,
            summaryRowCount: 0,
        };
        const intakeIr = {
            fileName: 'flat.csv',
            columnCount: 2,
            rawRows: [
                ['Report Title'],
                ['Quotation Number', 'Customer'],
                ['Quotation Number', 'Customer'],
                ['TS1004', 'JEWEL'],
            ],
            normalizedRows: [
                ['Report Title', ''],
                ['Quotation Number', 'Customer'],
                ['Quotation Number', 'Customer'],
                ['TS1004', 'JEWEL'],
            ],
            detection: undefined,
            segments: [],
            provisionalTable: {
                headerRowIndex: 2,
                headerLayerRowIndexes: [],
                bodyStartIndex: 3,
                summaryStartIndex: 4,
                repeatedHeaderRowIndexes: [1],
                metadataRowIndexes: [0, 1],
                parameterRowIndexes: [],
            },
            diagnostics: {
                hasRepeatedHeader: true,
                hasParameterRowsBetweenHeaderAndBody: false,
                headerShapeDrift: false,
                singleColumnFallbackApplied: false,
                bodyEvidenceKind: 'unknown' as const,
                segmentCountsByKind: { repeated_header: 1 },
                headerCandidates: [],
                bodyStartCandidates: [],
                evidenceStrength: 'moderate' as const,
                fallbackReason: null,
            },
        };

        const validationError = validateCleaningActionForPhase(action, initial, 'openai', flatRawLike, intakeIr);

        expect(validationError).toContain('/dataset/raw.csv');
    });

    it('requires cleaned.csv inspection immediately after raw.csv for report-shaped datasets', () => {
        const testCase = createMultiHeaderProjectMatrixCase();
        const initial = {
            ...createCleaningRuntimeState(),
            phase: 'inspect' as const,
            inspectedRaw: true,
        };
        const action: AiAction = {
            type: 'tool_call',
            thought: 'Search the raw report.',
            toolName: 'workspace.search',
            args: {
                path: '/dataset/raw.csv',
                query: 'Revenue',
            },
        };

        const validationError = validateCleaningActionForPhase(action, initial, 'openai', testCase.rawLike);

        expect(validationError).toContain('/dataset/cleaned.csv');
    });

    it('rejects mixed-report header promotion outside the dominant block', () => {
        const testCase = createWeakSignalMixedReportCase();
        const initial = {
            ...createCleaningRuntimeState(),
            phase: 'edit' as const,
        };
        const action: AiAction = {
            type: 'tool_call',
            thought: 'Promote an early header row.',
            toolName: 'data.mutate',
            args: {
                explanation: 'Promote the first visible row.',
                operations: [
                    {
                        id: 'promote_header_row',
                        rowIndex: 0,
                    },
                    {
                        id: 'unpivot_columns',
                        sourceColumns: ['Q1', 'Q2', 'Q3', 'Q4'],
                        keyColumn: 'SeriesKey',
                        valueColumn: 'Value',
                        keepColumns: ['Department', 'Metric'],
                        sourceColumnNameColumn: 'SourceColumnName',
                        sourceRowIndexColumn: 'SourceRowIndex',
                    },
                ],
                outputColumns: [],
            },
        };

        const validationError = validateCleaningActionForPhase(action, initial, 'openai', testCase.rawLike);

        expect(validationError).toContain('dominant tabular block');
    });

    it('rejects wide-report unpivot actions that omit source coordinates', () => {
        const testCase = createMultiHeaderProjectMatrixCase();
        const initial = {
            ...createCleaningRuntimeState(),
            phase: 'edit' as const,
        };
        const action: AiAction = {
            type: 'tool_call',
            thought: 'Unpivot project columns.',
            toolName: 'data.mutate',
            args: {
                explanation: 'Reshape project series.',
                operations: [
                    {
                        id: 'promote_header_row',
                        rowIndex: 0,
                    },
                    {
                        id: 'unpivot_columns',
                        sourceColumns: testCase.expectedShape.detailSeriesColumns,
                        keyColumn: 'SeriesKey',
                        valueColumn: 'Value',
                        keepColumns: ['Code', 'Description'],
                        labelColumns: [{ outputColumn: 'SeriesLabelL1', mappings: [] }],
                    },
                ],
                outputColumns: [],
            },
        };

        const validationError = validateCleaningActionForPhase(action, initial, 'openai', testCase.rawLike);

        expect(validationError).toContain('sourceColumnNameColumn');
    });
});
