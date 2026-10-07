---
name: clean-data-safely
description: Plan and propose data cleaning (types, formats, duplicates, noise rows) without damaging the original data. Use when the user asks to clean, fix or reshape data.
---

# Clean data safely

The original file is never modified. Cleaning applies to a working copy and must be explainable and reversible.

1. Diagnose first: `data_missing`, `data_value_counts`, `data_outliers` and `data_describe` show what is actually wrong. Fix only what blocks the analysis or the user's request.
2. Propose a short plan: for each issue give the column, the problem, the exact operation and the expected effect (rows or values affected). Prefer deterministic operations (cast type, replace values, trim, derive a column) over deleting rows.
3. Changing data (`data_mutate`) needs the user's approval in the app. Describe the change precisely and let the approval flow run; do not claim a change was made before it is approved and applied.
4. Never delete rows to make a chart look better. Deleting rows needs an explicit user request and the app's confirmation flow.
5. After a change, verify with a read-only query (row counts, a sample) and report what changed.

If you are unsure whether a value is an error (for example an unusual price), ask the user instead of changing it.
