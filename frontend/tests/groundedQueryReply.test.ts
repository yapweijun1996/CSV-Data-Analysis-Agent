import { describe, expect, it } from 'vitest';
import {
    buildGroundedCompleteQueryReply,
    buildGroundedDerivedCostPerResultReply,
    buildGroundedDerivedMarginReply,
    buildIncompleteRankedShareReply,
    buildGroundedRankedShareReply,
} from '../services/agent/runtime/pi/groundedQueryReply';

const makeQuery = (overrides: Record<string, unknown> = {}) => ({
    explanation: 'Sum Sales Amount Base grouped by UOM',
    engine: 'duckdb',
    plan: {
        groupBy: ['UOM'],
        aggregates: [{ function: 'sum', column: 'Sales Amount Base', as: 'total_sales' }],
    },
    result: {
        rows: [
            { UOM: 'PCS', total_sales: 16707593.409999998 },
            { UOM: 'DOZ', total_sales: 150 },
        ],
        totalMatchedRows: 2,
        returnedRows: 2,
        truncated: false,
        selectedColumns: ['UOM', 'total_sales'],
        appliedOrderBy: [],
        appliedLimit: 25,
        durationMs: 12,
    },
    appliedAt: new Date(),
    source: 'execute_data_query',
    sqlPreview: null,
    tableName: null,
    loadVersion: null,
    ...overrides,
}) as any;

describe('grounded complete query reply', () => {
    it('renders every bounded aggregate row deterministically with two-decimal measures', () => {
        const reply = buildGroundedCompleteQueryReply({
            userMessage: 'List all UOM values and totals.',
            query: makeQuery(),
            fileName: 'sales.csv',
            language: 'English',
        });

        expect(reply).toContain('complete 2-row query result');
        expect(reply).toContain('| PCS | 16,707,593.41 |');
        expect(reply).toContain('| DOZ | 150.00 |');
        expect(reply).toContain('sales.csv · 2/2 rows');
    });

    it('does not replace prose for truncated or non-complete requests', () => {
        expect(buildGroundedCompleteQueryReply({
            userMessage: 'Summarize the main pattern.',
            query: makeQuery(),
            fileName: 'sales.csv',
            language: 'English',
        })).toBeNull();

        const truncated = makeQuery({
            result: {
                ...makeQuery().result,
                totalMatchedRows: 30,
                truncated: true,
            },
        });
        expect(buildGroundedCompleteQueryReply({
            userMessage: 'List all UOM values.',
            query: truncated,
            fileName: 'sales.csv',
            language: 'English',
        })).toBeNull();
    });

    it('localizes the deterministic evidence wrapper', () => {
        const reply = buildGroundedCompleteQueryReply({
            userMessage: '列出全部 UOM 和总额。',
            query: makeQuery(),
            fileName: 'sales.csv',
            language: 'Mandarin',
        });

        expect(reply).toContain('完整 2 行结果');
        expect(reply).toContain('证据');
    });
});

describe('grounded ranked share reply', () => {
    it('calculates the highest grouped share from a complete query result', () => {
        const query = makeQuery({
            explanation: 'Total Bal Amount grouped by Customer Name',
            plan: {
                groupBy: ['Customer Name'],
                aggregates: [{ function: 'sum', column: 'Bal Amount', as: 'total_bal_amount' }],
            },
            result: {
                rows: [
                    { 'Customer Name': 'General Ledger', total_bal_amount: 63_292_800 },
                    { 'Customer Name': 'Other', total_bal_amount: 8_865_909.8 },
                ],
                totalMatchedRows: 2,
                returnedRows: 2,
                truncated: false,
                selectedColumns: ['Customer Name', 'total_bal_amount'],
                appliedOrderBy: [{ column: 'total_bal_amount', direction: 'desc' }],
                appliedLimit: 500,
                durationMs: 5,
            },
        });

        const reply = buildGroundedRankedShareReply({
            userMessage: 'Which customer has the highest total Bal Amount, what percentage of the overall Bal Amount does it represent, and what quality caveat should I know? Show the calculation and cite the query result.',
            query,
            fileName: 'outstanding.csv',
            language: 'English',
            qualityCaveats: ['17 columns contain mostly empty values.'],
        });

        expect(reply).toContain('Customer Name: General Ledger');
        expect(reply).toContain('63,292,800.00');
        expect(reply).toContain('72,158,709.80');
        expect(reply).toContain('87.71%');
        expect(reply).toContain('63,292,800.00 ÷ 72,158,709.80 × 100');
        expect(reply).toContain('complete grouped query, 2/2 rows');
        expect(reply).toContain('Data quality caveat');
        expect(reply).toContain('17 columns contain mostly empty values.');
    });

    it('refuses to derive an overall share from a truncated query', () => {
        const query = makeQuery({
            result: {
                ...makeQuery().result,
                totalMatchedRows: 30,
                truncated: true,
            },
        });

        expect(buildGroundedRankedShareReply({
            userMessage: 'Which UOM has the highest value and what percentage of the overall total is it?',
            query,
            fileName: 'sales.csv',
            language: 'English',
        })).toBeNull();
    });

    it('replaces an unsupported full-share claim with an explicit evidence warning', () => {
        const query = makeQuery({
            result: {
                ...makeQuery().result,
                returnedRows: 2,
                totalMatchedRows: 36,
                truncated: true,
            },
        });

        const reply = buildIncompleteRankedShareReply({
            userMessage: 'Which customer is highest and what percentage of the full dataset total does it represent?',
            query,
            language: 'English',
        });

        expect(reply).toContain('returned only 2/36 rows');
        expect(reply).toContain('will not estimate');
    });
});

describe('grounded derived margin reply', () => {
    it('calculates margin from summed profit and sales instead of trusting an averaged ratio', () => {
        const query = makeQuery({
            explanation: 'Total sales and profit by Customer',
            plan: {
                groupBy: ['Customer'],
                aggregates: [
                    { function: 'sum', column: 'Sales Amount Base', as: 'total_sales' },
                    { function: 'sum', column: 'Profit Amount', as: 'total_profit' },
                    { function: 'avg', column: 'Profit Ratio %', as: 'average_profit_ratio' },
                ],
            },
            result: {
                rows: [{
                    Customer: 'IPS Inc Japan Limited',
                    total_sales: 5_790_640.08,
                    total_profit: 4_963_229.53,
                    average_profit_ratio: 67.32,
                }],
                totalMatchedRows: 1,
                returnedRows: 1,
                truncated: false,
                selectedColumns: ['Customer', 'total_sales', 'total_profit', 'average_profit_ratio'],
                appliedOrderBy: [],
                appliedLimit: 10,
                durationMs: 12,
            },
        });

        const reply = buildGroundedDerivedMarginReply({
            userMessage: 'List the top customers with total sales, total profit, and profit margin.',
            query,
            fileName: 'sales.csv',
            language: 'English',
        });

        expect(reply).toContain('| IPS Inc Japan Limited | 5,790,640.08 | 4,963,229.53 | 85.71% |');
        expect(reply).not.toContain('67.32');
        expect(reply).toContain('total profit ÷ total sales');
    });

    it('does not fabricate a margin when summed profit or sales is unavailable', () => {
        expect(buildGroundedDerivedMarginReply({
            userMessage: 'Show profit margin by UOM.',
            query: makeQuery(),
            fileName: 'sales.csv',
            language: 'English',
        })).toBeNull();
    });

    it('ranks an explicitly requested top-N from the complete grouped evidence', () => {
        const rows = Array.from({ length: 12 }, (_, index) => ({
            Customer: `Customer ${index + 1}`,
            total_sales: 1000,
            total_profit: (index + 1) * 50,
        }));
        const query = makeQuery({
            explanation: 'Top 10 customers by total sales',
            plan: {
                groupBy: ['Customer'],
                aggregates: [
                    { function: 'sum', column: 'Sales Amount Base', as: 'total_sales' },
                    { function: 'sum', column: 'Profit Amount', as: 'total_profit' },
                ],
                limit: 100,
            },
            result: {
                rows,
                totalMatchedRows: 12,
                returnedRows: 12,
                truncated: false,
                selectedColumns: ['Customer', 'total_sales', 'total_profit'],
                appliedOrderBy: [],
                appliedLimit: 100,
                durationMs: 12,
            },
        });

        const reply = buildGroundedDerivedMarginReply({
            userMessage: 'List the top 10 customers with total sales, total profit, and profit margin.',
            query,
            fileName: 'sales.csv',
            language: 'English',
        });

        expect(reply).toContain('10 rows');
        expect(reply).toContain('| Customer 12 | 1,000.00 | 600.00 | 60.00% |');
        expect(reply).toContain('| Customer 3 | 1,000.00 | 150.00 | 15.00% |');
        expect(reply).not.toContain('| Customer 2 |');
        expect(reply).toContain('10/12 rows');
    });

    it('does not claim a top margin ranking from a truncated component-sorted query', () => {
        const query = makeQuery({
            plan: {
                groupBy: ['Customer'],
                aggregates: [
                    { function: 'sum', column: 'Sales Amount Base', as: 'total_sales' },
                    { function: 'sum', column: 'Profit Amount', as: 'total_profit' },
                ],
                orderBy: [{ column: 'total_profit', direction: 'desc' }],
                limit: 5,
            },
            result: {
                ...makeQuery().result,
                rows: [{ Customer: 'A', total_sales: 100, total_profit: 50 }],
                totalMatchedRows: 79,
                returnedRows: 1,
                truncated: true,
                selectedColumns: ['Customer', 'total_sales', 'total_profit'],
                appliedOrderBy: [{ column: 'total_profit', direction: 'desc' }],
                appliedLimit: 5,
            },
        });

        expect(buildGroundedDerivedMarginReply({
            userMessage: 'Show the top 5 customers by profit margin.',
            query,
            fileName: 'sales.csv',
            language: 'English',
        })).toBeNull();
    });
});

describe('grounded derived cost-per-result reply', () => {
    it('returns exactly the requested five lowest ratios from complete grouped evidence', () => {
        const query = makeQuery({
            explanation: 'Total amount spent and total results by campaign',
            plan: {
                groupBy: ['Campaign name'],
                aggregates: [
                    { function: 'sum', column: 'Amount spent (SGD)', as: 'total_spend' },
                    { function: 'sum', column: 'Results', as: 'total_results' },
                ],
                limit: 100,
            },
            result: {
                rows: [
                    { 'Campaign name': 'A', total_spend: 100, total_results: 100 },
                    { 'Campaign name': 'B', total_spend: 50, total_results: 100 },
                    { 'Campaign name': 'C', total_spend: 25, total_results: 100 },
                    { 'Campaign name': 'D', total_spend: 200, total_results: 100 },
                    { 'Campaign name': 'E', total_spend: 10, total_results: 100 },
                    { 'Campaign name': 'F', total_spend: 75, total_results: 100 },
                    { 'Campaign name': 'Zero', total_spend: 10, total_results: 0 },
                ],
                totalMatchedRows: 7,
                returnedRows: 7,
                truncated: false,
                selectedColumns: ['Campaign name', 'total_spend', 'total_results'],
                appliedOrderBy: [],
                appliedLimit: 100,
                durationMs: 14,
            },
        });

        const reply = buildGroundedDerivedCostPerResultReply({
            userMessage: 'Show the five lowest cost per result values by campaign.',
            query,
            fileName: 'ads.csv',
            language: 'English',
        });

        expect(reply).toContain('following 5 rows');
        expect(reply).toContain('| E | 10.00 | 100.00 | 0.10 |');
        expect(reply).toContain('| A | 100.00 | 100.00 | 1.00 |');
        expect(reply).not.toContain('| D |');
        expect(reply).not.toContain('| Zero |');
        expect(reply).toContain('5/7 rows');
        expect((reply?.match(/^\| [A-F] \|/gm) ?? [])).toHaveLength(5);
    });

    it('does not override prose when the ratio inputs are unavailable', () => {
        expect(buildGroundedDerivedCostPerResultReply({
            userMessage: 'Show the top 5 campaigns by cost per result.',
            query: makeQuery(),
            fileName: 'sales.csv',
            language: 'English',
        })).toBeNull();
    });

    it('uses enough shared precision to avoid displaying small non-zero ratios as zero', () => {
        const query = makeQuery({
            explanation: 'Total amount spent and total results by ad',
            plan: {
                groupBy: ['Ad name'],
                aggregates: [
                    { function: 'sum', column: 'Amount spent (SGD)', as: 'total_spend' },
                    { function: 'sum', column: 'Results', as: 'total_results' },
                ],
            },
            result: {
                rows: [
                    { 'Ad name': 'A', total_spend: 57.04, total_results: 48_891 },
                    { 'Ad name': 'B', total_spend: 42.77, total_results: 34_084 },
                ],
                totalMatchedRows: 2,
                returnedRows: 2,
                truncated: false,
                selectedColumns: ['Ad name', 'total_spend', 'total_results'],
                appliedOrderBy: [],
                appliedLimit: 100,
                durationMs: 8,
            },
        });

        const reply = buildGroundedDerivedCostPerResultReply({
            userMessage: 'Show the two lowest cost per result values by ad.',
            query,
            fileName: 'ads.csv',
            language: 'English',
        });

        expect(reply).toContain('| A | 57.04 | 48,891.00 | 0.0012 |');
        expect(reply).toContain('| B | 42.77 | 34,084.00 | 0.0013 |');
        expect(reply).not.toContain('| 0.00 |');
    });
});
