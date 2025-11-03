import { GoogleGenAI } from '@google/genai';
import { executePlan } from '../utils/dataProcessor.js';

const withRetry = async (fn, retries = 2) => {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.warn(`API call failed, retrying (${attempt + 1}/${retries})`, error);
      if (attempt < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }
  throw lastError;
};

const cleanJson = text => {
  if (!text) return null;
  const trimmed = text.trim();
  const withoutFence = trimmed.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(withoutFence);
  } catch (error) {
    console.error('Failed to parse JSON returned by the AI:', withoutFence);
    throw new Error('The AI response cannot be parsed as JSON.');
  }
};

const ensureArray = value => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const firstArray = Object.values(value).find(v => Array.isArray(v));
    if (firstArray) return firstArray;
  }
  throw new Error('The AI response is not in the expected array format.');
};

const formatMetadataContext = (metadata, options = {}) => {
  if (!metadata || typeof metadata !== 'object') {
    return '';
  }
  const {
    includeLeadingRows = true,
    leadingRowLimit = 5,
    includeContextRows = true,
    contextRowLimit = 10,
  } = options;

  const lines = [];

  if (metadata.reportTitle) {
    lines.push(`Report title: ${metadata.reportTitle}`);
  }

  if (Array.isArray(metadata.headerRow) && metadata.headerRow.length) {
    lines.push(`Detected header columns: ${metadata.headerRow.join(', ')}`);
  } else if (Array.isArray(metadata.rawHeaderValues) && metadata.rawHeaderValues.length) {
    lines.push(`Header row text: ${metadata.rawHeaderValues.join(', ')}`);
  }

  if (typeof metadata.totalRowsBeforeFilter === 'number') {
    lines.push(`Rows before cleaning: ${metadata.totalRowsBeforeFilter}`);
  }
  if (typeof metadata.cleanedRowCount === 'number') {
    lines.push(`Rows after cleaning: ${metadata.cleanedRowCount}`);
  }
  if (typeof metadata.removedSummaryRowCount === 'number' && metadata.removedSummaryRowCount > 0) {
    lines.push(`Filtered summary rows: ${metadata.removedSummaryRowCount}`);
  }

  if (
    includeContextRows &&
    Array.isArray(metadata.contextRows) &&
    metadata.contextRows.length
  ) {
    const limit = Math.max(1, contextRowLimit);
    const contextPreview = metadata.contextRows
      .slice(0, limit)
      .map((row, index) => {
        if (!Array.isArray(row)) return '';
        const text = row.filter(cell => cell).join(' | ');
        const label = `Row ${index + 1}`;
        return text ? `${label}: ${text}` : '';
      })
      .filter(Boolean);
    if (contextPreview.length) {
      lines.push(`Context rows:\n${contextPreview.join('\n')}`);
    }
  } else if (
    includeLeadingRows &&
    Array.isArray(metadata.leadingRows) &&
    metadata.leadingRows.length
  ) {
    const leading = metadata.leadingRows
      .slice(0, leadingRowLimit)
      .map((row, index) => {
        if (!Array.isArray(row)) return '';
        const text = row.filter(cell => cell).join(' | ');
        return text ? `Leading row ${index + 1}: ${text}` : '';
      })
      .filter(Boolean);
    if (leading.length) {
      lines.push(`Leading rows:\n${leading.join('\n')}`);
    }
  }

  return lines.join('\n');
};

const callOpenAIJson = async (settings, systemPrompt, userPrompt) => {
  const response = await withRetry(async () => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.openAIApiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error?.message || `OpenAI API error: ${res.statusText}`);
    }
    return res.json();
  });
  return cleanJson(response.choices[0].message.content);
};

const callOpenAIText = async (settings, systemPrompt, userPrompt) => {
  const response = await withRetry(async () => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.openAIApiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error?.message || `OpenAI API error: ${res.statusText}`);
    }
    return res.json();
  });
  return response.choices[0].message.content;
};

const callGeminiClient = settings => {
  const key = settings.geminiApiKey;
  if (!key) throw new Error('Gemini API key is missing.');
  return new GoogleGenAI({ apiKey: key });
};

const callGeminiJson = async (settings, prompt) => {
  const modelId =
    settings.model === 'gemini-2.5-flash' || settings.model === 'gemini-2.5-pro'
      ? settings.model
      : 'gemini-2.5-pro';
  const ai = callGeminiClient(settings);
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    })
  );
  const rawText = typeof response.text === 'function' ? await response.text() : response.text;
  return cleanJson(rawText);
};

const callGeminiText = async (settings, prompt) => {
  const modelId =
    settings.model === 'gemini-2.5-flash' || settings.model === 'gemini-2.5-pro'
      ? settings.model
      : 'gemini-2.5-pro';
  const ai = callGeminiClient(settings);
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: modelId,
      contents: prompt,
    })
  );
  const rawText = typeof response.text === 'function' ? await response.text() : response.text;
  return rawText;
};

const SUPPORTED_CHART_TYPES = new Set(['bar', 'line', 'pie', 'doughnut', 'scatter']);
const SUPPORTED_AGGREGATIONS = new Set(['sum', 'count', 'avg']);

const normalisePlanShape = (plan, columns = []) => {
  if (!plan || typeof plan !== 'object') {
    return null;
  }
  const normalized = { ...plan };
  const title = normalized.title || 'Untitled Analysis';
  normalized.title = title;

  const maybeChartType =
    typeof normalized.chartType === 'string'
      ? normalized.chartType.toLowerCase()
      : '';
  normalized.chartType = SUPPORTED_CHART_TYPES.has(maybeChartType)
    ? maybeChartType
    : 'bar';

  if (normalized.chartType === 'scatter') {
    return normalized;
  }

  const maybeAggregation =
    typeof normalized.aggregation === 'string'
      ? normalized.aggregation.toLowerCase()
      : '';
  const hasNumericValueColumn = columns.some(
    column =>
      column.type === 'numerical' &&
      column.name &&
      normalized.valueColumn &&
      column.name.toLowerCase() === String(normalized.valueColumn).toLowerCase()
  );

  if (SUPPORTED_AGGREGATIONS.has(maybeAggregation)) {
    normalized.aggregation = maybeAggregation;
  } else {
    normalized.aggregation = hasNumericValueColumn ? 'sum' : 'count';
  }

  if (normalized.aggregation === 'count') {
    normalized.valueColumn = normalized.valueColumn || null;
  }

  return normalized;
};

export const generateDataPreparationPlan = async (columns, sampleData, settings, metadata = null) => {
  const provider = settings.provider || 'google';
  if (provider === 'openai' && !settings.openAIApiKey) {
    return { explanation: 'No transformation needed as API key is not set.', jsFunctionBody: null, outputColumns: columns };
  }
  if (provider === 'google' && !settings.geminiApiKey) {
    return { explanation: 'No transformation needed as API key is not set.', jsFunctionBody: null, outputColumns: columns };
  }

  const systemPrompt = `You are an expert data engineer. Analyze the raw dataset and decide whether it needs cleaning or reshaping.
If needed, provide a JavaScript function body that transforms the array of row objects and describe the resulting columns.
Always respond with JSON: { "explanation": string, "jsFunctionBody": string | null, "outputColumns": [{ "name": string, "type": "numerical" | "categorical" }] }.`;
  const metadataContext = formatMetadataContext(metadata, {
    leadingRowLimit: 10,
    contextRowLimit: 20,
  });
  const contextSection = metadataContext ? `Dataset context:\n${metadataContext}\n\n` : '';
  const userPrompt = `${contextSection}Columns: ${JSON.stringify(columns)}
Sample rows: ${JSON.stringify(sampleData.slice(0, 20), null, 2)}
- Explain the transformation in plain language.
- If no changes are required, set "jsFunctionBody" to null and keep outputColumns identical.`;

  let plan;
  if (provider === 'openai') {
    plan = await callOpenAIJson(settings, systemPrompt, userPrompt);
  } else {
    plan = await callGeminiJson(settings, `${systemPrompt}\n${userPrompt}`);
  }

  if (!plan) {
    return { explanation: 'No changes applied.', jsFunctionBody: null, outputColumns: columns };
  }

  if (!plan.outputColumns || !Array.isArray(plan.outputColumns) || plan.outputColumns.length === 0) {
    plan.outputColumns = columns;
  }

  if (plan.jsFunctionBody) {
    try {
      const transformFunction = new Function('data', plan.jsFunctionBody);
      const result = transformFunction(sampleData.slice(0, 10));
      if (!Array.isArray(result)) {
        throw new Error('Transform result is not an array.');
      }
    } catch (error) {
      console.warn('AI-generated transformation code failed; skipping this transformation.', error);
      plan.jsFunctionBody = null;
      plan.explanation = `${plan.explanation || 'AI transformation failed.'} Transformation skipped.`;
      plan.outputColumns = columns;
    }
  }

  return plan;
};

const buildAnalysisPlanPrompt = (columns, sampleData, numPlans, metadata) => {
  const categorical = columns.filter(c => c.type === 'categorical').map(c => c.name);
  const numerical = columns.filter(c => c.type === 'numerical').map(c => c.name);
  const metadataContext = formatMetadataContext(metadata, {
    leadingRowLimit: 10,
    contextRowLimit: 20,
  });
  const contextSection = metadataContext ? `Report context:\n${metadataContext}\n` : '';
  return `You are a senior business intelligence analyst.
${contextSection}
Columns:
- Categorical: ${categorical.join(', ') || 'None'}
- Numerical: ${numerical.join(', ') || 'None'}
Sample rows:
${JSON.stringify(sampleData.slice(0, 5), null, 2)}
Generate up to ${numPlans} insightful analysis plans as a JSON array. Each plan must have:
- chartType (bar|line|pie|doughnut|scatter)
- title
- description
- aggregation (sum|count|avg) when applicable
- groupByColumn and valueColumn when applicable
Prefer high-value aggregations and avoid tiny fonts (too many categories).`;
};

export const generateAnalysisPlans = async (columns, sampleData, settings, metadata = null) => {
  const provider = settings.provider || 'google';
  const prompt = buildAnalysisPlanPrompt(columns, sampleData, 10, metadata);
  let plans;
  if (provider === 'openai') {
    if (!settings.openAIApiKey) return [];
    plans = ensureArray(await callOpenAIJson(settings, 'Return only valid JSON.', prompt));
  } else {
    if (!settings.geminiApiKey) return [];
    plans = ensureArray(await callGeminiJson(settings, prompt));
  }
  return plans
    .map(plan => normalisePlanShape(plan, columns))
    .filter(Boolean)
    .slice(0, 10);
};

export const generateSummary = async (title, data, settings, metadata = null) => {
  const provider = settings.provider || 'google';
  const isApiKeySet =
    provider === 'google' ? !!settings.geminiApiKey : !!settings.openAIApiKey;
  if (!isApiKeySet) return 'AI Summaries are disabled. No API Key provided.';

  const instruction =
    settings.language === 'Mandarin'
      ? `Provide a concise, insightful summary in two languages, separated by '---'.
Format: English Summary --- Mandarin Summary`
      : `Provide a concise, insightful summary in ${settings.language}.`;

  const metadataContext = formatMetadataContext(metadata, {
    includeLeadingRows: false,
    contextRowLimit: 12,
  });
  const metadataSection = metadataContext ? `Dataset context:\n${metadataContext}\n\n` : '';
  const body = `${metadataSection}The data below is for a chart titled "${title}".
Data sample:
${JSON.stringify(data.slice(0, 20), null, 2)}
${data.length > 20 ? `...and ${data.length - 20} more rows.` : ''}
${instruction}
Highlight trends, outliers, or business implications.`;

  if (provider === 'openai') {
    return callOpenAIText(
      settings,
      'You are a business intelligence analyst. Respond with the summary text only.',
      body
    );
  }
  return callGeminiText(
    settings,
    `You are a business intelligence analyst. Respond with the summary text only.\n${body}`
  );
};

export const generateCoreAnalysisSummary = async (cardContext, columns, settings, metadata = null) => {
  const provider = settings.provider || 'google';
  const isApiKeySet =
    provider === 'google' ? !!settings.geminiApiKey : !!settings.openAIApiKey;
  if (!isApiKeySet || !cardContext || cardContext.length === 0) {
    return 'Could not generate an initial analysis summary.';
  }

  const metadataContext = formatMetadataContext(metadata, {
    includeLeadingRows: false,
    contextRowLimit: 12,
  });
  const metadataSection = metadataContext ? `Dataset context:\n${metadataContext}\n` : '';

  const prompt = `You are a senior data analyst. Create a concise "Core Analysis Briefing" in ${settings.language}.
Cover:
1. Primary subject of the dataset
2. Key numerical metrics
3. Core categorical dimensions
4. Suggested focus for further analysis
${metadataSection}
Columns: ${JSON.stringify(columns.map(c => c.name))}
Analysis cards: ${JSON.stringify(cardContext.slice(0, 6), null, 2)}
Return a single short paragraph.`;

  if (provider === 'openai') {
    return callOpenAIText(
      settings,
      'Respond with a single concise paragraph.',
      prompt
    );
  }
  return callGeminiText(settings, prompt);
};

export const generateFinalSummary = async (cards, settings, metadata = null) => {
  const provider = settings.provider || 'google';
  const isApiKeySet =
    provider === 'google' ? !!settings.geminiApiKey : !!settings.openAIApiKey;
  if (!isApiKeySet) return 'AI Summaries are disabled. No API Key provided.';

  const summaries = cards
    .map(card => {
      const summaryText = (card.summary || '').split('---')[0];
      return `Title: ${card.plan?.title || 'Unknown'}\nSummary: ${summaryText}`;
    })
    .join('\n\n');

  const metadataContext = formatMetadataContext(metadata, {
    includeLeadingRows: false,
    contextRowLimit: 12,
  });
  const metadataSection = metadataContext ? `Dataset context:\n${metadataContext}\n\n` : '';

  const prompt = `You are a senior business strategist. Given the summaries below, produce one executive-level overview in ${settings.language}.
${metadataSection}
Summaries:
${summaries}
Provide a single paragraph that connects the key insights, risks, or opportunities.`;

  if (provider === 'openai') {
    return callOpenAIText(
      settings,
      'Produce a single executive summary paragraph.',
      prompt
    );
  }
  return callGeminiText(settings, prompt);
};

export const generateChatResponse = async (
  columns,
  chatHistory,
  userPrompt,
  cardContext,
  settings,
  aiCoreAnalysisSummary,
  currentView,
  rawDataSample,
  metadata = null
) => {
  const provider = settings.provider || 'google';
  const isApiKeySet =
    provider === 'google' ? !!settings.geminiApiKey : !!settings.openAIApiKey;
  if (!isApiKeySet) {
    return { actions: [{ responseType: 'text_response', text: 'Cloud AI is disabled. API Key not provided.' }] };
  }

  const categorical = columns.filter(c => c.type === 'categorical').map(c => c.name);
  const numerical = columns.filter(c => c.type === 'numerical').map(c => c.name);
  const history = chatHistory.map(m => `${m.sender}: ${m.text}`).join('\n');
  const recentSystemMessages = chatHistory
    .filter(msg => msg.sender === 'system')
    .slice(-12)
    .map(msg => `- [${msg.type || 'system'}] ${msg.text}`)
    .join('\n');
  const systemSection = recentSystemMessages
    ? `**System Messages (recent):**\n${recentSystemMessages}\n`
    : '';

  const metadataContext = formatMetadataContext(metadata, {
    leadingRowLimit: 10,
    contextRowLimit: 15,
  });
  const datasetTitle = metadata?.reportTitle || 'Not detected';
  const metadataSection = metadataContext ? `**Dataset Context:**\n${metadataContext}\n` : '';

  const context = `**Dataset Title:** ${datasetTitle}
${metadataSection}**Core Briefing:** ${aiCoreAnalysisSummary || 'None yet.'}
**Current View:** ${currentView}
**Columns**
- Categorical: ${categorical.join(', ') || 'None'}
- Numerical: ${numerical.join(', ') || 'None'}
**Cards:** ${JSON.stringify(cardContext.slice(0, 6), null, 2)}
**Sample Data:** ${JSON.stringify(rawDataSample.slice(0, 20), null, 2)}
${systemSection}**Conversation History:** ${history}
**User:** ${userPrompt}
**Self-Healing Rules:**
- When prior system messages indicate validation failures, infer the missing fields and retry automatically.
- Always provide a complete, executable plan: include chartType (bar|line|pie|doughnut|scatter), aggregation, groupByColumn, and valueColumn when required.
- If unsure, choose sensible defaults (e.g., bar chart with sum aggregation on a numeric column).
- Prefer resolving issues without asking the user for clarification when the dataset context allows it.
**Available DOM Actions (use responseType "dom_action"):**
- highlightCard: {"toolName":"highlightCard","cardId":string,"scrollIntoView":boolean?}
- clearHighlight: {"toolName":"clearHighlight"}
- changeCardChartType: {"toolName":"changeCardChartType","cardId":string,"chartType":"bar"|"line"|"pie"|"doughnut"|"scatter"}
- toggleCardData / showCardData: {"toolName":"toggleCardData","cardId":string,"visible":boolean?}
- setCardTopN: {"toolName":"setCardTopN","cardId":string,"topN":number|"all","hideOthers":boolean?}
- setCardHideOthers: {"toolName":"setCardHideOthers","cardId":string,"hideOthers":boolean}
- clearCardSelection: {"toolName":"clearCardSelection","cardId":string}
- resetCardZoom: {"toolName":"resetCardZoom","cardId":string}
- setRawDataVisibility: {"toolName":"setRawDataVisibility","visible":boolean}
- setRawDataFilter: {"toolName":"setRawDataFilter","query":string,"wholeWord":boolean?}
- setRawDataWholeWord: {"toolName":"setRawDataWholeWord","wholeWord":boolean}
- setRawDataSort: {"toolName":"setRawDataSort","column":string|null,"direction":"ascending"|"descending"?}
- removeRawDataRows: {"toolName":"removeRawDataRows","column":string,"values":string|string[],"operator":"equals"|"contains"|"starts_with"|"ends_with"|"is_empty","caseSensitive":boolean?}
 - removeRawDataRows: {"toolName":"removeRawDataRows","column":string?,"values":string|string[],"operator":"equals"|"contains"|"starts_with"|"ends_with"|"is_empty","caseSensitive":boolean?,"rowIndex":number?,"rowIndices":number[]?}
Always include a "domAction" object when responseType is "dom_action". If the action cannot be completed, return a text_response explaining why instead.
Return JSON: { "actions": [ { "responseType": "text_response" | "plan_creation" | "dom_action" | "execute_js_code", ... } ] }.
When referring to a specific card, include its "cardId".
If creating a plan, include the plan object with required fields.
You may include multiple actions to fulfill complex requests.`;

  let result;
  if (provider === 'openai') {
    result = await callOpenAIJson(
      settings,
      'You are a proactive BI copilot. Always respond with valid JSON.',
      context
    );
  } else {
    result = await callGeminiJson(
      settings,
      `You are a proactive BI copilot. Always respond with valid JSON.\n${context}`
    );
  }

  if (!result || !Array.isArray(result.actions)) {
    throw new Error('The AI response does not contain a valid actions array.');
  }

  return result;
};

export const regeneratePlansWithTransformation = async (cards, newData, settings) => {
  const plans = cards.map(card => card.plan).filter(Boolean);
  if (!plans.length) return [];

  const createdCards = [];
  for (const plan of plans) {
    try {
      const aggregatedData = executePlan(newData, plan);
      createdCards.push({
        id: `card-${Date.now()}-${Math.random()}`,
        plan,
        aggregatedData,
      });
    } catch (error) {
      console.warn('Failed to regenerate chart with existing plan:', error);
    }
  }
  return createdCards;
};
