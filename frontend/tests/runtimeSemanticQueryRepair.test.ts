// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { attemptSemanticQueryRepair } from '../services/agent/runtime/runtimeSemanticQueryRepair';
import type { AgentTurn, AiAction } from '../types';

const buildPreviousQueryAction = (): AiAction => ({
    type: 'tool_call',
    thought: 'Search for matching descriptions.',
    toolName: 'data.query',
    args: {
        explanation: 'Find matching descriptions.',
        plan: {
            select: ['Description', 'Amount'],
            where: {
                predicates: [
                    { column: 'Description', operator: 'contains', value: 'Contingency' },
                    { column: 'Description', operator: 'contains', value: 'RC Structure' },
                ],
            },
            limit: 25,
        },
    },
});

const buildTurn = (observationOverrides?: Partial<NonNullable<AgentTurn['steps'][number]['observation']>>): AgentTurn => ({
    turnId: 'turn-1',
    userMessage: 'find contingency or RC structure rows',
    startedAt: new Date('2026-03-13T00:00:00.000Z'),
    completedAt: null,
    status: 'running',
    finalMessage: null,
    waitingForClarification: null,
    budgetStatus: {
        exhausted: false,
        maxSteps: 5,
        remainingSteps: 5,
        stepsUsed: 0,
        retryCounts: {},
    },
    steps: [{
        stepId: 'step-1',
        startedAt: new Date('2026-03-13T00:00:00.000Z'),
        completedAt: new Date('2026-03-13T00:00:01.000Z'),
        action: buildPreviousQueryAction(),
        result: null,
        observation: {
            type: 'runtime_error',
            status: 'blocked',
            summary: 'The previous query used AND logic, but these alternative description matches must be represented as OR groups.',
            toolName: 'data.query',
            code: 'semantic_miss',
            retryHint: 'Repair the data.query payload by moving each alternative into its own plan.where.groups entry.',
            detail: {
                repairHintCategory: 'or_groups_required',
            },
            ...observationOverrides,
        },
    }],
}) as unknown as AgentTurn;

describe('attemptSemanticQueryRepair', () => {
    it('rewrites same-column top-level predicates into OR groups after an or_groups_required hint', () => {
        const action: AiAction = {
            type: 'tool_call',
            thought: 'Retry the same query.',
            toolName: 'data.query',
            args: {
                explanation: 'Retry with the same alternatives.',
                plan: {
                    select: ['Description', 'Amount'],
                    where: {
                        predicates: [
                            { column: 'Description', operator: 'contains', value: 'Contingency' },
                            { column: 'Description', operator: 'contains', value: 'RC Structure' },
                        ],
                    },
                    limit: 25,
                },
            },
        };

        const result = attemptSemanticQueryRepair(buildTurn(), action);

        expect(result.status).toBe('applied');
        if (result.status !== 'applied' || result.action.type !== 'tool_call') {
            throw new Error('Expected auto repair to apply');
        }
        expect(result.action.args.plan.where).toEqual({
            groups: [
                { predicates: [{ column: 'Description', operator: 'contains', value: 'Contingency' }] },
                { predicates: [{ column: 'Description', operator: 'contains', value: 'RC Structure' }] },
            ],
        });
        expect(result.beforeWhereShape).toMatchObject({
            predicateCount: 2,
            groupCount: 0,
        });
        expect(result.afterWhereShape).toMatchObject({
            predicateCount: 0,
            groupCount: 2,
        });
    });

    it('does not repair mixed-column predicates', () => {
        const action: AiAction = {
            type: 'tool_call',
            thought: 'Retry with multiple columns.',
            toolName: 'data.query',
            args: {
                explanation: 'Retry with multiple columns.',
                plan: {
                    select: ['Description', 'Address', 'Amount'],
                    where: {
                        predicates: [
                            { column: 'Description', operator: 'contains', value: 'Contingency' },
                            { column: 'Address', operator: 'contains', value: 'TUAS' },
                        ],
                    },
                    limit: 25,
                },
            },
        };

        const result = attemptSemanticQueryRepair(buildTurn(), action);

        expect(result.status).toBe('ineligible');
    });

    it('does not repair mixed-operator predicates', () => {
        const action: AiAction = {
            type: 'tool_call',
            thought: 'Retry with mixed operators.',
            toolName: 'data.query',
            args: {
                explanation: 'Retry with mixed operators.',
                plan: {
                    select: ['Description', 'Amount'],
                    where: {
                        predicates: [
                            { column: 'Description', operator: 'contains', value: 'Contingency' },
                            { column: 'Description', operator: 'eq', value: 'RC Structure' },
                        ],
                    },
                    limit: 25,
                },
            },
        };

        const result = attemptSemanticQueryRepair(buildTurn(), action);

        expect(result.status).toBe('ineligible');
    });

    it('does not repair queries that already use groups', () => {
        const action: AiAction = {
            type: 'tool_call',
            thought: 'Retry with groups already applied.',
            toolName: 'data.query',
            args: {
                explanation: 'Retry using groups.',
                plan: {
                    select: ['Description', 'Amount'],
                    where: {
                        groups: [
                            { predicates: [{ column: 'Description', operator: 'contains', value: 'Contingency' }] },
                            { predicates: [{ column: 'Description', operator: 'contains', value: 'RC Structure' }] },
                        ],
                    },
                    limit: 25,
                },
            },
        };

        const result = attemptSemanticQueryRepair(buildTurn(), action);

        expect(result.status).toBe('not_applicable');
    });

    it('does not repair when the previous observation was not an or_groups_required hint', () => {
        const action: AiAction = {
            type: 'tool_call',
            thought: 'Retry the same query.',
            toolName: 'data.query',
            args: {
                explanation: 'Retry with the same alternatives.',
                plan: {
                    select: ['Description', 'Amount'],
                    where: {
                        predicates: [
                            { column: 'Description', operator: 'contains', value: 'Contingency' },
                            { column: 'Description', operator: 'contains', value: 'RC Structure' },
                        ],
                    },
                    limit: 25,
                },
            },
        };

        const result = attemptSemanticQueryRepair(
            buildTurn({
                detail: {
                    repairHintCategory: 'missing_filter_column',
                },
                retryHint: 'Use only real source dataset columns inside plan.where.',
            }),
            action,
        );

        expect(result.status).toBe('not_applicable');
    });

    it('removes missing structural metadata columns from retried data.query plans', () => {
        const action: AiAction = {
            type: 'tool_call',
            thought: 'Retry without changing the query.',
            toolName: 'data.query',
            args: {
                explanation: 'Retry grouped revenue query.',
                plan: {
                    select: ['STAFF NAME', 'TOTAL', 'RowRole'],
                    groupBy: ['STAFF NAME', 'RowRole'],
                    where: {
                        predicates: [
                            { column: 'RowRole', operator: 'eq', value: 'detail' },
                            { column: 'STAFF NAME', operator: 'not_null' },
                        ],
                    },
                    aggregates: [
                        { function: 'sum', column: 'TOTAL', as: 'total_sales' },
                    ],
                    orderBy: [{ column: 'RowRole', direction: 'asc' }],
                    limit: 10,
                },
            },
        };

        const result = attemptSemanticQueryRepair(
            buildTurn({
                summary: 'Operation "query_where_bridge" references missing columns: RowRole',
                retryHint: 'Remove the missing structural metadata column from plan.where and groupBy before retrying.',
                detail: {
                    repairHintCategory: 'structural_metadata_leak',
                    repairHintCategories: ['structural_metadata_leak', 'bridge_missing_column'],
                },
            }),
            action,
        );

        expect(result.status).toBe('applied');
        if (result.status !== 'applied' || result.action.type !== 'tool_call') {
            throw new Error('Expected structural metadata auto repair to apply');
        }

        expect(result.action.args.plan.where).toEqual({
            predicates: [{ column: 'STAFF NAME', operator: 'not_null' }],
        });
        expect(result.action.args.plan.groupBy).toEqual(['STAFF NAME']);
        expect(result.action.args.plan.select).toEqual(['STAFF NAME', 'TOTAL']);
        expect(result.action.args.plan.orderBy).toBeUndefined();
        expect(result.reason).toContain('RowRole');
    });

    it('strips sibling structural metadata columns after a bridge failure even when only one was named', () => {
        const action: AiAction = {
            type: 'tool_call',
            thought: 'Retry with a similar structural filter.',
            toolName: 'data.query',
            args: {
                explanation: 'Retry grouped revenue query.',
                plan: {
                    select: ['STAFF NAME', 'ResolvedRowRole', 'TOTAL'],
                    groupBy: ['STAFF NAME', 'ResolvedRowRole'],
                    where: {
                        predicates: [
                            { column: 'ResolvedRowRole', operator: 'eq', value: 'detail' },
                            { column: 'STAFF NAME', operator: 'not_null' },
                        ],
                    },
                    aggregates: [
                        {
                            function: 'sum',
                            column: 'TOTAL',
                            as: 'total_sales',
                            where: {
                                predicates: [{ column: 'ResolvedRowRole', operator: 'eq', value: 'detail' }],
                            },
                        },
                    ],
                    orderBy: [{ column: 'ResolvedRowRole', direction: 'asc' }],
                    limit: 10,
                },
            },
        };

        const result = attemptSemanticQueryRepair(
            buildTurn({
                summary: 'Operation "query_where_bridge" references missing columns: RowRole',
                retryHint: 'Remove the missing structural metadata column from plan.where and groupBy before retrying.',
                detail: {
                    repairHintCategory: 'structural_metadata_leak',
                    repairHintCategories: ['structural_metadata_leak', 'bridge_missing_column'],
                },
            }),
            action,
        );

        expect(result.status).toBe('applied');
        if (result.status !== 'applied' || result.action.type !== 'tool_call') {
            throw new Error('Expected structural metadata family auto repair to apply');
        }

        expect(result.action.args.plan.where).toEqual({
            predicates: [{ column: 'STAFF NAME', operator: 'not_null' }],
        });
        expect(result.action.args.plan.groupBy).toEqual(['STAFF NAME']);
        expect(result.action.args.plan.select).toEqual(['STAFF NAME', 'TOTAL']);
        expect(result.action.args.plan.aggregates).toEqual([
            { function: 'sum', column: 'TOTAL', as: 'total_sales' },
        ]);
        expect(result.action.args.plan.orderBy).toBeUndefined();
    });
});
