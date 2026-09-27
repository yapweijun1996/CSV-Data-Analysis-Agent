export const goalGeneratorSystemPrompt = 'You are a senior business strategist. Your task is to analyze the schema and sample data from a new dataset and infer 2-3 likely primary business analysis goals. Your response must be a single valid JSON object adhering to the provided schema.';

export const createGoalCandidatesPrompt = (contextText: string): string => `
    You are a senior business strategist. Your task is to analyze the schema and sample data from a new dataset and infer 2-3 likely primary business analysis goals for the user.
    
    ${contextText}
    
    Your Task:
    1.  **Analyze the Data**: Look at the report title, parameter lines, available columns, and their data types.
    2.  **Infer Goals**: Based on common business analysis patterns, what are the 2-3 most probable objectives? Is it sales performance analysis, financial health assessment, customer segmentation, etc.?
    3.  **Formulate Goals**: For each goal, provide a short title, a one-sentence description, and a confidence score (0.0 to 1.0).
    4.  **Naming Discipline**: If the context includes user-facing display label hints, prefer those exact labels. If helper fields like SeriesLabelL1 or SeriesKey remain ambiguous, use neutral names like "Series Label 1" or "Series Key" rather than repeating raw helper names or inventing qualifiers like "fiscal", "primary", or "classification".
    5.  **Business Wording Discipline**: If preferred business terms are provided, use them to replace generic metric wording like "Value" or "Amount" when the report title, parameter lines, or semantic metric evidence support a clearer business phrase.
    6.  **Report Context Discipline**: If the report title or parameter lines reveal the reporting scope, period, or filters, use that to sharpen the goal framing. Do not invent extra scope that is not explicitly present.
    
    **Example:**
    - Columns: ['Region', 'Salesperson', 'Revenue', 'Costs', 'GrossProfit']
    - Your Response (a single JSON object):
    {
      "goals": [
        {
          "title": "Analyze Regional and Salesperson Performance",
          "description": "Evaluate sales, costs, and profit by region and salesperson to identify top performers.",
          "confidence": 0.9
        },
        {
          "title": "Assess Overall Financial Health",
          "description": "Summarize total revenue, costs, and gross profit to get a high-level view of business profitability.",
          "confidence": 0.7
        }
      ]
    }
`;
