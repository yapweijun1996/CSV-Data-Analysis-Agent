---
name: explore-with-data-query
description: Answer questions with structured read-only queries - filter, group, aggregate, rank, top-N. Use for most "what / which / how many / compare" questions on the dataset.
---

# Explore with data_query

`data_query` takes a structured `plan`, not free-text SQL. The full dataset is queried even when the preview is a sample.

Plan fields: `select`, `where` (predicates combined with AND; `groups` for OR), `groupBy` with `aggregates`, `orderBy`, `limit`, `postAggregateFilter`.

Patterns:
- Ranking: `groupBy: [Dimension]`, `aggregates: [{ function: 'sum', column: 'Amount', as: 'total' }]`, `select: [Dimension, 'total']`, `orderBy` desc, `limit: 10`.
- Share of total: query the grouped totals, then compute shares in your answer from the returned rows and state the total.
- Only groups above a threshold: use `postAggregateFilter` on the aggregate alias (there is no HAVING).
- Different subsets per measure: put a `where` inside each aggregate instead of one shared `where`.
- Functions: `count`, `count_distinct`, `sum`, `avg`, `min`, `max`, `median`, `percentile`.

Rules: use real column names; `where` may not reference aggregate aliases; when you `groupBy` always give `aggregates`; include sorted columns in `select`. Keep results bounded and explain what the rows show. If a query returns nothing or errors, read the error, fix the plan once, and tell the user what you changed.
