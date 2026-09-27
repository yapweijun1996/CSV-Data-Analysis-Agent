export const datasetSemanticAnnotationSystemPrompt = 'You classify the semantic structure of a prepared dataset for downstream AI analysis. Return one JSON object that matches the schema exactly. Your job is semantic labeling only, not chart or business-card generation.';

export const createDatasetSemanticAnnotationPrompt = (managedContext: string) => `Classify the prepared dataset semantics from the evidence below.

${managedContext}

Return exactly one JSON object that matches the schema.

Rules:
- Judge dataset semantics from the provided evidence only.
- rowAnnotations apply to the provided candidate rows only.
- Do not invent extra row indices.
- Use "detail" only for business-entity, transactional, or project-level rows.
- Use "subtotal", "grand_total", "group_header", "footer", "note", "bucket", or "noise" for non-detail or explanatory rows.
- If uncertain, return "unknown" or use lower confidence.
- Column roles should reflect semantic meaning, not SQL type.
- Prefer semantic column roles such as "business_entity", "business_dimension", "metric", "time_dimension", "descriptor", "code", "helper_dimension", and "note".
- Provide businessLabel when a clearer end-user label is supported by the evidence.
- Mark helper or technical fields as unsafe for direct business grouping.
- Fill headerSemantics using report title, candidate header lines, parameters, and footer evidence.
- Use evidenceSources and confidenceBand when supported by the evidence.
- Keep the summary short and evidence-based.`;
