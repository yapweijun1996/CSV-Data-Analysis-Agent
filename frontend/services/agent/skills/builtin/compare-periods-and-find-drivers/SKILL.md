---
name: compare-periods-and-find-drivers
description: Compare two time periods and explain what changed (growth, decline, contributing groups). Use for "versus last month/year", "why did X change", trends and variance questions.
---

# Compare periods and find drivers

1. Confirm the date or period column and the measure. Use `data_describe` or `data_value_counts` to see the available periods; do not guess period boundaries.
2. Compare the latest period with a clearly named baseline (previous period or same period last year). Always state both periods and both values, the absolute change and the percentage change.
3. To explain a change, break the difference down by the most relevant dimension (product, region, customer segment) and report the few groups that account for most of it, with their share of the change.
4. Be careful with partial periods (an unfinished month looks like a drop) and with groups that appear or disappear between periods.
5. Report causes as evidence ("most of the decline comes from X"), not as certainty. If the data cannot show why, say what additional data would.

Tools: if `analysis_period_compare` and `analysis_root_cause_breakdown` are available, use them. Otherwise run `data_query` once per period (a `where` on the period column, or `groupBy` the period) with the same aggregate, and compute the change from the returned rows.

Use the same aggregation for both periods, and the aggregation that fits the measure (see choose-metric-and-aggregation).
