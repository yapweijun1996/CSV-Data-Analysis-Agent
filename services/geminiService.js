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
  return cleanJson(response.text);
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
  return response.text;
};

const validatePlan = plan => {
  if (!plan || typeof plan !== 'object') return false;
  if (!plan.chartType || !plan.title) return false;
  return true;
};

export const generateDataPreparationPlan = async (columns, sampleData, settings) => {
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
  const userPrompt = `Columns: ${JSON.stringify(columns)}
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

const buildAnalysisPlanPrompt = (columns, sampleData, numPlans) => {
  const categorical = columns.filter(c => c.type === 'categorical').map(c => c.name);
  const numerical = columns.filter(c => c.type === 'numerical').map(c => c.name);
  return `You are a senior business intelligence analyst.
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

export const generateAnalysisPlans = async (columns, sampleData, settings) => {
  const provider = settings.provider || 'google';
  const prompt = buildAnalysisPlanPrompt(columns, sampleData, 10);
  let plans;
  if (provider === 'openai') {
    if (!settings.openAIApiKey) return [];
    plans = ensureArray(await callOpenAIJson(settings, 'Return only valid JSON.', prompt));
  } else {
    if (!settings.geminiApiKey) return [];
    plans = ensureArray(await callGeminiJson(settings, prompt));
  }
  return plans.filter(validatePlan).slice(0, 10);
};

export const generateSummary = async (title, data, settings) => {
  const provider = settings.provider || 'google';
  const isApiKeySet =
    provider === 'google' ? !!settings.geminiApiKey : !!settings.openAIApiKey;
  if (!isApiKeySet) return 'AI Summaries are disabled. No API Key provided.';

  const instruction =
    settings.language === 'Mandarin'
      ? `Provide a concise, insightful summary in two languages, separated by '---'.
Format: English Summary --- Mandarin Summary`
      : `Provide a concise, insightful summary in ${settings.language}.`;

  const body = `The data below is for a chart titled "${title}".
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

export const generateCoreAnalysisSummary = async (cardContext, columns, settings) => {
  const provider = settings.provider || 'google';
  const isApiKeySet =
    provider === 'google' ? !!settings.geminiApiKey : !!settings.openAIApiKey;
  if (!isApiKeySet || !cardContext || cardContext.length === 0) {
    return 'Could not generate an initial analysis summary.';
  }

  const prompt = `You are a senior data analyst. Create a concise "Core Analysis Briefing" in ${settings.language}.
Cover:
1. Primary subject of the dataset
2. Key numerical metrics
3. Core categorical dimensions
4. Suggested focus for further analysis
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

export const generateFinalSummary = async (cards, settings) => {
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

  const prompt = `You are a senior business strategist. Given the summaries below, produce one executive-level overview in ${settings.language}.
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
  rawDataSample
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

  const context = `**Core Briefing:** ${aiCoreAnalysisSummary || 'None yet.'}
**Current View:** ${currentView}
**Columns**
- Categorical: ${categorical.join(', ') || 'None'}
- Numerical: ${numerical.join(', ') || 'None'}
**Cards:** ${JSON.stringify(cardContext.slice(0, 6), null, 2)}
**Sample Data:** ${JSON.stringify(rawDataSample.slice(0, 20), null, 2)}
**Conversation History:** ${history}
**User:** ${userPrompt}
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
