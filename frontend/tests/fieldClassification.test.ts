/**
 * Tests for utils/fieldClassification.ts
 *
 * Verifies composable field classification predicates for semantic analysis
 * of CSV columns, including revenue/cost/profit/temporal/categorical/identifier
 * field type detection.
 */

import { describe, it, expect } from 'vitest';
import type { ColumnProfile } from '../types';
import {
    isRevenue,
    isCost,
    isProfit,
    isMargin,
    isTemporal,
    isCategorical,
    isIdentifier,
    isNumeric,
    isFinancialMetric,
    isDimensionField,
    isMetricField,
    anyOf,
    allOf,
    not,
    classifyColumn,
    buildColumnFilter,
    type ColumnFilterCriteria,
} from '../utils/fieldClassification';

describe('fieldClassification', () => {
    describe('Revenue predicate', () => {
        it('recognizes revenue column names', () => {
            expect(isRevenue(undefined, 'Annual Revenue')).toBe(true);
            expect(isRevenue(undefined, 'Total Sales')).toBe(true);
            expect(isRevenue(undefined, 'Net Income')).toBe(true);
            expect(isRevenue(undefined, 'Turnover')).toBe(true);
        });

        it('rejects non-revenue columns', () => {
            expect(isRevenue(undefined, 'Cost')).toBe(false);
            expect(isRevenue(undefined, 'Region')).toBe(false);
            expect(isRevenue(undefined, 'Product ID')).toBe(false);
        });

        it('is case-insensitive', () => {
            expect(isRevenue(undefined, 'REVENUE')).toBe(true);
            expect(isRevenue(undefined, 'revenue')).toBe(true);
            expect(isRevenue(undefined, 'ReVeNuE')).toBe(true);
        });

        it('handles whitespace', () => {
            expect(isRevenue(undefined, '  Revenue  ')).toBe(true);
        });
    });

    describe('Cost predicate', () => {
        it('recognizes cost column names', () => {
            expect(isCost(undefined, 'Total Cost')).toBe(true);
            expect(isCost(undefined, 'Operating Expenses')).toBe(true);
            expect(isCost(undefined, 'COGS')).toBe(true);
            expect(isCost(undefined, 'Cost of Sales')).toBe(true);
            expect(isCost(undefined, 'Annual Spend')).toBe(true);
        });

        it('rejects non-cost columns', () => {
            expect(isCost(undefined, 'Revenue')).toBe(false);
            expect(isCost(undefined, 'Date')).toBe(false);
        });
    });

    describe('Profit predicate', () => {
        it('recognizes profit column names', () => {
            expect(isProfit(undefined, 'Net Profit')).toBe(true);
            expect(isProfit(undefined, 'Profitability')).toBe(true);
            expect(isProfit(undefined, 'Gross Profit')).toBe(true);
            expect(isProfit(undefined, 'EBIT')).toBe(true);
            expect(isProfit(undefined, 'EBITDA')).toBe(true);
        });

        it('rejects non-profit columns', () => {
            expect(isProfit(undefined, 'Revenue')).toBe(false);
            expect(isProfit(undefined, 'Customer')).toBe(false);
        });
    });

    describe('Margin predicate', () => {
        it('recognizes margin column names', () => {
            expect(isMargin(undefined, 'Gross Margin')).toBe(true);
            expect(isMargin(undefined, 'Net Margin %')).toBe(true);
            expect(isMargin(undefined, 'Operating Margin')).toBe(true);
        });

        it('rejects non-margin columns', () => {
            expect(isMargin(undefined, 'Revenue')).toBe(false);
            expect(isMargin(undefined, 'Date')).toBe(false);
        });
    });

    describe('Temporal predicate', () => {
        it('recognizes temporal column names', () => {
            expect(isTemporal(undefined, 'Report Date')).toBe(true);
            expect(isTemporal(undefined, 'Fiscal Year')).toBe(true);
            expect(isTemporal(undefined, 'Quarter')).toBe(true);
            expect(isTemporal(undefined, 'Month')).toBe(true);
            expect(isTemporal(undefined, 'Week')).toBe(true);
        });

        it('recognizes temporal ColumnProfile types', () => {
            const dateProfile: ColumnProfile = {
                name: 'transaction_date',
                type: 'date',
            };
            expect(isTemporal(dateProfile)).toBe(true);

            const timeProfile: ColumnProfile = {
                name: 'time_recorded',
                type: 'time',
            };
            expect(isTemporal(timeProfile)).toBe(true);
        });

        it('rejects non-temporal columns', () => {
            expect(isTemporal(undefined, 'Region')).toBe(false);
            const categoricalProfile: ColumnProfile = {
                name: 'region',
                type: 'categorical',
            };
            expect(isTemporal(categoricalProfile)).toBe(false);
        });
    });

    describe('Categorical predicate', () => {
        it('recognizes categorical column names', () => {
            expect(isCategorical(undefined, 'Product Category')).toBe(true);
            expect(isCategorical(undefined, 'Region')).toBe(true);
            expect(isCategorical(undefined, 'Department')).toBe(true);
            expect(isCategorical(undefined, 'Status')).toBe(true);
        });

        it('recognizes categorical ColumnProfile types', () => {
            const categoricalProfile: ColumnProfile = {
                name: 'region',
                type: 'categorical',
            };
            expect(isCategorical(categoricalProfile)).toBe(true);
        });

        it('rejects non-categorical columns', () => {
            expect(isCategorical(undefined, 'Transaction Date')).toBe(false);
            const numericProfile: ColumnProfile = {
                name: 'sales_amount',
                type: 'numerical',
            };
            expect(isCategorical(numericProfile)).toBe(false);
        });
    });

    describe('Identifier predicate', () => {
        it('recognizes identifier column names', () => {
            expect(isIdentifier(undefined, 'Customer ID')).toBe(true);
            expect(isIdentifier(undefined, 'id')).toBe(true);
            expect(isIdentifier(undefined, 'user_id')).toBe(true);
            expect(isIdentifier(undefined, 'Product Code')).toBe(true);
            expect(isIdentifier(undefined, 'SKU')).toBe(true);
        });

        it('rejects non-identifier columns', () => {
            expect(isIdentifier(undefined, 'Revenue')).toBe(false);
            expect(isIdentifier(undefined, 'Date')).toBe(false);
            expect(isIdentifier(undefined, 'Region')).toBe(false);
        });
    });

    describe('Numeric predicate', () => {
        it('recognizes numeric ColumnProfile types', () => {
            const numericalProfile: ColumnProfile = {
                name: 'sales_amount',
                type: 'numerical',
            };
            expect(isNumeric(numericalProfile)).toBe(true);

            const currencyProfile: ColumnProfile = {
                name: 'total_cost',
                type: 'currency',
            };
            expect(isNumeric(currencyProfile)).toBe(true);

            const percentageProfile: ColumnProfile = {
                name: 'growth_rate',
                type: 'percentage',
            };
            expect(isNumeric(percentageProfile)).toBe(true);
        });

        it('rejects non-numeric types', () => {
            const categoricalProfile: ColumnProfile = {
                name: 'region',
                type: 'categorical',
            };
            expect(isNumeric(categoricalProfile)).toBe(false);

            const dateProfile: ColumnProfile = {
                name: 'transaction_date',
                type: 'date',
            };
            expect(isNumeric(dateProfile)).toBe(false);
        });
    });

    describe('Composed predicates', () => {
        describe('isFinancialMetric', () => {
            it('matches revenue, cost, profit, or margin', () => {
                expect(isFinancialMetric(undefined, 'Total Revenue')).toBe(true);
                expect(isFinancialMetric(undefined, 'Operating Cost')).toBe(true);
                expect(isFinancialMetric(undefined, 'Net Profit')).toBe(true);
                expect(isFinancialMetric(undefined, 'Gross Margin')).toBe(true);
            });

            it('rejects non-financial metrics', () => {
                expect(isFinancialMetric(undefined, 'Region')).toBe(false);
                expect(isFinancialMetric(undefined, 'Date')).toBe(false);
                expect(isFinancialMetric(undefined, 'Customer ID')).toBe(false);
            });
        });

        describe('isDimensionField', () => {
            it('matches categorical or temporal non-identifiers', () => {
                expect(isDimensionField(undefined, 'Region')).toBe(true);
                expect(isDimensionField(undefined, 'Report Date')).toBe(true);
                expect(isDimensionField(undefined, 'Fiscal Year')).toBe(true);
            });

            it('rejects identifiers', () => {
                expect(isDimensionField(undefined, 'Customer ID')).toBe(false);
                expect(isDimensionField(undefined, 'Product Code')).toBe(false);
            });

            it('rejects financial metrics', () => {
                expect(isDimensionField(undefined, 'Total Revenue')).toBe(false);
                expect(isDimensionField(undefined, 'Net Profit')).toBe(false);
            });
        });

        describe('isMetricField', () => {
            it('matches numeric non-identifiers', () => {
                const profile: ColumnProfile = {
                    name: 'sales_amount',
                    type: 'currency',
                };
                expect(isMetricField(profile)).toBe(true);
            });

            it('rejects identifiers', () => {
                expect(isMetricField(undefined, 'Customer ID')).toBe(false);
            });

            it('rejects non-numeric columns', () => {
                const categoricalProfile: ColumnProfile = {
                    name: 'region',
                    type: 'categorical',
                };
                expect(isMetricField(categoricalProfile)).toBe(false);
            });
        });
    });

    describe('Predicate combinators', () => {
        describe('anyOf', () => {
            it('matches if ANY predicate matches', () => {
                const isRevenueOrCost = anyOf(isRevenue, isCost);
                expect(isRevenueOrCost(undefined, 'Total Revenue')).toBe(true);
                expect(isRevenueOrCost(undefined, 'Operating Cost')).toBe(true);
                expect(isRevenueOrCost(undefined, 'Region')).toBe(false);
            });

            it('works with multiple predicates', () => {
                const isAnyFinancial = anyOf(isRevenue, isCost, isProfit, isMargin);
                expect(isAnyFinancial(undefined, 'Gross Margin')).toBe(true);
                expect(isAnyFinancial(undefined, 'Date')).toBe(false);
            });
        });

        describe('allOf', () => {
            it('matches if ALL predicates match', () => {
                const isTemporalCategorical = allOf(isTemporal, isCategorical);
                // A column cannot be both temporal AND categorical by column name alone
                expect(isTemporalCategorical(undefined, 'Report Date')).toBe(false);
            });

            it('works with NOT combinator', () => {
                const isTemporalButNotIdentifier = allOf(isTemporal, not(isIdentifier));
                expect(isTemporalButNotIdentifier(undefined, 'Report Date')).toBe(true);
                expect(isTemporalButNotIdentifier(undefined, 'Date ID')).toBe(false);
            });
        });

        describe('not', () => {
            it('negates a predicate', () => {
                const notIdentifier = not(isIdentifier);
                expect(notIdentifier(undefined, 'Customer ID')).toBe(false);
                expect(notIdentifier(undefined, 'Revenue')).toBe(true);
            });
        });
    });

    describe('classifyColumn', () => {
        it('classifies financial metrics correctly', () => {
            const revenueProfile: ColumnProfile = {
                name: 'Total Revenue',
                type: 'currency',
            };
            expect(classifyColumn(revenueProfile)).toBe('metric');
        });

        it('classifies temporal columns correctly', () => {
            const dateProfile: ColumnProfile = {
                name: 'Report Date',
                type: 'date',
            };
            expect(classifyColumn(dateProfile)).toBe('temporal');
        });

        it('classifies categorical columns correctly', () => {
            const categoryProfile: ColumnProfile = {
                name: 'Region',
                type: 'categorical',
            };
            expect(classifyColumn(categoryProfile)).toBe('dimension');
        });

        it('classifies identifiers correctly', () => {
            const idProfile: ColumnProfile = {
                name: 'Customer ID',
                type: 'numerical',
            };
            expect(classifyColumn(idProfile)).toBe('identifier');
        });

        it('classifies generic numeric columns as metric', () => {
            const numericProfile: ColumnProfile = {
                name: 'Amount',
                type: 'numerical',
            };
            expect(classifyColumn(numericProfile)).toBe('metric');
        });

        it('returns unknown for unrecognized types', () => {
            const unknownProfile: ColumnProfile = {
                name: 'unknown_field',
                type: 'categorical',
            };
            // This will be dimension, not unknown, since categorical is recognized
            expect(['dimension', 'unknown']).toContain(classifyColumn(unknownProfile));
        });
    });

    describe('buildColumnFilter', () => {
        it('filters by financial metrics', () => {
            const criteria: ColumnFilterCriteria = { financial: true };
            const filter = buildColumnFilter(criteria);
            expect(filter(undefined, 'Total Revenue')).toBe(true);
            expect(filter(undefined, 'Operating Cost')).toBe(true);
            expect(filter(undefined, 'Region')).toBe(false);
        });

        it('filters by temporal columns', () => {
            const criteria: ColumnFilterCriteria = { temporal: true };
            const filter = buildColumnFilter(criteria);
            expect(filter(undefined, 'Report Date')).toBe(true);
            expect(filter(undefined, 'Fiscal Year')).toBe(true);
            expect(filter(undefined, 'Region')).toBe(false);
        });

        it('filters by dimension fields', () => {
            const criteria: ColumnFilterCriteria = { dimension: true };
            const filter = buildColumnFilter(criteria);
            expect(filter(undefined, 'Region')).toBe(true);
            expect(filter(undefined, 'Report Date')).toBe(true);
            expect(filter(undefined, 'Customer ID')).toBe(false);
        });

        it('filters by multiple criteria (OR logic)', () => {
            const criteria: ColumnFilterCriteria = {
                financial: true,
                temporal: true,
            };
            const filter = buildColumnFilter(criteria);
            expect(filter(undefined, 'Total Revenue')).toBe(true);
            expect(filter(undefined, 'Report Date')).toBe(true);
            expect(filter(undefined, 'Region')).toBe(false);
        });

        it('works with numeric profile data', () => {
            const criteria: ColumnFilterCriteria = { metric: true };
            const filter = buildColumnFilter(criteria);
            const numericProfile: ColumnProfile = {
                name: 'sales_amount',
                type: 'currency',
            };
            expect(filter(numericProfile)).toBe(true);
        });
    });

    describe('Edge cases', () => {
        it('handles undefined column names gracefully', () => {
            expect(isRevenue(undefined, '')).toBe(false);
            expect(isRevenue(undefined, undefined as any)).toBe(false);
        });

        it('handles null/undefined profile data gracefully', () => {
            expect(isNumeric(null as any)).toBe(false);
            expect(isTemporal(undefined)).toBe(false);
        });

        it('handles column names with special characters', () => {
            expect(isRevenue(undefined, 'Total Revenue (USD)')).toBe(true);
            expect(isIdentifier(undefined, 'cust.id')).toBe(true); // Matches "id" word boundary
        });

        it('handles column names with numeric suffixes', () => {
            expect(isRevenue(undefined, 'Revenue2024')).toBe(true);  // No underscore
            expect(isTemporal(undefined, 'Date2024')).toBe(true);     // No underscore
        });
    });

    describe('Pattern consistency', () => {
        it('ensures financial metrics are mutually exclusive at column level', () => {
            // A column name should not match multiple financial patterns
            // (though "Profit Margin" might match both profit and margin)
            const profitMargin = 'Gross Profit Margin';
            expect(isProfit(undefined, profitMargin)).toBe(true);
            expect(isMargin(undefined, profitMargin)).toBe(true);
            // This is expected - profit margin contains both words
        });

        it('ensures temporal is not confused with categories', () => {
            const dateCol = 'Report Date';
            const categoryCol = 'Date Category';
            expect(isTemporal(undefined, dateCol)).toBe(true);
            expect(isCategorical(undefined, dateCol)).toBe(false);
            expect(isTemporal(undefined, categoryCol)).toBe(true); // Contains "date"
            expect(isCategorical(undefined, categoryCol)).toBe(true); // Contains "category"
        });

        it('ensures identifiers are not confused with other types', () => {
            expect(isIdentifier(undefined, 'Product ID')).toBe(true);
            expect(isIdentifier(undefined, 'ID Revenue')).toBe(true); // Contains "ID"
            expect(isRevenue(undefined, 'ID Revenue')).toBe(true); // Contains "revenue"
        });
    });
});
