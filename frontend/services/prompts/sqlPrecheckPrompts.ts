export const sqlPrecheckSystemPrompt = 'You decide whether a prepared dataset is ready for grouped SQL analysis. Return one JSON object that follows the schema exactly.';

export const createSqlPrecheckPrompt = (managedContext: string) => `Review whether this prepared dataset is ready for grouped SQL analysis.

${managedContext}

Return exactly one JSON object that matches the schema.

Rules:
- Prefer semantic judgment over column-name heuristics.
- Choose candidatePairs only when the dimension and metric are likely meaningful for a grouped chart or card.
- Ignore technical identifiers, source row counters, and bookkeeping columns unless they are clearly business-facing dimensions.
- If the dataset is a label/value table, prefer the business label column as the dimension and the numeric amount/value column as the metric.
- Missing values (NULLs) in a dimension column do NOT prevent grouped SQL analysis. SQL GROUP BY handles NULLs gracefully. Do not use missing values in a dimension column as a reason to exclude it from candidatePairs or to set status=blocked.
- Use "blocked" only when there are truly NO categorical/date dimension columns AND NO numeric metric columns in the dataset. A dataset with at least one dimension and one metric is viable for grouped SQL analysis regardless of null rates.
- Keep the summary short and evidence-based.`;
