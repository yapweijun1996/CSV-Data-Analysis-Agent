// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createAnalysisToolManifests } from '../services/agent/tools/manifests/analysisToolManifests';
import { createDataToolManifests } from '../services/agent/tools/manifests/dataToolManifests';
import { createChatPrompt } from '../services/prompts/chatPrompts';

describe('chat prompt query routing rules', () => {
    it('teaches single-step runtime decisions plus lookup and preview honesty rules in the chat prompt', () => {
        const prompt = createChatPrompt(
            'tell me all 36 TUAS ROAD',
            'Managed context.',
            'English',
            [
                ...createDataToolManifests(),
                ...createAnalysisToolManifests(['Description', 'Address', 'Amount']),
            ],
        );

        expect(prompt).toContain('You MUST respond with one JSON object only');
        expect(prompt).toContain('`{ "action": { ... } }`');
        expect(prompt).toContain('Choose exactly one next move per response.');
        expect(prompt).toContain('For free-text row lookup, fuzzy keyword search, or cross-column text search, prefer spreadsheet.filter.');
        expect(prompt).toContain('Do not use for raw dataset cleanliness, null-rate, duplicate, useless-column, or schema-quality review requests.');
        expect(prompt).toContain('Use `assistant_message` only when the current request is already satisfied by existing evidence or by a completed workflow step.');
        expect(prompt).toContain('If the user asks for all/every/list each and the latest query returned 25 or fewer untruncated rows, enumerate every returned row and value.');
        expect(prompt).toContain('include 1-3 concrete `suggestedActions` whenever there is a clear next analytical move');
        expect(prompt).toContain('Never emit internal tool names such as `analysis.validate_metric_mapping`');
        expect(prompt).toContain('Do not send a naked natural-language string to `data.query`');
        expect(prompt).toContain('Treat the `Dataset Semantics` section as authoritative for non-detail rows and semantic column roles');
        expect(prompt).toContain('For verification, counting, sorting, filtering, or grouped read-only results, prefer `data.query` over `analysis.create_plan`');
        expect(prompt).toContain('first make the grouped evidence legible');
        expect(prompt).toContain('Do not treat chart creation as the default end state');
        expect(prompt).toContain('Keep each entity label and all of its metrics in the same Markdown bullet');
        expect(prompt).toContain('For more than five comparable rows, prefer one compact Markdown table');
        expect(prompt).toContain('Never emit a bullet or numbered item that contains only a bold label or heading');
        expect(prompt).toContain('Do not add `$`, `SGD`, `%`, or any other unit');
        expect(prompt).toContain('Use `analysis.create_plan` only when the user wants a new visualization or dashboard card and the grouped evidence is already stable enough to justify the chart design');
        expect(prompt).toContain('`analysis.create_plan` must return an executable payload');
        expect(prompt).toContain('prefer one more bounded `data.query`');
        expect(prompt).toContain('prefer `analysis.create_plan` with `query + bindings` that reuse that query result');
        expect(prompt).toContain('Do not return visualization-only placeholders such as `xAxis`, `yAxis`, `metrics`, `values`, `columns`, or `valueColumns`');
        expect(prompt).toContain('SQL-first `analysis.create_plan` example');
        expect(prompt).toContain('bindings: { groupByColumn: "SeriesLabelL1", valueColumn: "total_revenue", secondaryValueColumn: "total_cost" }');
        expect(prompt).toContain('If the user asks for profit, margin, or variance, derive the metric deterministically before charting it');
        expect(prompt).toContain('prefer `analysis.validate_metric_mapping` before `data.mutate` or `analysis.create_plan`');
        expect(prompt).toContain('prefer `data.mutate` with `derive_metric_by_label` before `analysis.create_plan`');
        expect(prompt).toContain('Aggregate `data.query` example');
        expect(prompt).toContain('Conditional aggregate `data.query` example');
        expect(prompt).toContain('Label/value derived metric example');
        expect(prompt).toContain('OR `data.query` example');
        expect(prompt).toContain('top-level `predicates` are combined with AND, while `groups` are combined with OR');
        expect(prompt).toContain('If the user explicitly asks for OR / either-term matching');
        expect(prompt).toContain('Use `plan.aggregates[].where` when each aggregate needs its own label/value filter');
        expect(prompt).toContain('Use only real source dataset columns inside `plan.where`');
        expect(prompt).toContain('`data.query` does not support a HAVING clause');
        expect(prompt).toContain('never alias a plain SUM/AVG of one source amount as the ratio');
        expect(prompt).toContain('`card.add_calculated_column` only supports row-level expressions');
        expect(prompt).toContain('tell me all Total Operating Expenses');
        expect(prompt).toContain('If the latest visible query is only a preview without filters or aggregates');
        expect(prompt).toContain('Do not overclaim that matching records were found');
        expect(prompt).toContain('choose the best immediate next action only');
    });

    it('adds data.query prompt hints that discourage free-text payloads', () => {
        const prompt = createChatPrompt(
            'profit by project code',
            'Managed context.',
            'English',
            [
                ...createDataToolManifests(),
                ...createAnalysisToolManifests(['Description', 'Address', 'Amount']),
            ],
        );
        const manifest = createDataToolManifests().find(tool => tool.name === 'data.query');
        const reviewManifest = createAnalysisToolManifests(['Description', 'Address', 'Amount']).find(tool => tool.name === 'card.review');

        expect(manifest?.promptHints).toContain(
            'Only use data.query when you can express a structured plan with select, where, orderBy, limit, groupBy, or aggregates.',
        );
        expect(manifest?.promptHints).toContain('Do not pass a naked free-text search string to data.query.');
        expect(manifest?.promptHints).toContain(
            "Row-level example: args.plan = { select: ['Description', 'Address', 'Amount'], where: { predicates: [{ column: 'Address', operator: 'contains', value: '36 TUAS ROAD' }] }, limit: 25 }.",
        );
        expect(manifest?.promptHints).toContain(
            "OR example: args.plan = { select: ['Description', 'Amount'], where: { groups: [{ predicates: [{ column: 'Description', operator: 'contains', value: 'revenue' }] }, { predicates: [{ column: 'Description', operator: 'contains', value: 'cost' }] }] }, limit: 25 }.",
        );
        expect(manifest?.promptHints).toContain(
            "Aggregate example: args.plan = { groupBy: ['Project'], aggregates: [{ function: 'sum', column: 'Amount', as: 'total_amount' }], select: ['Project', 'total_amount'], orderBy: [{ column: 'total_amount', direction: 'desc' }], limit: 10 }.",
        );
        expect(manifest?.promptHints).toContain(
            "Conditional aggregate example: args.plan = { groupBy: ['Project'], aggregates: [{ function: 'sum', column: 'Value', as: 'total_revenue', where: { predicates: [{ column: 'Description', operator: 'in', value: ['Revenue', 'Net Sales / Revenue'] }] } }, { function: 'sum', column: 'Value', as: 'total_cost', where: { predicates: [{ column: 'Description', operator: 'in', value: ['Cost of Sales', 'Project Costs of Sales'] }] } }], select: ['Project', 'total_revenue', 'total_cost'], orderBy: [{ column: 'total_revenue', direction: 'desc' }], limit: 10 }.",
        );
        expect(manifest?.promptHints).toContain(
            'Within plan.where, top-level predicates are combined with AND. Use plan.where.groups when the user explicitly wants OR / either-term matching.',
        );
        expect(manifest?.promptHints).toContain(
            'When using groupBy, always include aggregates. When using orderBy, include the sorted column in select.',
        );
        expect(manifest?.promptHints).toContain(
            'Use plan.aggregates[].where when each aggregate must summarize a different subset of source rows. Do not push those label-specific conditions into one shared plan.where clause.',
        );
        expect(manifest?.promptHints).toContain(
            'plan.where may reference only real source dataset columns. Do not filter on aggregate aliases such as total_amount or record_count.',
        );
        expect(manifest?.promptHints).toContain(
            'data.query does not support HAVING. If you need duplicate counts or grouped thresholds, return the grouped rows with an aggregate alias, sort them, and let assistant_message explain the result.',
        );
        expect(manifest?.promptHints).toContain(
            'For free-text row lookup, fuzzy keyword search, or cross-column text search, prefer spreadsheet.filter.',
        );
        expect(manifest?.promptHints).toContain(
            'Requests like "tell me all Total Operating Expenses" should use spreadsheet.filter or a data.query plan with an explicit where clause, not a preview-only select+limit query.',
        );
        const mutateManifest = createDataToolManifests().find(tool => tool.name === 'data.mutate');
        expect(mutateManifest?.promptHints).toContain(
            'For numeric-looking strings such as 10,000.00, $1,234.56, or 50%, use deterministic operations like replace_values and cast_column instead of inventing code or unsupported operation types.',
        );
        expect(mutateManifest?.promptHints).toContain(
            'Do not invent generic operation types such as mutate. Every operation must use a supported deterministic type from the catalog.',
        );
        expect(reviewManifest?.promptHints).toContain(
            'Do not use for raw dataset cleanliness, null-rate, duplicate, useless-column, or schema-quality review requests.',
        );
        const calculatedColumnManifest = createAnalysisToolManifests(['Description', 'Address', 'Amount']).find(tool => tool.name === 'card.add_calculated_column');
        expect(calculatedColumnManifest?.promptHints).toContain(
            "Only use row-level formulas such as 'Revenue' - 'Cost' or ('Revenue' - 'Cost') / 'Revenue'.",
        );
        expect(calculatedColumnManifest?.promptHints).toContain(
            'Use this only when the source metrics already exist as columns on the visible card. Do not use it to combine different row labels from a label/value table.',
        );
        expect(calculatedColumnManifest?.promptHints).toContain(
            'Do not use SQL, SELECT statements, subqueries, or SUM/COUNT/AVG expressions in card.add_calculated_column.',
        );
        const createPlanManifest = createAnalysisToolManifests(['Description', 'Address', 'Amount']).find(tool => tool.name === 'analysis.create_plan');
        expect(createPlanManifest?.promptHints).toContain(
            'If the user asks for profit, margin, or variance and that derived metric is not already present, derive it first with data.mutate or card.add_calculated_column instead of inventing arithmetic inside analysis.create_plan.',
        );
        expect(createPlanManifest?.promptHints).toContain(
            'Return an executable plan, not a visualization-only sketch. Use either a SQL-first plan with queryMode, query, and bindings, or a classic plan with groupByColumn/valueColumn bindings.',
        );
        expect(createPlanManifest?.promptHints).toContain(
            'If you are visualizing aliases already produced by data.query, prefer a SQL-first plan that reuses that query output instead of rebuilding a raw-row count chart.',
        );
        expect(createPlanManifest?.promptHints).toContain(
            'Do not substitute visualization-only aliases such as xAxis, yAxis, metrics, values, columns, or valueColumns for executable bindings.',
        );
        expect((createPlanManifest?.inputSchema as { properties?: { plan?: { oneOf?: unknown[] } } })?.properties?.plan?.oneOf).toHaveLength(2);
        expect(prompt).toContain('Do not invent generic operation types such as `mutate`');
        expect(prompt).toContain('prefer a deterministic `data.mutate` repair using `replace_values` and/or `cast_column`');
    });

    it('does not coach mutation workflows when data.mutate is unavailable', () => {
        const prompt = createChatPrompt(
            '查看各项目收入明细',
            'Managed context.',
            'English',
            createDataToolManifests().filter(tool => tool.name !== 'data.mutate'),
        );

        expect(prompt).toContain('If `data.mutate` is not available in Available Tools');
        expect(prompt).not.toContain('For permanent dataset fixes, `data.mutate` must use supported deterministic operations');
        expect(prompt).not.toContain('Label/value derived metric example');
    });
});
