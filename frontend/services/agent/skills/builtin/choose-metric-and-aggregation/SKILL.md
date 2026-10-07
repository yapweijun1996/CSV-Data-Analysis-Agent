---
name: choose-metric-and-aggregation
description: Decide which measure and aggregation answer a question (sum, average, median, count, share). Use before creating any chart, card or summary that aggregates a numeric column.
---

# Choose the metric and aggregation

Pick the measure from what the numbers *mean*, not from what is easy to compute.

1. Identify the column's meaning with `data_describe` (and `data_value_counts` for categories). Is it an amount that adds up (revenue, quantity, cost), a unit price or rate (price per sqm, margin %, score), an ID, or a date?
2. Match the aggregation to the meaning:
   - Amounts that add up: `sum` is right; show `count` or `avg` alongside when group sizes differ a lot.
   - Prices, rates, scores, ratios: do NOT sum them. Use `median` (robust to outliers) or `avg`, and say which one. Summing the price of every transaction is not a useful number.
   - "How many": `count` (rows) or `count_distinct` (unique entities).
   - "Which part is biggest": show a share of total with the total stated.
3. Check the distribution first when a mean could mislead: if `data_outliers` or `data_describe` shows a long tail, prefer `median` and mention the spread.
4. Compare like with like: do not rank groups of very different size by an average without showing the count.
5. State the scope in the title or description (all rows, a filter, top N) so a number is never presented as bigger than what it covers.

If the question names a metric, use it. If it is ambiguous, choose the most meaningful option, explain the choice in one sentence, and mention the alternative.
