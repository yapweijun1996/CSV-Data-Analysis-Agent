---
name: data-quality-check
description: Check whether data is trustworthy before analysing it - missing values, outliers, inconsistent categories. Use when results look odd or before drawing conclusions.
---

# Data quality check

Run only the checks that matter for the question, and keep the reply short.

- Missing data: `data_missing` returns null, blank and zero rates per column. A key measure with many gaps limits any conclusion built on it; say so with the percentage.
- Outliers: `data_outliers` (IQR method) on a numeric column. Report how many rows and how extreme, and whether they change the answer. Do not delete them; explain the effect (for example mean versus median).
- Categories: `data_value_counts` on a categorical column. Look for the same thing spelled several ways, one dominant value, or a long tail of rare values.
- Distribution: `data_describe` for count, min, max, quartiles. Impossible values (negative quantities, dates in the future) are findings.

How to report: lead with whether the problem could change the conclusion (yes or no), then the evidence (column, count, share), then what you did about it. Never modify the data to hide a problem; propose a fix and let the user decide (see the clean-data-safely skill).
