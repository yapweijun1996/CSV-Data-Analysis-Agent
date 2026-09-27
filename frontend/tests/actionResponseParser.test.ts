// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { parseAiActionResponse } from '../services/agent/orchestration/actionResponseParser';

describe('parseAiActionResponse', () => {
    it('parses a pretty-printed single JSON action object', () => {
        const response = `
        {
          "type": "assistant_message",
          "thought": "Summarize the result.",
          "message": "Done."
        }
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'assistant_message',
                thought: 'Summarize the result.',
                message: 'Done.',
            },
        ]);
        expect(parsed.partialParseError).toBeNull();
    });

    it('parses an actions wrapper object', () => {
        const response = `
        {
          "actions": [
            {
              "type": "tool_call",
              "thought": "Create the chart.",
              "toolName": "analysis.create_plan",
              "args": {
                "plan": {
                  "title": "Revenue by Region"
                }
              }
            }
          ]
        }
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toHaveLength(1);
        expect(parsed.actions[0]).toMatchObject({
            type: 'tool_call',
            toolName: 'analysis.create_plan',
        });
    });

    it('normalizes analysis.create_plan args when plan fields are provided without a nested plan wrapper', () => {
        const response = `
        {
          "type": "tool_call",
          "thought": "Create a cost by code chart.",
          "toolName": "analysis.create_plan",
          "args": {
            "chartType": "bar",
            "title": "Cost by Project Code",
            "description": "Compare cost totals by project code.",
            "groupByColumn": "Code",
            "valueColumn": "Value",
            "aggregation": "sum"
          }
        }
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'tool_call',
                thought: 'Create a cost by code chart.',
                toolName: 'analysis.create_plan',
                args: {
                    plan: {
                        chartType: 'bar',
                        title: 'Cost by Project Code',
                        description: 'Compare cost totals by project code.',
                        groupByColumn: 'Code',
                        valueColumn: 'Value',
                        aggregation: 'sum',
                    },
                },
            },
        ]);
    });

    it('normalizes SQL-first analysis.create_plan args when query fields are provided without a nested plan wrapper', () => {
        const response = `
        {
          "type": "tool_call",
          "thought": "Create a SQL-backed profitability chart.",
          "toolName": "analysis.create_plan",
          "args": {
            "chartType": "bar",
            "title": "Project Profitability",
            "description": "Compare project revenue and cost.",
            "queryMode": "aggregate",
            "bindings": {
              "groupByColumn": "SeriesLabelL1",
              "valueColumn": "total_revenue",
              "secondaryValueColumn": "total_cost"
            },
            "query": {
              "groupBy": ["SeriesLabelL1"],
              "aggregates": [
                {
                  "function": "sum",
                  "column": "Value",
                  "as": "total_revenue",
                  "where": {
                    "predicates": [{ "column": "Description", "operator": "in", "value": ["Revenue"] }]
                  }
                }
              ],
              "select": ["SeriesLabelL1", "total_revenue"]
            }
          }
        }
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'tool_call',
                thought: 'Create a SQL-backed profitability chart.',
                toolName: 'analysis.create_plan',
                args: {
                    plan: {
                        chartType: 'bar',
                        title: 'Project Profitability',
                        description: 'Compare project revenue and cost.',
                        queryMode: 'aggregate',
                        bindings: {
                            groupByColumn: 'SeriesLabelL1',
                            valueColumn: 'total_revenue',
                            secondaryValueColumn: 'total_cost',
                        },
                        query: {
                            groupBy: ['SeriesLabelL1'],
                            aggregates: [
                                {
                                    function: 'sum',
                                    column: 'Value',
                                    as: 'total_revenue',
                                    where: {
                                        predicates: [{ column: 'Description', operator: 'in', value: ['Revenue'] }],
                                    },
                                },
                            ],
                            select: ['SeriesLabelL1', 'total_revenue'],
                        },
                    },
                },
            },
        ]);
    });

    it('preserves loose visualization-only analysis.create_plan fields for later runtime adaptation', () => {
        const response = `
        {
          "type": "tool_call",
          "thought": "Visualize the current profitability result.",
          "toolName": "analysis.create_plan",
          "args": {
            "chart": "bar",
            "title": "Project Profitability: Revenue vs Cost",
            "description": "Compare total revenue and total cost by project.",
            "groupBy": "SeriesLabelL1",
            "values": ["total_revenue", "total_cost"],
            "metrics": ["total_revenue", "total_cost"],
            "columns": ["SeriesLabelL1", "total_revenue", "total_cost"]
          }
        }
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'tool_call',
                thought: 'Visualize the current profitability result.',
                toolName: 'analysis.create_plan',
                args: {
                    plan: {
                        chart: 'bar',
                        title: 'Project Profitability: Revenue vs Cost',
                        description: 'Compare total revenue and total cost by project.',
                        groupBy: 'SeriesLabelL1',
                        values: ['total_revenue', 'total_cost'],
                        metrics: ['total_revenue', 'total_cost'],
                        columns: ['SeriesLabelL1', 'total_revenue', 'total_cost'],
                    },
                },
            },
        ]);
    });

    it('preserves xAxis, yAxis, and valueColumns for direct analysis.create_plan payloads', () => {
        const response = `
        {
          "type": "tool_call",
          "thought": "Visualize profitability by project.",
          "toolName": "analysis.create_plan",
          "args": {
            "chartType": "bar",
            "title": "Project Profitability Analysis (Revenue vs Cost)",
            "description": "Comparison of Total Revenue vs Total Cost per project.",
            "xAxis": "SeriesLabelL1",
            "yAxis": ["total_revenue", "total_cost"],
            "valueColumns": ["total_revenue", "total_cost"]
          }
        }
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'tool_call',
                thought: 'Visualize profitability by project.',
                toolName: 'analysis.create_plan',
                args: {
                    plan: {
                        chartType: 'bar',
                        title: 'Project Profitability Analysis (Revenue vs Cost)',
                        description: 'Comparison of Total Revenue vs Total Cost per project.',
                        xAxis: 'SeriesLabelL1',
                        yAxis: ['total_revenue', 'total_cost'],
                        valueColumns: ['total_revenue', 'total_cost'],
                    },
                },
            },
        ]);
    });

    it('keeps valid actions and reports trailing incomplete JSON', () => {
        const response = `{"type":"assistant_message","thought":"Reply","message":"ok"}\n{"type":"tool_call"`;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toHaveLength(1);
        expect(parsed.partialParseError?.message).toContain('Ignored trailing incomplete JSON chunk');
    });

    it('normalizes legacy execute_data_query responses into data.query tool args', () => {
        const response = `
        {
          "thought": "Inspect the highest revenue regions.",
          "responseType": "execute_data_query",
          "queryPlan": {
            "explanation": "Return grouped revenue totals by region.",
            "plan": {
              "groupBy": ["Region"],
              "aggregates": [{ "function": "sum", "column": "Revenue", "as": "TotalRevenue" }],
              "select": ["Region", "TotalRevenue"],
              "limit": 5
            }
          }
        }
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'tool_call',
                thought: 'Inspect the highest revenue regions.',
                toolName: 'data.query',
                args: {
                    explanation: 'Return grouped revenue totals by region.',
                    plan: {
                        groupBy: ['Region'],
                        aggregates: [{ function: 'sum', column: 'Revenue', as: 'TotalRevenue' }],
                        select: ['Region', 'TotalRevenue'],
                        limit: 5,
                    },
                },
            },
        ]);
    });

    it('normalizes direct tool_call envelopes for data.query actions', () => {
        const response = `
        {
          "type": "tool_call",
          "thought": "Inspect the highest revenue regions.",
          "toolName": "data.query",
          "args": {
            "plan": {
              "groupBy": ["Region"],
              "aggregates": [{ "function": "sum", "column": "Revenue", "as": "TotalRevenue" }],
              "select": ["Region", "TotalRevenue"],
              "limit": 5
            }
          }
        }
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'tool_call',
                thought: 'Inspect the highest revenue regions.',
                toolName: 'data.query',
                args: {
                    explanation: 'Inspect the highest revenue regions.',
                    plan: {
                        groupBy: ['Region'],
                        aggregates: [{ function: 'sum', column: 'Revenue', as: 'TotalRevenue' }],
                        select: ['Region', 'TotalRevenue'],
                        limit: 5,
                    },
                },
            },
        ]);
    });

    it('normalizes uppercase DESC orderBy directions inside data.query plans', () => {
        const response = `
        {
          "type": "tool_call",
          "thought": "Inspect the highest revenue regions.",
          "toolName": "data.query",
          "args": {
            "plan": {
              "select": ["Region", "TotalRevenue"],
              "orderBy": [{ "column": "TotalRevenue", "direction": "DESC" }],
              "limit": 5
            }
          }
        }
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'tool_call',
                thought: 'Inspect the highest revenue regions.',
                toolName: 'data.query',
                args: {
                    explanation: 'Inspect the highest revenue regions.',
                    plan: {
                        select: ['Region', 'TotalRevenue'],
                        orderBy: [{ column: 'TotalRevenue', direction: 'desc' }],
                        limit: 5,
                    },
                },
            },
        ]);
    });

    it('normalizes aggregate function casing and trims query payload strings', () => {
        const response = `
        {
          "type": "tool_call",
          "thought": "Summarize revenue by region.",
          "toolName": "data.query",
          "args": {
            "plan": {
              "groupBy": [" Region "],
              "aggregates": [{ "function": "SUM", "column": " Revenue ", "as": " TotalRevenue " }],
              "select": [" Region ", " TotalRevenue "]
            }
          }
        }
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'tool_call',
                thought: 'Summarize revenue by region.',
                toolName: 'data.query',
                args: {
                    explanation: 'Summarize revenue by region.',
                    plan: {
                        groupBy: ['Region'],
                        aggregates: [{ function: 'sum', column: 'Revenue', as: 'TotalRevenue' }],
                        select: ['Region', 'TotalRevenue'],
                    },
                },
            },
        ]);
    });

    it('drops empty optional query clauses emitted by structured providers', () => {
        const response = `
        {
          "type": "tool_call",
          "thought": "Inspect the missing rows.",
          "toolName": "data.query",
          "args": {
            "plan": {
              "select": ["Town", "Flat Type", "Storey Range"],
              "where": {
                "predicates": [
                  { "column": "Storey Range", "operator": "is_null" }
                ]
              },
              "groupBy": [],
              "aggregates": [],
              "orderBy": [],
              "postAggregateFilter": {}
            }
          }
        }
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions[0]).toMatchObject({
            type: 'tool_call',
            toolName: 'data.query',
            args: {
                plan: {
                    select: ['Town', 'Flat Type', 'Storey Range'],
                    where: {
                        predicates: [
                            { column: 'Storey Range', operator: 'is_null' },
                        ],
                    },
                },
            },
        });
        expect((parsed.actions[0] as Extract<(typeof parsed.actions)[number], { type: 'tool_call' }>).args.plan)
            .not.toHaveProperty('groupBy');
        expect((parsed.actions[0] as Extract<(typeof parsed.actions)[number], { type: 'tool_call' }>).args.plan)
            .not.toHaveProperty('aggregates');
        expect((parsed.actions[0] as Extract<(typeof parsed.actions)[number], { type: 'tool_call' }>).args.plan)
            .not.toHaveProperty('orderBy');
        expect((parsed.actions[0] as Extract<(typeof parsed.actions)[number], { type: 'tool_call' }>).args.plan)
            .not.toHaveProperty('postAggregateFilter');
    });

    it('normalizes direct top-level tool_call object without nested args for data.query', () => {
        const response = `
        {
          "type": "tool_call",
          "thought": "I want to inspect cost rows.",
          "toolName": "data.query",
          "query": "cost"
        }
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'tool_call',
                thought: 'I want to inspect cost rows.',
                toolName: 'data.query',
                args: {
                    query: 'cost',
                    explanation: 'I want to inspect cost rows.',
                },
            },
        ]);
    });

    it('keeps missing data.query plan absent so validator can reject it later', () => {
        const response = `
        {
          "type": "tool_call",
          "thought": "I want see cost.",
          "toolName": "data.query",
          "args": {
            "query": "cost"
          }
        }
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'tool_call',
                thought: 'I want see cost.',
                toolName: 'data.query',
                args: {
                    query: 'cost',
                    explanation: 'I want see cost.',
                },
            },
        ]);
    });

    it('backfills a missing tool-call thought from normalized args', () => {
        const response = `
        {
          "type": "tool_call",
          "toolName": "data.query",
          "args": {
            "explanation": "Inspect cost rows.",
            "plan": {
              "select": ["Description", "Amount"],
              "limit": 10
            }
          }
        }
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'tool_call',
                thought: 'Inspect cost rows.',
                toolName: 'data.query',
                args: {
                    explanation: 'Inspect cost rows.',
                    plan: {
                        select: ['Description', 'Amount'],
                        limit: 10,
                    },
                },
            },
        ]);
    });

    it('preserves legacy execute_data_query responses that only contain free-text query strings', () => {
        const response = `
        {
          "thought": "Find rows related to cost.",
          "responseType": "execute_data_query",
          "query": "cost"
        }
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'tool_call',
                thought: 'Find rows related to cost.',
                toolName: 'data.query',
                args: {
                    query: 'cost',
                    explanation: 'Find rows related to cost.',
                },
            },
        ]);
    });

    it('does not synthesize an empty nested plan from legacy queryPlan wrappers', () => {
        const response = `
        {
          "thought": "Inspect the matching rows.",
          "responseType": "execute_data_query",
          "queryPlan": {
            "explanation": "Inspect the matching rows.",
            "plan": {}
          }
        }
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'tool_call',
                thought: 'Inspect the matching rows.',
                toolName: 'data.query',
                args: {
                    explanation: 'Inspect the matching rows.',
                },
            },
        ]);
    });

    it('normalizes legacy clarification_request responses that use args instead of clarification', () => {
        const response = `
        {
          "thought": "The request is ambiguous.",
          "responseType": "clarification_request",
          "args": {
            "question": "Which column should I inspect?",
            "options": [
              { "label": "Address", "value": "Address" }
            ]
          }
        }
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toMatchObject([
            {
                type: 'tool_call',
                thought: 'The request is ambiguous.',
                toolName: 'conversation.request_clarification',
                args: {
                    question: 'Which column should I inspect?',
                    options: [{ label: 'Address', value: 'Address' }],
                    clarificationMode: 'options',
                    allowFreeText: false,
                },
            },
        ]);
    });

    it('falls back to free-text clarification when a clarification question is present without options', () => {
        const response = `
        {
          "thought": "The request is still ambiguous.",
          "responseType": "clarification_request",
          "args": {
            "question": "Which combination of dimensions should define a unique record?"
          }
        }
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'tool_call',
                thought: 'The request is still ambiguous.',
                toolName: 'conversation.request_clarification',
                args: {
                    question: 'Which combination of dimensions should define a unique record?',
                    options: [],
                    allowFreeText: true,
                    clarificationMode: 'free_text',
                },
            },
        ]);
    });

    it('salvages clarification requests that put the question in top-level message and send malformed options', () => {
        const response = `
        {
          "thought": "I need the user to define what counts as a duplicate.",
          "responseType": "clarification_request",
          "message": "Which combination of dimensions should define a unique record?",
          "args": {
            "options": [
              { "label": "", "value": "" }
            ]
          }
        }
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'tool_call',
                thought: 'I need the user to define what counts as a duplicate.',
                toolName: 'conversation.request_clarification',
                args: {
                    question: 'Which combination of dimensions should define a unique record?',
                    options: [],
                    allowFreeText: true,
                    clarificationMode: 'free_text',
                },
            },
        ]);
    });

    it('salvages tool_call clarification payloads that put the question outside args and send malformed options', () => {
        const response = `
        {
          "type": "tool_call",
          "thought": "I need the user to define what counts as a duplicate.",
          "toolName": "conversation.request_clarification",
          "message": "Which combination of dimensions should define a unique record?",
          "args": {
            "options": [
              { "label": "", "value": "" }
            ]
          }
        }
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'tool_call',
                thought: 'I need the user to define what counts as a duplicate.',
                toolName: 'conversation.request_clarification',
                args: {
                    question: 'Which combination of dimensions should define a unique record?',
                    options: [],
                    allowFreeText: true,
                    clarificationMode: 'free_text',
                },
            },
        ]);
    });

    it('normalizes nested data.mutate payloads into the required explanation and operations array', () => {
        const response = `
        {
          "type": "tool_call",
          "thought": "Remove the revenue rows permanently.",
          "toolName": "data.mutate",
          "args": {
            "dataOperations": {
              "explanation": "Remove Code 501001 from the cleaned dataset.",
              "operation": {
                "id": "drop-revenue",
                "type": "drop_rows_by_condition",
                "reason": "Delete the requested code rows.",
                "predicates": [{ "column": "Code", "operator": "eq", "value": "501001" }]
              },
              "outputColumns": []
            }
          }
        }
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'tool_call',
                thought: 'Remove the revenue rows permanently.',
                toolName: 'data.mutate',
                args: {
                    explanation: 'Remove Code 501001 from the cleaned dataset.',
                    operations: [
                        {
                            id: 'drop-revenue',
                            type: 'drop_rows_by_condition',
                            reason: 'Delete the requested code rows.',
                            predicates: [{ column: 'Code', operator: 'eq', value: '501001' }],
                        },
                    ],
                    outputColumns: [],
                },
            },
        ]);
    });

    it('drops malformed tool calls that omit toolName', () => {
        const response = `
        {
          "actions": [
            {
              "type": "tool_call",
              "thought": "Try to edit the file.",
              "args": {
                "path": "/dataset/cleaned.csv"
              }
            },
            {
              "type": "assistant_message",
              "thought": "Fallback to a valid summary.",
              "message": "Done."
            }
          ]
        }
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'assistant_message',
                thought: 'Fallback to a valid summary.',
                message: 'Done.',
            },
        ]);
    });

    it('drops unknown objects instead of coercing them into actions', () => {
        const response = `
        {
          "actions": [
            {
              "action": "workspace.write",
              "path": "/dataset/cleaned.csv"
            },
            {
              "type": "assistant_message",
              "thought": "Only the valid action should remain.",
              "message": "Done."
            }
          ]
        }
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'assistant_message',
                thought: 'Only the valid action should remain.',
                message: 'Done.',
            },
        ]);
    });

    it('normalizes tool_call envelope objects into tool_call actions', () => {
        const response = `
        [
          {
            "thought": "Inspect raw rows first.",
            "tool_call": {
              "name": "workspace.read",
              "arguments": {
                "path": "/dataset/raw.csv"
              }
            }
          }
        ]
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'tool_call',
                thought: 'Inspect raw rows first.',
                toolName: 'workspace.read',
                args: {
                    path: '/dataset/raw.csv',
                },
            },
        ]);
    });

    it('uses top-level fields as args when tool_call is a bare tool name', () => {
        const response = `
        [
          {
            "thought": "Read the cleaned dataset preview.",
            "tool_call": "workspace.read",
            "path": "/dataset/cleaned.csv",
            "limit": 10
          }
        ]
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'tool_call',
                thought: 'Read the cleaned dataset preview.',
                toolName: 'workspace.read',
                args: {
                    path: '/dataset/cleaned.csv',
                    limit: 10,
                },
            },
        ]);
    });

    it('infers workspace.read when tool_call object omits the tool name but includes a path', () => {
        const response = `
        [
          {
            "thought": "Read the cleaned dataset preview.",
            "tool_call": {
              "path": "/dataset/cleaned.csv",
              "limit": 10
            }
          }
        ]
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'tool_call',
                thought: 'Read the cleaned dataset preview.',
                toolName: 'workspace.read',
                args: {
                    path: '/dataset/cleaned.csv',
                    limit: 10,
                },
            },
        ]);
    });

    it('normalizes objects that use the tool name as the property key', () => {
        const response = `
        [
          {
            "thought": "Read the cleaned dataset preview.",
            "workspace.read": {
              "path": "/dataset/cleaned.csv",
              "limit": 100
            }
          }
        ]
        `;

        const parsed = parseAiActionResponse(response);

        expect(parsed.actions).toEqual([
            {
                type: 'tool_call',
                thought: 'Read the cleaned dataset preview.',
                toolName: 'workspace.read',
                args: {
                    path: '/dataset/cleaned.csv',
                    limit: 100,
                },
            },
        ]);
    });
});
