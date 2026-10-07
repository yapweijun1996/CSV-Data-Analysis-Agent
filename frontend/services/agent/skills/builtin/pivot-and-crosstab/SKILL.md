---
name: pivot-and-crosstab
description: Build a pivot table or cross-tab (rows by columns with one measure). Use when the user asks for a pivot, matrix, crosstab or a two-axis summary.
---

# Pivot and cross-tab

Use a pivot when the user wants two dimensions side by side (for example region by quarter). For a single dimension, a grouped `data_query` is simpler.

1. Pick `rows` (what each row is) and, for a true cross-tab, `columns` (the dimension whose values become columns). Both must be real columns with a sensible number of distinct values; check with `data_value_counts` before choosing a high-cardinality column.
2. Pick one measure and aggregation with the choose-metric-and-aggregation skill. Do not sum prices or rates.
3. Keep the matrix readable: limit to the most important rows or columns, and sort by the measure.
4. Say what the matrix shows in one sentence, then call out the largest cell, the strongest row or column, and any empty pattern worth attention.

How to build it with the tools you have: if `analysis_pivot_matrix` is available, use it with `rows`, optional `columns`, one `metric` and an `aggregate`. Otherwise run `data_query` with `groupBy` on both dimensions and one aggregate, then present the returned rows as a small matrix in your answer; when the user wants it as a card, create it with `analysis_create_plan`.

If the data is in wide format (one column per period), reshape or query it first so periods become values, then pivot. Never change the dataset only to produce a pivot; a pivot is an analysis result, not a data edit.
