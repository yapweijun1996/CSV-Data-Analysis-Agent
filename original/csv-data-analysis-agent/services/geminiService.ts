// This service now handles both Google Gemini and OpenAI models.
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { AnalysisPlan, CsvData, ColumnProfile, AnalysisCardData, AiChatResponse, ChatMessage, Settings, DataPreparationPlan, CardContext, CsvRow, AppView } from '../types';
import { executePlan } from "../utils/dataProcessor";

// Helper for retrying API calls
const withRetry = async <T>(fn: () => Promise<T>, retries = 2): Promise<T> => {
    let lastError: Error | undefined;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;
            console.warn(`API call failed, retrying... (${i + 1}/${retries})`, error);
            // Optional: add a small delay before retrying
            if (i < retries - 1) {
                await new Promise(res => setTimeout(res, 500));
            }
        }
    }
    throw lastError;
};


const planSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      chartType: { type: Type.STRING, enum: ['bar', 'line', 'pie', 'doughnut', 'scatter'], description: 'Type of chart to generate.' },
      title: { type: Type.STRING, description: 'A concise title for the analysis.' },
      description: { type: Type.STRING, description: 'A brief explanation of what the analysis shows.' },
      aggregation: { type: Type.STRING, enum: ['sum', 'count', 'avg'], description: 'The aggregation function to apply. Omit for scatter plots.' },
      groupByColumn: { type: Type.STRING, description: 'The column to group data by (categorical). Omit for scatter plots.' },
      valueColumn: { type: Type.STRING, description: 'The column for aggregation (numerical). Not needed for "count".' },
      xValueColumn: { type: Type.STRING, description: 'The column for the X-axis of a scatter plot (numerical). Required for scatter plots.' },
      yValueColumn: { type: Type.STRING, description: 'The column for the Y-axis of a scatter plot (numerical). Required for scatter plots.' },
      defaultTopN: { type: Type.INTEGER, description: 'Optional. If the analysis has many categories, this suggests a default Top N view (e.g., 8).' },
      defaultHideOthers: { type: Type.BOOLEAN, description: 'Optional. If using defaultTopN, suggests whether to hide the "Others" category by default.' },
    },
    required: ['chartType', 'title', 'description'],
  },
};

const columnProfileSchema = {
    type: Type.OBJECT,
    properties: {
        name: { type: Type.STRING, description: "The column name." },
        type: { type: Type.STRING, enum: ['numerical', 'categorical', 'date', 'time', 'currency', 'percentage'], description: "The data type of the column. Identify specific types like 'date', 'currency', etc., where possible." },
    },
    required: ['name', 'type'],
};

const dataPreparationSchema = {
    type: Type.OBJECT,
    properties: {
        explanation: { type: Type.STRING, description: "A brief, user-facing explanation of the transformations that will be applied to the data (e.g., 'Removed 3 summary rows and reshaped the data from a cross-tab format')." },
        jsFunctionBody: {
            type: Type.STRING,
            description: "The body of a JavaScript function that takes one argument `data` (an array of objects) and returns the transformed array of objects. This code will be executed to clean and reshape the data. If no transformation is needed, this should be null."
        },
        outputColumns: {
            type: Type.ARRAY,
            description: "A list of column profiles describing the structure of the data AFTER the transformation. If no transformation is performed, this should be the same as the input column profiles.",
            items: columnProfileSchema,
        },
    },
    required: ['explanation', 'outputColumns']
};

export const generateDataPreparationPlan = async (
    columns: ColumnProfile[],
    sampleData: CsvData['data'],
    settings: Settings
): Promise<DataPreparationPlan> => {
    
    let lastError: Error | undefined;

    for(let i=0; i < 3; i++) { // Self-correction loop: 1 initial attempt + 2 retries
        try {
            let jsonStr: string;

            if (settings.provider === 'openai') {
                if (!settings.openAIApiKey) return { explanation: "No transformation needed as API key is not set.", jsFunctionBody: null, outputColumns: columns };
                const systemPrompt = `You are an expert data engineer. Your task is to analyze a raw dataset and, if necessary, provide a JavaScript function to clean and reshape it into a tidy, analysis-ready format. CRITICALLY, you must also provide the schema of the NEW, transformed data with detailed data types.
A tidy format has: 1. Each variable as a column. 2. Each observation as a row.
You MUST respond with a single valid JSON object, and nothing else. The JSON object must adhere to the provided schema.`;
                const userPrompt = `Common problems to fix:
- **Summary Rows**: Filter out rows with 'Total', 'Subtotal'.
- **Crosstab/Wide Format**: Unpivot data where column headers are values (e.g., years, regions).
- **Multi-header Rows**: Skip initial junk rows.
Dataset Columns (Initial Schema):
${JSON.stringify(columns, null, 2)}
Sample Data (up to 20 rows):
${JSON.stringify(sampleData, null, 2)}
${lastError ? `On the previous attempt, your generated code failed with this error: "${lastError.message}". Please analyze the error and the data, then provide a corrected response.` : ''}
Your task:
1.  **Analyze**: Look at the initial schema and sample data.
2.  **Plan Transformation**: Decide if cleaning or reshaping is needed. If you identify date or time columns as strings, your function should attempt to parse them into a standard format (e.g., 'YYYY-MM-DD' for dates).
3.  **Define Output Schema**: Determine the exact column names and types of the data AFTER your transformation. This is the MOST important step. Be as specific as possible with the types. Use 'categorical' for text labels, 'numerical' for general numbers, but you MUST identify and use the more specific types where they apply:
    - **'date'**: For columns containing dates (e.g., "2023-10-26", "10/26/2023").
    - **'time'**: For columns with time values (e.g., "14:30:00").
    - **'currency'**: For columns representing money, especially if they contain symbols like '$' or ','.
    - **'percentage'**: For columns with '%' symbols or values that are clearly percentages.
4.  **Write Code**: If transformation is needed, write the body of a JavaScript function. This function receives one argument, \`data\`, and must return the transformed array of objects.
5.  **Explain**: Provide a concise 'explanation' of what you did.
**CRITICAL REQUIREMENTS:**
- You MUST provide the \`outputColumns\` array. If you don't transform the data, \`outputColumns\` should be identical to the initial schema (but with more specific types if you identified them). If you do transform it, it must accurately reflect the new structure your code creates.
- Your JavaScript code MUST include a \`return\` statement as its final operation.
**Example: Reshaping and identifying types**
- Initial Data: [{'Product': 'A', 'DateStr': 'Oct 26 2023', 'Revenue': '$1,500.00'}]
- Explanation: "Standardized the date format and identified the revenue column as currency."
- jsFunctionBody: "return data.map(row => ({ ...row, DateStr: new Date(row.DateStr).toISOString().split('T')[0] }));"
- outputColumns: [{'name': 'Product', 'type': 'categorical'}, {'name': 'DateStr', 'type': 'date'}, {'name': 'Revenue', 'type': 'currency'}]`;
                
                const response = await withRetry(async () => {
                    const res = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${settings.openAIApiKey}`
                        },
                        body: JSON.stringify({
                            model: settings.model,
                            messages: [
                                { role: 'system', content: systemPrompt },
                                { role: 'user', content: userPrompt }
                            ],
                            response_format: { type: 'json_object' }
                        })
                    });
                    if (!res.ok) {
                        const errorData = await res.json();
                        throw new Error(errorData.error?.message || `OpenAI API error: ${res.statusText}`);
                    }
                    return res.json();
                });
                jsonStr = response.choices[0].message.content;

            } else { // Google Gemini
                if (!settings.geminiApiKey) return { explanation: "No transformation needed as API key is not set.", jsFunctionBody: null, outputColumns: columns };
                const ai = new GoogleGenAI({ apiKey: settings.geminiApiKey });
                const prompt = `
                    You are an expert data engineer. Your task is to analyze a raw dataset and, if necessary, provide a JavaScript function to clean and reshape it into a tidy, analysis-ready format. CRITICALLY, you must also provide the schema of the NEW, transformed data with detailed data types.
                    A tidy format has: 1. Each variable as a column. 2. Each observation as a row.
                    Common problems to fix:
                    - **Summary Rows**: Filter out rows with 'Total', 'Subtotal'.
                    - **Crosstab/Wide Format**: Unpivot data where column headers are values (e.g., years, regions).
                    - **Multi-header Rows**: Skip initial junk rows.
                    Dataset Columns (Initial Schema):
                    ${JSON.stringify(columns, null, 2)}
                    Sample Data (up to 20 rows):
                    ${JSON.stringify(sampleData, null, 2)}
                    ${lastError ? `On the previous attempt, your generated code failed with this error: "${lastError.message}". Please analyze the error and the data, then provide a corrected response.` : ''}
                    Your task:
                    1.  **Analyze**: Look at the initial schema and sample data.
                    2.  **Plan Transformation**: Decide if cleaning or reshaping is needed. If you identify date or time columns as strings, your function should attempt to parse them into a standard format (e.g., 'YYYY-MM-DD' for dates).
                    3.  **Define Output Schema**: Determine the exact column names and types of the data AFTER your transformation. This is the MOST important step. Be as specific as possible with the types. Use 'categorical' for text labels, 'numerical' for general numbers, but you MUST identify and use the more specific types where they apply:
                        - **'date'**: For columns containing dates (e.g., "2023-10-26", "10/26/2023").
                        - **'time'**: For columns with time values (e.g., "14:30:00").
                        - **'currency'**: For columns representing money, especially if they contain symbols like '$' or ','.
                        - **'percentage'**: For columns with '%' symbols or values that are clearly percentages.
                    4.  **Write Code**: If transformation is needed, write the body of a JavaScript function. This function receives one argument, \`data\`, and must return the transformed array of objects.
                    5.  **Explain**: Provide a concise 'explanation' of what you did.
                    **CRITICAL REQUIREMENTS:**
                    - You MUST provide the \`outputColumns\` array. If you don't transform the data, \`outputColumns\` should be identical to the initial schema (but with more specific types if you identified them). If you do transform it, it must accurately reflect the new structure your code creates.
                    - Your JavaScript code MUST include a \`return\` statement as its final operation.
                    **Example: Reshaping and identifying types**
                    - Initial Data: [{'Product': 'A', 'DateStr': 'Oct 26 2023', 'Revenue': '$1,500.00'}]
                    - Explanation: "Standardized the date format and identified the revenue column as currency."
                    - jsFunctionBody: "return data.map(row => ({ ...row, DateStr: new Date(row.DateStr).toISOString().split('T')[0] }));"
                    - outputColumns: [{'name': 'Product', 'type': 'categorical'}, {'name': 'DateStr', 'type': 'date'}, {'name': 'Revenue', 'type': 'currency'}]
                    Your response must be a valid JSON object adhering to the provided schema.
                `;
                const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
                    model: settings.model as 'gemini-2.5-flash' | 'gemini-2.5-pro',
                    contents: prompt,
                    config: {
                        responseMimeType: 'application/json',
                        responseSchema: dataPreparationSchema,
                    },
                }));
                jsonStr = response.text.trim();
            }
            
            const plan = JSON.parse(jsonStr) as DataPreparationPlan;

            // Test execution before returning
            if (plan.jsFunctionBody) {
                try {
                    const transformFunction = new Function('data', plan.jsFunctionBody);
                    const sampleResult = transformFunction(sampleData);
                    if (!Array.isArray(sampleResult)) {
                        throw new Error("Generated function did not return an array.");
                    }
                    return plan; // Success
                } catch (e) {
                    lastError = e as Error;
                    console.warn(`AI self-correction attempt ${i + 1} failed due to JS execution error. Retrying...`, lastError);
                    continue; // Go to next iteration of the loop to ask AI to fix code
                }
            }
            // If no code, ensure output columns match input columns if AI forgot.
            if (!plan.jsFunctionBody && (!plan.outputColumns || plan.outputColumns.length === 0)) {
                plan.outputColumns = columns;
            }
            return plan; // No function body, success.
        
        } catch (error) {
            console.error(`Error in data preparation plan generation (Attempt ${i+1}):`, error);
            lastError = error as Error;
        }
    }

    throw new Error(`AI failed to generate a valid data preparation plan after multiple attempts. Last error: ${lastError?.message}`);
};

const generateCandidatePlans = async (
    columns: ColumnProfile[],
    sampleData: CsvRow[],
    settings: Settings,
    numPlans: number
): Promise<AnalysisPlan[]> => {
    const categoricalCols = columns.filter(c => c.type === 'categorical' || c.type === 'date' || c.type === 'time').map(c => c.name);
    const numericalCols = columns.filter(c => c.type === 'numerical' || c.type === 'currency' || c.type === 'percentage').map(c => c.name);
    
    let jsonStr: string;

    if (settings.provider === 'openai') {
        const systemPrompt = `You are a senior business intelligence analyst specializing in ERP and financial data. Your task is to generate a diverse list of insightful analysis plan candidates for a given dataset by identifying common data patterns.
You MUST respond with a single valid JSON array of plan objects, and nothing else. The JSON object must adhere to the provided schema.`;
        const userPrompt = `Dataset columns:
- Categorical: ${categoricalCols.join(', ')}
- Numerical: ${numericalCols.join(', ')}
Sample Data (first 5 rows):
${JSON.stringify(sampleData, null, 2)}
Please generate up to ${numPlans} diverse analysis plans.
**CRITICAL: Think like a Business/ERP Analyst.**
1.  **Identify Key Metrics**: First, find the columns that represent measurable values. Look for names like 'VALUE', 'AMOUNT', 'SALES', 'COST', 'QUANTITY', 'PRICE'. These are almost always the columns you should be aggregating (e.g., using 'sum' or 'avg').
2.  **Identify Dimensions**: Next, find columns that describe the data. Look for names ending in 'CODE', 'ID', 'TYPE', 'CATEGORY', or containing 'NAME', 'DESCRIPTION', 'PROJECT', 'REGION'. These are your primary grouping columns (dimensions).
3.  **Find Relationships**: Codes and descriptions often go together (e.g., 'PROJECT_CODE' and 'PROJECT_DESCRIPTION'). A very valuable analysis is to group by a description column (which is more human-readable for a chart) and sum a value column.
4.  **Prioritize High-Value Aggregations**: Focus on creating plans that answer common business questions like 'What are our top revenue sources?', 'Where are the biggest costs?', or 'How are items distributed across categories?'. A simple 'count' is less valuable than a 'sum' of a 'VALUE' or 'AMOUNT' column.
**Example Task**: Given columns ['CODE', 'DESCRIPTION', 'PROJECT_CODE', 'VALUE'], a HIGH-QUALITY plan would be:
- Title: "Sum of VALUE by DESCRIPTION"
- Aggregation: 'sum'
- groupByColumn: 'DESCRIPTION'
- valueColumn: 'VALUE'
- Chart Type: 'bar'
For each plan, choose the most appropriate chartType ('bar', 'line', 'pie', 'doughnut', 'scatter'). 
- Use 'line' for time series trends.
- Use 'bar' for most categorical comparisons, especially for "top X" style reports.
- Use 'pie' or 'doughnut' for compositions with few categories.
- Use 'scatter' to show the relationship between two numerical variables.
Rules:
- For 'scatter' plots, you MUST provide 'xValueColumn' and 'yValueColumn' (both numerical) and you MUST NOT provide 'aggregation' or 'groupByColumn'.
- Do not create plans that are too granular (e.g., grouping by a unique ID column if there are thousands of them).`;

        const response = await withRetry(async () => {
            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.openAIApiKey}` },
                body: JSON.stringify({
                    model: settings.model,
                    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
                    response_format: { type: 'json_object' }
                })
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error?.message || `OpenAI API error: ${res.statusText}`);
            }
            return res.json();
        });
        // OpenAI may wrap the array in an object, e.g. {"plans": [...]}. We need to find the array.
        const resultObject = JSON.parse(response.choices[0].message.content);
        const arrayCandidate = Object.values(resultObject).find(v => Array.isArray(v));
        if (!arrayCandidate) throw new Error("OpenAI response did not contain a JSON array of plans.");
        jsonStr = JSON.stringify(arrayCandidate);
    
    } else { // Google Gemini
        const ai = new GoogleGenAI({ apiKey: settings.geminiApiKey });
        const prompt = `
            You are a senior business intelligence analyst specializing in ERP and financial data. Your task is to generate a diverse list of insightful analysis plan candidates for a given dataset by identifying common data patterns.
            Dataset columns:
            - Categorical: ${categoricalCols.join(', ')}
            - Numerical: ${numericalCols.join(', ')}
            Sample Data (first 5 rows):
            ${JSON.stringify(sampleData, null, 2)}
            Please generate up to ${numPlans} diverse analysis plans.
            **CRITICAL: Think like a Business/ERP Analyst.**
            1.  **Identify Key Metrics**: First, find the columns that represent measurable values. Look for names like 'VALUE', 'AMOUNT', 'SALES', 'COST', 'QUANTITY', 'PRICE'. These are almost always the columns you should be aggregating (e.g., using 'sum' or 'avg').
            2.  **Identify Dimensions**: Next, find columns that describe the data. Look for names ending in 'CODE', 'ID', 'TYPE', 'CATEGORY', or containing 'NAME', 'DESCRIPTION', 'PROJECT', 'REGION'. These are your primary grouping columns (dimensions).
            3.  **Find Relationships**: Codes and descriptions often go together (e.g., 'PROJECT_CODE' and 'PROJECT_DESCRIPTION'). A very valuable analysis is to group by a description column (which is more human-readable for a chart) and sum a value column.
            4.  **Prioritize High-Value Aggregations**: Focus on creating plans that answer common business questions like 'What are our top revenue sources?', 'Where are the biggest costs?', or 'How are items distributed across categories?'. A simple 'count' is less valuable than a 'sum' of a 'VALUE' or 'AMOUNT' column.
            **Example Task**: Given columns ['CODE', 'DESCRIPTION', 'PROJECT_CODE', 'VALUE'], a HIGH-QUALITY plan would be:
            - Title: "Sum of VALUE by DESCRIPTION"
            - Aggregation: 'sum'
            - groupByColumn: 'DESCRIPTION'
            - valueColumn: 'VALUE'
            - Chart Type: 'bar'
            For each plan, choose the most appropriate chartType ('bar', 'line', 'pie', 'doughnut', 'scatter'). 
            - Use 'line' for time series trends.
            - Use 'bar' for most categorical comparisons, especially for "top X" style reports.
            - Use 'pie' or 'doughnut' for compositions with few categories.
            - Use 'scatter' to show the relationship between two numerical variables.
            Rules:
            - For 'scatter' plots, you MUST provide 'xValueColumn' and 'yValueColumn' (both numerical) and you MUST NOT provide 'aggregation' or 'groupByColumn'.
            - Do not create plans that are too granular (e.g., grouping by a unique ID column if there are thousands of them).
            Your response must be a valid JSON array of plan objects. Do not include any other text or explanations.
        `;
        const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
            model: settings.model as 'gemini-2.5-flash' | 'gemini-2.5-pro',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: planSchema,
            },
        }));
        jsonStr = response.text.trim();
    }

    const plans = JSON.parse(jsonStr) as AnalysisPlan[];
    return plans.filter((p: any) => p.chartType && p.title);
};

// Helper function for the second step: the AI Quality Gate
const refineAndConfigurePlans = async (
    plansWithData: { plan: AnalysisPlan; aggregatedSample: CsvRow[] }[],
    settings: Settings
): Promise<AnalysisPlan[]> => {
    let jsonStr: string;

    if(settings.provider === 'openai') {
        const systemPrompt = `You are a Quality Review Data Analyst. Your job is to review a list of proposed analysis plans and their data samples. Your goal is to select ONLY the most insightful and readable charts for the end-user, and configure them for the best default view. Your final output must be an array of ONLY the good, configured plan objects. Do not include the discarded plans.
You MUST respond with a single valid JSON array of plan objects, and nothing else. The JSON object must adhere to the provided schema.`;
        const userPrompt = `**Review Criteria & Rules:**
1.  **Discard Low-Value Charts**: This is your most important task. You MUST discard any plan that is not genuinely insightful.
    - **Example of a low-value chart**: A bar chart where all values are nearly identical (e.g., [77, 77, 77, 76, 78]). This shows uniformity but is not a useful visualization. DISCARD IT.
    - **Example of another low-value chart**: A pie/doughnut chart where one category makes up over 95% of the total. This is not insightful. DISCARD IT.
2.  **Discard Unreadable Charts**: If a chart groups by a high-cardinality column resulting in too many categories to be readable (e.g., more than 50 tiny bars), discard it unless it's a clear time-series line chart.
3.  **Configure for Readability**: For good, insightful charts that have a moderate number of categories (e.g., 15 to 50), you MUST add default settings to make them readable. Set \`defaultTopN\` to 8 and \`defaultHideOthers\` to \`true\`.
4.  **Keep Good Charts**: If a chart is insightful and has a reasonable number of categories (e.g., under 15), keep it as is without adding default settings.
**Proposed Plans and Data Samples:**
${JSON.stringify(plansWithData, null, 2)}`;
        
        const response = await withRetry(async () => {
            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.openAIApiKey}` },
                body: JSON.stringify({
                    model: settings.model,
                    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
                    response_format: { type: 'json_object' }
                })
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error?.message || `OpenAI API error: ${res.statusText}`);
            }
            return res.json();
        });
        const resultObject = JSON.parse(response.choices[0].message.content);
        const arrayCandidate = Object.values(resultObject).find(v => Array.isArray(v));
        if (!arrayCandidate) throw new Error("OpenAI response did not contain a JSON array of plans.");
        jsonStr = JSON.stringify(arrayCandidate);

    } else { // Google Gemini
        const ai = new GoogleGenAI({ apiKey: settings.geminiApiKey });
        const prompt = `
            You are a Quality Review Data Analyst. Your job is to review a list of proposed analysis plans and their data samples. Your goal is to select ONLY the most insightful and readable charts for the end-user, and configure them for the best default view.
            **Review Criteria & Rules:**
            1.  **Discard Low-Value Charts**: This is your most important task. You MUST discard any plan that is not genuinely insightful.
                - **Example of a low-value chart**: A bar chart where all values are nearly identical (e.g., [77, 77, 77, 76, 78]). This shows uniformity but is not a useful visualization. DISCARD IT.
                - **Example of another low-value chart**: A pie/doughnut chart where one category makes up over 95% of the total. This is not insightful. DISCARD IT.
            2.  **Discard Unreadable Charts**: If a chart groups by a high-cardinality column resulting in too many categories to be readable (e.g., more than 50 tiny bars), discard it unless it's a clear time-series line chart.
            3.  **Configure for Readability**: For good, insightful charts that have a moderate number of categories (e.g., 15 to 50), you MUST add default settings to make them readable. Set \`defaultTopN\` to 8 and \`defaultHideOthers\` to \`true\`.
            4.  **Keep Good Charts**: If a chart is insightful and has a reasonable number of categories (e.g., under 15), keep it as is without adding default settings.
            5.  **Return the Result**: Your final output must be an array of ONLY the good, configured plan objects. Do not include the discarded plans.
            **Proposed Plans and Data Samples:**
            ${JSON.stringify(plansWithData, null, 2)}
            Your response must be a valid JSON array of the refined and configured plan objects, adhering to the provided schema. Do not include any other text or explanations.
        `;
        const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
            model: settings.model as 'gemini-2.5-flash' | 'gemini-2.5-pro',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: planSchema,
            },
        }));
        jsonStr = response.text.trim();
    }
    
    return JSON.parse(jsonStr) as AnalysisPlan[];
};


export const generateAnalysisPlans = async (
    columns: ColumnProfile[], 
    sampleData: CsvData['data'],
    settings: Settings
): Promise<AnalysisPlan[]> => {
    const isApiKeySet = settings.provider === 'google' ? !!settings.geminiApiKey : !!settings.openAIApiKey;
    if (!isApiKeySet) throw new Error("API Key not provided.");

    try {
        // Step 1: Generate a broad list of candidate plans
        const candidatePlans = await generateCandidatePlans(columns, sampleData, settings, 12);
        if (candidatePlans.length === 0) return [];

        // Step 2: Execute plans on sample data to get data for the AI to review
        const sampleCsvData = { fileName: 'sample', data: sampleData };
        const plansWithDataForReview = candidatePlans.map(plan => {
            try {
                const aggregatedSample = executePlan(sampleCsvData, plan);
                return { plan, aggregatedSample: aggregatedSample.slice(0, 20) }; // Limit sample size for the prompt
            } catch (e) {
                return null;
            }
        }).filter((p): p is { plan: AnalysisPlan; aggregatedSample: CsvRow[] } => p !== null && p.aggregatedSample.length > 0);
        
        if (plansWithDataForReview.length === 0) return candidatePlans.slice(0, 4); // Fallback if all executions fail
        
        // Step 3: AI Quality Gate - Ask AI to review and refine the plans
        const refinedPlans = await refineAndConfigurePlans(plansWithDataForReview, settings);

        // Ensure we have a minimum number of plans
        let finalPlans = refinedPlans;
        if (finalPlans.length < 4 && candidatePlans.length > finalPlans.length) {
            const refinedPlanTitles = new Set(finalPlans.map(p => p.title));
            const fallbackPlans = candidatePlans.filter(p => !refinedPlanTitles.has(p.title));
            const needed = 4 - finalPlans.length;
            finalPlans.push(...fallbackPlans.slice(0, needed));
        }

        return finalPlans.slice(0, 12); // Return between 4 and 12 of the best plans

    } catch (error) {
        console.error("Error during two-step analysis plan generation:", error);
        // Fallback to simpler generation if the complex one fails
        try {
            return await generateCandidatePlans(columns, sampleData, settings, 8);
        } catch (fallbackError) {
             console.error("Fallback plan generation also failed:", fallbackError);
             throw new Error("Failed to generate any analysis plans from AI.");
        }
    }
};


export const generateSummary = async (title: string, data: CsvData['data'], settings: Settings): Promise<string> => {
    const isApiKeySet = settings.provider === 'google' ? !!settings.geminiApiKey : !!settings.openAIApiKey;
    if (!isApiKeySet) return 'AI Summaries are disabled. No API Key provided.';
    
    try {
        if (settings.provider === 'openai') {
            const languageInstruction = settings.language === 'Mandarin' 
                ? `Provide a concise, insightful summary in two languages, separated by '---'.\nFormat: English Summary --- Mandarin Summary`
                : `Provide a concise, insightful summary in ${settings.language}.`;
            const systemPrompt = `You are a business intelligence analyst. Your response must be only the summary text in the specified format. The summary should highlight key trends, outliers, or business implications. Do not just describe the data; interpret its meaning. For example, instead of "Region A has 500 sales", say "Region A is the top performer, contributing the majority of sales, which suggests a strong market presence there."`;
            const userPrompt = `The following data is for a chart titled "${title}".
Data:
${JSON.stringify(data.slice(0, 10), null, 2)} 
${data.length > 10 ? `(...and ${data.length - 10} more rows)` : ''}
${languageInstruction}`;

            const response = await withRetry(async () => {
                const res = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.openAIApiKey}` },
                    body: JSON.stringify({
                        model: settings.model,
                        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
                    })
                });
                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error?.message || `OpenAI API error: ${res.statusText}`);
                }
                return res.json();
            });
            return response.choices[0].message.content;

        } else { // Google Gemini
            const ai = new GoogleGenAI({ apiKey: settings.geminiApiKey });
            const languageInstruction = settings.language === 'Mandarin' 
                ? `Provide a concise, insightful summary in two languages, separated by '---'.\nFormat: English Summary --- Mandarin Summary`
                : `Provide a concise, insightful summary in ${settings.language}.`;
            const prompt = `
                You are a business intelligence analyst.
                The following data is for a chart titled "${title}".
                Data:
                ${JSON.stringify(data.slice(0, 10), null, 2)} 
                ${data.length > 10 ? `(...and ${data.length - 10} more rows)` : ''}
                ${languageInstruction}
                The summary should highlight key trends, outliers, or business implications. Do not just describe the data; interpret its meaning.
                For example, instead of "Region A has 500 sales", say "Region A is the top performer, contributing the majority of sales, which suggests a strong market presence there."
                Your response must be only the summary text in the specified format.
            `;
            const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
                model: settings.model as 'gemini-2.5-flash' | 'gemini-2.5-pro',
                contents: prompt,
            }));
            return response.text;
        }
    } catch (error) {
        console.error("Error generating summary:", error);
        return "Failed to generate AI summary.";
    }
};

// NEW: Function for the AI to create its core analysis summary (transparent thinking)
export const generateCoreAnalysisSummary = async (cardContext: CardContext[], columns: ColumnProfile[], settings: Settings): Promise<string> => {
    const isApiKeySet = settings.provider === 'google' ? !!settings.geminiApiKey : !!settings.openAIApiKey;
    if (!isApiKeySet || cardContext.length === 0) return "Could not generate an initial analysis summary.";

    try {
        if (settings.provider === 'openai') {
            const systemPrompt = `You are a senior data analyst. After performing an initial automated analysis of a dataset, your task is to create a concise "Core Analysis Briefing". This briefing will be shown to the user and will serve as the shared foundation of understanding for your conversation.
Your briefing should cover:
1.  **Primary Subject**: What is this data fundamentally about? (e.g., "This dataset appears to be about online sales transactions...")
2.  **Key Metrics**: What are the most important numerical columns? (e.g., "...where the key metrics are 'Sale_Amount' and 'Profit'.")
3.  **Core Dimensions**: What are the main categorical columns used for analysis? (e.g., "The data is primarily broken down by 'Region' and 'Product_Category'.")
4.  **Suggested Focus**: Based on the initial charts, what should be the focus of further analysis? (e.g., "Future analysis should focus on identifying the most profitable regions and product categories.")
Produce a single, concise paragraph in ${settings.language}. This is your initial assessment that you will share with your human counterpart.`;
            const userPrompt = `**Available Information:**
- **Dataset Columns**: ${JSON.stringify(columns.map(c => c.name))}
- **Generated Analysis Cards**: ${JSON.stringify(cardContext, null, 2)}`;
            
            const response = await withRetry(async () => {
                const res = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.openAIApiKey}` },
                    body: JSON.stringify({
                        model: settings.model,
                        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
                    })
                });
                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error?.message || `OpenAI API error: ${res.statusText}`);
                }
                return res.json();
            });
            return response.choices[0].message.content;

        } else { // Google Gemini
            const ai = new GoogleGenAI({ apiKey: settings.geminiApiKey });
            const prompt = `
                You are a senior data analyst. After performing an initial automated analysis of a dataset, your task is to create a concise "Core Analysis Briefing". This briefing will be shown to the user and will serve as the shared foundation of understanding for your conversation.
                Based on the columns and the analysis cards you have just generated, summarize the dataset's primary characteristics.
                Your briefing should cover:
                1.  **Primary Subject**: What is this data fundamentally about? (e.g., "This dataset appears to be about online sales transactions...")
                2.  **Key Metrics**: What are the most important numerical columns? (e.g., "...where the key metrics are 'Sale_Amount' and 'Profit'.")
                3.  **Core Dimensions**: What are the main categorical columns used for analysis? (e.g., "The data is primarily broken down by 'Region' and 'Product_Category'.")
                4.  **Suggested Focus**: Based on the initial charts, what should be the focus of further analysis? (e.g., "Future analysis should focus on identifying the most profitable regions and product categories.")
                **Available Information:**
                - **Dataset Columns**: ${JSON.stringify(columns.map(c => c.name))}
                - **Generated Analysis Cards**: ${JSON.stringify(cardContext, null, 2)}
                Produce a single, concise paragraph in ${settings.language}. This is your initial assessment that you will share with your human counterpart.
            `;
            const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
                model: settings.model as 'gemini-2.5-flash' | 'gemini-2.5-pro',
                contents: prompt,
            }));
            return response.text;
        }
    } catch (error) {
        console.error("Error generating core analysis summary:", error);
        return "An error occurred while the AI was forming its initial analysis.";
    }
};

const proactiveInsightSchema = {
    type: Type.OBJECT,
    properties: {
        insight: { type: Type.STRING, description: "A concise, user-facing message describing the single most important finding." },
        cardId: { type: Type.STRING, description: "The ID of the card where this insight was observed." },
    },
    required: ['insight', 'cardId'],
};

export const generateProactiveInsights = async (cardContext: CardContext[], settings: Settings): Promise<{ insight: string; cardId: string; } | null> => {
    const isApiKeySet = settings.provider === 'google' ? !!settings.geminiApiKey : !!settings.openAIApiKey;
    if (!isApiKeySet || cardContext.length === 0) return null;

    try {
        let jsonStr: string;

        if (settings.provider === 'openai') {
             const systemPrompt = `You are a proactive data analyst. Review the following summaries of data visualizations. Your task is to identify the single most commercially significant or surprising insight. This could be a major trend, a key outlier, or a dominant category that has clear business implications. Your response must be a single JSON object with 'insight' and 'cardId' keys.`;
             const userPrompt = `**Generated Analysis Cards & Data Samples:**
${JSON.stringify(cardContext, null, 2)}

Your Task:
1.  **Analyze**: Review all the cards provided.
2.  **Identify**: Find the ONE most important finding. Don't list everything, just the top insight.
3.  **Formulate**: Write a concise, user-facing message in ${settings.language} that explains this insight (e.g., "I noticed that sales in August were unusually high, you might want to investigate what caused this spike.").
4.  **Respond**: Return a JSON object containing this message and the ID of the card it relates to.`;
            
            const response = await withRetry(async () => {
                const res = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.openAIApiKey}` },
                    body: JSON.stringify({
                        model: settings.model,
                        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
                        response_format: { type: 'json_object' }
                    })
                });
                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error?.message || `OpenAI API error: ${res.statusText}`);
                }
                return res.json();
            });
            jsonStr = response.choices[0].message.content;
        
        } else { // Google Gemini
            const ai = new GoogleGenAI({ apiKey: settings.geminiApiKey });
            const prompt = `
                You are a proactive data analyst. Review the following summaries of data visualizations you have created. Your task is to identify the single most commercially significant or surprising insight. This could be a major trend, a key outlier, or a dominant category that has clear business implications.
                
                **Generated Analysis Cards & Data Samples:**
                ${JSON.stringify(cardContext, null, 2)}

                Your Task:
                1.  **Analyze**: Review all the cards provided.
                2.  **Identify**: Find the ONE most important finding. Don't list everything, just the top insight.
                3.  **Formulate**: Write a concise, user-facing message in ${settings.language} that explains this insight (e.g., "I noticed that sales in August were unusually high, you might want to investigate what caused this spike.").
                4.  **Respond**: Return a JSON object containing this message and the ID of the card it relates to.
                
                Your response must be a valid JSON object adhering to the provided schema.
            `;
            const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
                model: settings.model as 'gemini-2.5-flash' | 'gemini-2.5-pro',
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: proactiveInsightSchema,
                },
            }));
            jsonStr = response.text.trim();
        }
        return JSON.parse(jsonStr);

    } catch (error) {
        console.error("Error generating proactive insight:", error);
        return null;
    }
};


export const generateFinalSummary = async (cards: AnalysisCardData[], settings: Settings): Promise<string> => {
    const isApiKeySet = settings.provider === 'google' ? !!settings.geminiApiKey : !!settings.openAIApiKey;
    if (!isApiKeySet) return 'AI Summaries are disabled. No API Key provided.';

    const summaries = cards.map(card => {
        const summaryText = card.summary.split('---')[0]; // Prioritize the first language part of the summary
        return `Chart Title: ${card.plan.title}\nSummary: ${summaryText}`;
    }).join('\n\n');
    
    try {
        if (settings.provider === 'openai') {
            const systemPrompt = `You are a senior business strategist. You have been provided with several automated data analyses.
Your task is to synthesize these individual findings into a single, high-level executive summary in ${settings.language}.
Please provide a concise, overarching summary that connects the dots between these analyses. 
Identify the most critical business insights, potential opportunities, or risks revealed by the data as a whole.
Do not just repeat the individual summaries. Create a new, synthesized narrative.
Your response should be a single paragraph of insightful business analysis.`;
            const userPrompt = `Here are the individual analysis summaries (they are in English):
${summaries}`;
            const response = await withRetry(async () => {
                const res = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.openAIApiKey}` },
                    body: JSON.stringify({
                        model: settings.model,
                        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
                    })
                });
                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error?.message || `OpenAI API error: ${res.statusText}`);
                }
                return res.json();
            });
            return response.choices[0].message.content;

        } else { // Google Gemini
            const ai = new GoogleGenAI({ apiKey: settings.geminiApiKey });
            const prompt = `
                You are a senior business strategist. You have been provided with several automated data analyses.
                Your task is to synthesize these individual findings into a single, high-level executive summary in ${settings.language}.
                Here are the individual analysis summaries (they are in English):
                ${summaries}
                Please provide a concise, overarching summary that connects the dots between these analyses. 
                Identify the most critical business insights, potential opportunities, or risks revealed by the data as a whole.
                Do not just repeat the individual summaries. Create a new, synthesized narrative.
                Your response should be a single paragraph of insightful business analysis.
            `;
            const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
                model: settings.model as 'gemini-2.5-flash' | 'gemini-2.5-pro',
                contents: prompt,
            }));
            return response.text;
        }
    } catch (error) {
        console.error("Error generating final summary:", error);
        return "Failed to generate the final AI summary.";
    }
}

const singlePlanSchema = {
    type: Type.OBJECT,
    properties: {
      chartType: { type: Type.STRING, enum: ['bar', 'line', 'pie', 'doughnut', 'scatter'], description: 'Type of chart to generate.' },
      title: { type: Type.STRING, description: 'A concise title for the analysis.' },
      description: { type: Type.STRING, description: 'A brief explanation of what the analysis shows.' },
      aggregation: { type: Type.STRING, enum: ['sum', 'count', 'avg'], description: 'The aggregation function to apply. Omit for scatter plots.' },
      groupByColumn: { type: Type.STRING, description: 'The column to group data by (categorical). Omit for scatter plots.' },
      valueColumn: { type: Type.STRING, description: 'The column for aggregation (numerical). Not needed for "count".' },
      xValueColumn: { type: Type.STRING, description: 'The column for the X-axis of a scatter plot (numerical). Required for scatter plots.' },
      yValueColumn: { type: Type.STRING, description: 'The column for the Y-axis of a scatter plot (numerical). Required for scatter plots.' },
      defaultTopN: { type: Type.INTEGER, description: 'Optional. If the analysis has many categories, this suggests a default Top N view (e.g., 8).' },
      defaultHideOthers: { type: Type.BOOLEAN, description: 'Optional. If using defaultTopN, suggests whether to hide the "Others" category by default.' },
    },
    required: ['chartType', 'title', 'description'],
};


const multiActionChatResponseSchema = {
    type: Type.OBJECT,
    properties: {
        actions: {
            type: Type.ARRAY,
            description: "A sequence of actions for the assistant to perform.",
            items: {
                type: Type.OBJECT,
                properties: {
                    thought: { type: Type.STRING, description: "The AI's reasoning or thought process before performing the action. This explains *why* this action is being taken. This is a mandatory part of the ReAct pattern." },
                    responseType: { type: Type.STRING, enum: ['text_response', 'plan_creation', 'dom_action', 'execute_js_code', 'proceed_to_analysis'] },
                    text: { type: Type.STRING, description: "A conversational text response to the user. Required for 'text_response'." },
                    cardId: { type: Type.STRING, description: "Optional. The ID of the card this text response refers to. Used to link text to a specific chart." },
                    plan: {
                        ...singlePlanSchema,
                        description: "Analysis plan object. Required for 'plan_creation'."
                    },
                    domAction: {
                        type: Type.OBJECT,
                        description: "A DOM manipulation action for the frontend to execute. Required for 'dom_action'.",
                        properties: {
                            toolName: { type: Type.STRING, enum: ['highlightCard', 'changeCardChartType', 'showCardData', 'filterCard'] },
                            args: {
                                type: Type.OBJECT,
                                description: 'Arguments for the tool. e.g., { cardId: "..." }',
                                properties: {
                                    cardId: { type: Type.STRING, description: 'The ID of the target analysis card.' },
                                    newType: { type: Type.STRING, enum: ['bar', 'line', 'pie', 'doughnut', 'scatter'], description: "For 'changeCardChartType'." },
                                    visible: { type: Type.BOOLEAN, description: "For 'showCardData'." },
                                    column: { type: Type.STRING, description: "For 'filterCard', the column to filter on." },
                                    values: { type: Type.ARRAY, items: { type: Type.STRING }, description: "For 'filterCard', the values to include." },
                                },
                                required: ['cardId'],
                            },
                        },
                        required: ['toolName', 'args']
                    },
                    code: {
                        type: Type.OBJECT,
                        description: "For 'execute_js_code', the code to run.",
                        properties: {
                            explanation: { type: Type.STRING, description: "A brief, user-facing explanation of what the code will do." },
                            jsFunctionBody: { type: Type.STRING, description: "The body of a JavaScript function that takes 'data' and returns the transformed 'data'." },
                        },
                        required: ['explanation', 'jsFunctionBody']
                    }
                },
                required: ['responseType', 'thought']
            }
        }
    },
    required: ['actions']
};


export const generateChatResponse = async (
    columns: ColumnProfile[],
    chatHistory: ChatMessage[],
    userPrompt: string,
    cardContext: CardContext[],
    settings: Settings,
    aiCoreAnalysisSummary: string | null,
    currentView: AppView,
    rawDataSample: CsvRow[],
    longTermMemory: string[],
    dataPreparationPlan: DataPreparationPlan | null
): Promise<AiChatResponse> => {
    const isApiKeySet = settings.provider === 'google' ? !!settings.geminiApiKey : !!settings.openAIApiKey;
    if (!isApiKeySet) {
        return { actions: [{ responseType: 'text_response', text: 'Cloud AI is disabled. API Key not provided.', thought: 'API key is missing, so I must inform the user.' }] };
    }

    const categoricalCols = columns.filter(c => c.type === 'categorical' || c.type === 'date' || c.type === 'time').map(c => c.name);
    const numericalCols = columns.filter(c => c.type === 'numerical' || c.type === 'currency' || c.type === 'percentage').map(c => c.name);
    const recentHistory = chatHistory.slice(-10).map(m => `${m.sender === 'ai' ? 'You' : 'User'}: ${m.text}`).join('\n');
    
    try {
        let jsonStr: string;

        if (settings.provider === 'openai') {
            const systemPrompt = `You are an expert data analyst and business strategist, required to operate using a Reason-Act (ReAct) framework. For every action you take, you must first explain your reasoning in the 'thought' field, and then define the action itself. Your goal is to respond to the user by providing insightful analysis and breaking down your response into a sequence of these thought-action pairs. Your final conversational responses should be in ${settings.language}.
Your output MUST be a single JSON object with an "actions" key containing an array of action objects.`;
            const userPromptWithContext = `**CORE ANALYSIS BRIEFING (Your Internal Summary):**
---
${aiCoreAnalysisSummary || "No core analysis has been performed yet."}
---
**DATA PREPARATION LOG (How the raw data was initially cleaned):**
---
${dataPreparationPlan ? `Explanation: ${dataPreparationPlan.explanation}\nCode Executed: \`\`\`javascript\n${dataPreparationPlan.jsFunctionBody}\n\`\`\`` : "No AI-driven data preparation was performed."}
---
**LONG-TERM MEMORY (Relevant past context, ordered by relevance):**
---
${longTermMemory.length > 0 ? longTermMemory.join('\n---\n') : "No specific long-term memories seem relevant to this query."}
---
**Your Knowledge Base (Real-time Info):**
- **Dataset Columns**:
    - Categorical: ${categoricalCols.join(', ')}
    - Numerical: ${numericalCols.join(', ')}
- **Analysis Cards on Screen (Sample of up to 100 rows each)**:
    ${cardContext.length > 0 ? JSON.stringify(cardContext, null, 2) : "No cards yet."}
- **Raw Data Sample (first 20 rows):**
    ${rawDataSample.length > 0 ? JSON.stringify(rawDataSample, null, 2) : "No raw data available."}
**Recent Conversation (for flow):**
${recentHistory}
**The user's latest message is:** "${userPrompt}"
**Your Available Actions & Tools:**
1.  **text_response**: For conversation. If your text explains a specific card, you MUST include its 'cardId'.
2.  **plan_creation**: To create a NEW chart. Use a 'defaultTopN' of 8 for readability on high-cardinality columns.
3.  **dom_action**: To INTERACT with an EXISTING card ('highlightCard', 'changeCardChartType', 'showCardData', 'filterCard').
4.  **execute_js_code**: For COMPLEX TASKS like creating new columns or complex filtering.
5.  **proceed_to_analysis**: DEPRECATED.
**Decision-Making Process (ReAct Framework):**
- **THINK (Reason)**: First, you MUST reason about the user's request. What is their goal? Can it be answered from memory, or does it require data analysis? What is the first logical step? Formulate this reasoning and place it in the 'thought' field of your action. This field is MANDATORY for every action.
- **ACT**: Based on your thought, choose the most appropriate action from your toolset and define its parameters in the same action object.
**Multi-Step Task Planning:** For complex requests that require multiple steps (e.g., "compare X and Y, then summarize"), you MUST adopt a planner persona.
1.  **Formulate a Plan**: In the \`thought\` of your VERY FIRST action, outline your step-by-step plan. For example: \`thought: "Okay, this is a multi-step request. My plan is: 1. Isolate the data for X. 2. Create an analysis for X. 3. Isolate the data for Y. 4. Create an analysis for Y. 5. Summarize the findings from both analyses."\`
2.  **Execute the Plan**: Decompose your plan into a sequence of \`actions\`. Each action should have its own \`thought\` explaining that specific step. This allows you to chain tools together to solve the problem.
- **CRITICAL**: If the user asks where a specific data value comes from (like 'Software Product 10') or how the data was cleaned, you MUST consult the **DATA PREPARATION LOG**. Use a 'text_response' to explain the transformation in simple, non-technical language. You can include snippets of the code using markdown formatting to illustrate your point.
- **Suggest Next Steps**: After successfully answering the user's request, you should add one final \`text_response\` action to proactively suggest a logical next step or a relevant follow-up question. This guides the user and makes the analysis more conversational. Example: "Now that we've seen the regional breakdown, would you like to explore the top-performing product categories within the East region?"
- **EXAMPLE of Chaining**:
  1.  Action 1: { thought: "The user is asking for profit margin, but that column doesn't exist. I need to calculate it from 'Revenue' and 'Cost'.", responseType: 'execute_js_code', code: { ... } }
  2.  Action 2: { thought: "Now that I have the 'Profit Margin' column, I need to create a chart to find the product with the highest average margin.", responseType: 'plan_creation', plan: { ... } }
  3.  Action 3: { thought: "The chart is created. I can now see the result and answer the user's question, explaining what I did.", responseType: 'text_response', text: "I've calculated the profit margin and created a new chart. It looks like 'Product A' has the highest margin." }
- Always be conversational. Use 'text_response' actions to acknowledge the user and explain what you are doing, especially after a complex series of actions.`;
            
            const response = await withRetry(async () => {
                const res = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.openAIApiKey}` },
                    body: JSON.stringify({
                        model: settings.model,
                        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPromptWithContext }],
                        response_format: { type: 'json_object' }
                    })
                });
                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error?.message || `OpenAI API error: ${res.statusText}`);
                }
                return res.json();
            });
            jsonStr = response.choices[0].message.content;

        } else { // Google Gemini
            const ai = new GoogleGenAI({ apiKey: settings.geminiApiKey });
            const prompt = `
                You are an expert data analyst and business strategist, required to operate using a Reason-Act (ReAct) framework. For every action you take, you must first explain your reasoning in the 'thought' field, and then define the action itself. Your goal is to respond to the user by providing insightful analysis and breaking down your response into a sequence of these thought-action pairs. Your final conversational responses should be in ${settings.language}.
                
                **CORE ANALYSIS BRIEFING (Your Internal Summary):**
                ---
                ${aiCoreAnalysisSummary || "No core analysis has been performed yet."}
                ---
                **DATA PREPARATION LOG (How the raw data was initially cleaned):**
                ---
                ${dataPreparationPlan ? `Explanation: ${dataPreparationPlan.explanation}\nCode Executed: \`\`\`javascript\n${dataPreparationPlan.jsFunctionBody}\n\`\`\`` : "No AI-driven data preparation was performed."}
                ---
                **LONG-TERM MEMORY (Relevant past context, ordered by relevance):**
                ---
                ${longTermMemory.length > 0 ? longTermMemory.join('\n---\n') : "No specific long-term memories seem relevant to this query."}
                ---
                **Your Knowledge Base (Real-time Info):**
                - **Dataset Columns**:
                    - Categorical: ${categoricalCols.join(', ')}
                    - Numerical: ${numericalCols.join(', ')}
                - **Analysis Cards on Screen (Sample of up to 100 rows each)**:
                    ${cardContext.length > 0 ? JSON.stringify(cardContext, null, 2) : "No cards yet."}
                - **Raw Data Sample (first 20 rows):**
                    ${rawDataSample.length > 0 ? JSON.stringify(rawDataSample, null, 2) : "No raw data available."}

                **Recent Conversation (for flow):**
                ${recentHistory}

                **The user's latest message is:** "${userPrompt}"

                **Your Available Actions & Tools:**
                You MUST respond by creating a sequence of one or more actions in a JSON object.
                1.  **text_response**: For conversation. If your text explains a specific card, you MUST include its 'cardId'.
                2.  **plan_creation**: To create a NEW chart. Use a 'defaultTopN' of 8 for readability on high-cardinality columns.
                3.  **dom_action**: To INTERACT with an EXISTING card ('highlightCard', 'changeCardChartType', 'showCardData', 'filterCard').
                4.  **execute_js_code**: For COMPLEX TASKS like creating new columns or complex filtering.
                5.  **proceed_to_analysis**: DEPRECATED.

                **Decision-Making Process (ReAct Framework):**
                - **THINK (Reason)**: First, you MUST reason about the user's request. What is their goal? Can it be answered from memory, or does it require data analysis? What is the first logical step? Formulate this reasoning and place it in the 'thought' field of your action. This field is MANDATORY for every action.
                - **ACT**: Based on your thought, choose the most appropriate action from your toolset and define its parameters in the same action object.
                **Multi-Step Task Planning:** For complex requests that require multiple steps (e.g., "compare X and Y, then summarize"), you MUST adopt a planner persona.
                1.  **Formulate a Plan**: In the \`thought\` of your VERY FIRST action, outline your step-by-step plan. For example: \`thought: "Okay, this is a multi-step request. My plan is: 1. Isolate the data for X. 2. Create an analysis for X. 3. Isolate the data for Y. 4. Create an analysis for Y. 5. Summarize the findings from both analyses."\`
                2.  **Execute the Plan**: Decompose your plan into a sequence of \`actions\`. Each action should have its own \`thought\` explaining that specific step. This allows you to chain tools together to solve the problem.
                - **CRITICAL**: If the user asks where a specific data value comes from (like 'Software Product 10') or how the data was cleaned, you MUST consult the **DATA PREPARATION LOG**. Use a 'text_response' to explain the transformation in simple, non-technical language. You can include snippets of the code using markdown formatting to illustrate your point.
                - **Suggest Next Steps**: After successfully answering the user's request, you should add one final \`text_response\` action to proactively suggest a logical next step or a relevant follow-up question. This guides the user and makes the analysis more conversational. Example: "Now that we've seen the regional breakdown, would you like to explore the top-performing product categories within the East region?"
                - **EXAMPLE of Chaining**:
                  1.  Action 1: { thought: "The user is asking for profit margin, but that column doesn't exist. I need to calculate it from 'Revenue' and 'Cost'.", responseType: 'execute_js_code', code: { ... } }
                  2.  Action 2: { thought: "Now that I have the 'Profit Margin' column, I need to create a chart to find the product with the highest average margin.", responseType: 'plan_creation', plan: { ... } }
                  3.  Action 3: { thought: "The chart is created. I can now see the result and answer the user's question, explaining what I did.", responseType: 'text_response', text: "I've calculated the profit margin and created a new chart. It looks like 'Product A' has the highest margin." }
                - Always be conversational. Use 'text_response' actions to acknowledge the user and explain what you are doing, especially after a complex series of actions.
                Your output MUST be a single JSON object with an "actions" key containing an array of action objects.
            `;
            const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
                model: settings.model as 'gemini-2.5-flash' | 'gemini-2.5-pro',
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: multiActionChatResponseSchema,
                },
            }));
            jsonStr = response.text.trim();
        }

        const chatResponse = JSON.parse(jsonStr) as AiChatResponse;

        if (!chatResponse.actions || !Array.isArray(chatResponse.actions)) {
            throw new Error("Invalid response structure from AI: 'actions' array not found.");
        }
        return chatResponse;
    } catch (error) {
        console.error("Error generating chat response:", error);
        throw new Error(`Failed to get a valid response from the AI. ${error instanceof Error ? error.message : ''}`);
    }
};