import { executePlan } from '../utils/dataProcessor.js';

const GENAI_MODULE_URL = 'https://aistudiocdn.com/@google/genai@1.28.0';
let googleModulePromise = null;
let GoogleGenAIClass = null;
let GeminiType = null;
let planArraySchema = null;
let singlePlanSchema = null;
let dataPreparationSchemaCache = null;
let multiActionChatResponseSchemaCache = null;
let proactiveInsightSchemaCache = null;

const loadGoogleModule = async () => {
  if (!googleModulePromise) {
    googleModulePromise = import(/* @vite-ignore */ GENAI_MODULE_URL);
  }
  return googleModulePromise;
};

const getGoogleGenAI = async () => {
  if (GoogleGenAIClass) return GoogleGenAIClass;
  const mod = await loadGoogleModule();
  const ctor = mod?.GoogleGenAI || mod?.default?.GoogleGenAI || mod?.default;
  if (!GeminiType) {
    GeminiType = mod?.Type || mod?.default?.Type || null;
  }
  if (!ctor) {
    throw new Error('Failed to load Google Gemini client library.');
  }
  GoogleGenAIClass = ctor;
  return GoogleGenAIClass;
};

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

const getSinglePlanSchema = () => {
  if (!GeminiType) return null;
  if (!singlePlanSchema) {
    singlePlanSchema = {
      type: GeminiType.OBJECT,
      properties: {
        chartType: {
          type: GeminiType.STRING,
          enum: ['bar', 'line', 'pie', 'doughnut', 'scatter'],
          description: 'Type of chart to generate.',
        },
        title: {
          type: GeminiType.STRING,
          description: 'A concise title for the analysis.',
        },
        description: {
          type: GeminiType.STRING,
          description: 'A brief explanation of what the analysis shows.',
        },
        aggregation: {
          type: GeminiType.STRING,
          enum: ['sum', 'count', 'avg'],
          description: 'Aggregation to apply; omit for scatter plots.',
        },
        groupByColumn: {
          type: GeminiType.STRING,
          description: 'Categorical column to group by; omit for scatter plots.',
        },
        valueColumn: {
          type: GeminiType.STRING,
          description: 'Numeric column for aggregation. Optional for count.',
        },
        xValueColumn: {
          type: GeminiType.STRING,
          description: 'Numeric column for scatter plot X axis.',
        },
        yValueColumn: {
          type: GeminiType.STRING,
          description: 'Numeric column for scatter plot Y axis.',
        },
        defaultTopN: {
          type: GeminiType.INTEGER,
          description: 'Optional Top-N default for charts with many categories.',
        },
        defaultHideOthers: {
          type: GeminiType.BOOLEAN,
          description: 'Whether to hide the "Others" bucket when Top-N is used.',
        },
      },
      required: ['chartType', 'title', 'description'],
    };
  }
  return singlePlanSchema;
};

const getPlanArraySchema = () => {
  if (!GeminiType) return null;
  if (!planArraySchema) {
    planArraySchema = {
      type: GeminiType.ARRAY,
      items: getSinglePlanSchema(),
    };
  }
  return planArraySchema;
};

const getDataPreparationSchema = () => {
  if (!GeminiType) return null;
  if (!dataPreparationSchemaCache) {
    dataPreparationSchemaCache = {
      type: GeminiType.OBJECT,
      properties: {
        explanation: {
          type: GeminiType.STRING,
          description: 'Plain-language explanation of the transformation.',
        },
        jsFunctionBody: {
          type: GeminiType.STRING,
          description:
            'JavaScript function body that transforms the data array. Use null when no change is required.',
        },
        outputColumns: {
          type: GeminiType.ARRAY,
          description: 'Column profiles describing the transformed data.',
          items: {
            type: GeminiType.OBJECT,
            properties: {
              name: { type: GeminiType.STRING, description: 'Column name.' },
              type: {
                type: GeminiType.STRING,
                enum: ['numerical', 'categorical'],
                description: 'Column data type.',
              },
            },
            required: ['name', 'type'],
          },
        },
      },
      required: ['explanation', 'outputColumns'],
    };
  }
  return dataPreparationSchemaCache;
};

const getMultiActionChatResponseSchema = () => {
  if (!GeminiType) return null;
  if (!multiActionChatResponseSchemaCache) {
    const actionSchema = {
      type: GeminiType.OBJECT,
      properties: {
        thought: {
          type: GeminiType.STRING,
          description:
            'The assistant’s reasoning for this action. Must precede every action (ReAct pattern).',
        },
        responseType: {
          type: GeminiType.STRING,
          enum: ['text_response', 'plan_creation', 'dom_action', 'execute_js_code', 'proceed_to_analysis'],
        },
        text: {
          type: GeminiType.STRING,
          description: 'Conversational reply to the user. Required for text_response.',
        },
        cardId: {
          type: GeminiType.STRING,
          description: 'ID of the related analysis card, when applicable.',
        },
        plan: getSinglePlanSchema(),
        domAction: {
          type: GeminiType.OBJECT,
          description: 'DOM manipulation payload. Required for dom_action.',
          properties: {
            toolName: {
              type: GeminiType.STRING,
              enum: [
                'highlightCard',
                'clearHighlight',
                'changeCardChartType',
                'toggleCardData',
                'showCardData',
                'setCardTopN',
                'setCardHideOthers',
                'clearCardSelection',
                'resetCardZoom',
                'setRawDataVisibility',
                'setRawDataFilter',
                'setRawDataWholeWord',
                'setRawDataSort',
                'removeRawDataRows',
              ],
            },
          },
          required: ['toolName'],
        },
        code: {
          type: GeminiType.OBJECT,
          description: 'Executable JavaScript transformation for execute_js_code.',
          properties: {
            explanation: {
              type: GeminiType.STRING,
              description: 'Human-readable explanation of the code.',
            },
            jsFunctionBody: {
              type: GeminiType.STRING,
              description: 'Body of a function(data) that returns the transformed data array.',
            },
          },
          required: ['explanation', 'jsFunctionBody'],
        },
      },
      required: ['responseType', 'thought'],
    };

    multiActionChatResponseSchemaCache = {
      type: GeminiType.OBJECT,
      properties: {
        actions: {
          type: GeminiType.ARRAY,
          description: 'Sequence of actions for the assistant to perform.',
          items: actionSchema,
        },
      },
      required: ['actions'],
    };
  }
  return multiActionChatResponseSchemaCache;
};

const getProactiveInsightSchema = () => {
  if (!GeminiType) return null;
  if (!proactiveInsightSchemaCache) {
    proactiveInsightSchemaCache = {
      type: GeminiType.OBJECT,
      properties: {
        insight: {
          type: GeminiType.STRING,
          description: 'A concise message describing the single most important finding.',
        },
        cardId: {
          type: GeminiType.STRING,
          description: 'ID of the card where the insight was observed.',
        },
      },
      required: ['insight', 'cardId'],
    };
  }
  return proactiveInsightSchemaCache;
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

const callGeminiClient = async settings => {
  const key = settings.geminiApiKey;
  if (!key) throw new Error('Gemini API key is missing.');
  const GoogleGenAI = await getGoogleGenAI();
  return new GoogleGenAI({ apiKey: key });
};

const callGeminiJson = async (settings, prompt, options = {}) => {
  const modelId =
    settings.model === 'gemini-2.5-flash' || settings.model === 'gemini-2.5-pro'
      ? settings.model
      : 'gemini-2.5-pro';
  const ai = await callGeminiClient(settings);
  const config = {
    responseMimeType: 'application/json',
  };
  if (options?.schema) {
    config.responseSchema = options.schema;
  }
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config,
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
  const ai = await callGeminiClient(settings);
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
  const schema = getDataPreparationSchema();
  if (provider === 'openai') {
    plan = await callOpenAIJson(settings, systemPrompt, userPrompt);
  } else {
    plan = await callGeminiJson(settings, `${systemPrompt}\n${userPrompt}`, { schema });
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
    plans = ensureArray(await callGeminiJson(settings, prompt, { schema: getPlanArraySchema() }));
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

export const generateProactiveInsights = async (cardContext, settings) => {
  const provider = settings.provider || 'google';
  const isApiKeySet =
    provider === 'google' ? !!settings.geminiApiKey : !!settings.openAIApiKey;
  if (!isApiKeySet || !cardContext || !cardContext.length) {
    return null;
  }

  try {
    const promptContext = JSON.stringify(cardContext, null, 2);
    if (provider === 'openai') {
      const systemPrompt = `You are a proactive data analyst. Review the following summaries of data visualizations. Your task is to identify the single most commercially significant or surprising insight. This could be a major trend, a key outlier, or a dominant category that has clear business implications. Respond with JSON only.`;
      const userPrompt = `**Generated Analysis Cards & Data Samples:**
${promptContext}

Your Task:
1. Analyze all cards.
2. Identify a single high-impact insight.
3. Explain it in ${settings.language}.
4. Return JSON: {"insight": string, "cardId": string}.`;
      return await callOpenAIJson(settings, systemPrompt, userPrompt);
    }

    const schema = getProactiveInsightSchema();
    const prompt = `
You are a proactive data analyst. Review the following summaries of data visualizations you have created. Your task is to identify the single most commercially significant or surprising insight. This could be a major trend, a key outlier, or a dominant category that has clear business implications.

**Generated Analysis Cards & Data Samples:**
${promptContext}

Your Task:
1. Analyze all cards.
2. Identify the ONE most important finding.
3. Formulate a short, user-facing message in ${settings.language}.
4. Respond with a JSON object containing "insight" and "cardId".
`;
    return await callGeminiJson(settings, prompt, { schema });
  } catch (error) {
    console.error('Error generating proactive insights:', error);
    return null;
  }
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
  metadata = null,
  intent = 'general',
  skillCatalog = [],
  memoryContext = [],
  dataPreparationPlan = null
) => {
  const provider = settings.provider || 'google';
  const isApiKeySet =
    provider === 'google' ? !!settings.geminiApiKey : !!settings.openAIApiKey;
  if (!isApiKeySet) {
    return { actions: [{ responseType: 'text_response', text: 'Cloud AI is disabled. API Key not provided.' }] };
  }

  const categoricalCols = columns.filter(c => c.type === 'categorical').map(c => c.name);
  const numericalCols = columns.filter(c => c.type === 'numerical').map(c => c.name);
  const history = chatHistory.map(m => `${m.sender}: ${m.text}`).join('\n');
  const recentSystemMessages = chatHistory
    .filter(msg => msg.sender === 'system')
    .slice(-10)
    .map(msg => `- [${msg.type || 'system'}] ${msg.text}`)
    .join('\n');
  const systemSection = recentSystemMessages ? `**Recent System Messages:**\n${recentSystemMessages}\n` : '';

  const metadataContext = formatMetadataContext(metadata, {
    leadingRowLimit: 10,
    contextRowLimit: 15,
  });
  const metadataSection = metadataContext ? `**Dataset Context:**\n${metadataContext}\n` : '';
  const datasetTitle = metadata?.reportTitle || 'Not detected';

  const skillSection = Array.isArray(skillCatalog) && skillCatalog.length
    ? `**Skill Library (${skillCatalog.length} available):**
${skillCatalog
  .map(skill => `- [${skill.id}] ${skill.label}: ${skill.description}`)
  .join('\n')}
`
    : '';

  const memorySection = Array.isArray(memoryContext) && memoryContext.length
    ? `**LONG-TERM MEMORY (Top Matches):**
${memoryContext
  .map(item => {
    const score = typeof item.score === 'number' ? item.score.toFixed(2) : 'n/a';
    const summary = item.summary || item.text || '';
    return `- (${item.kind || 'note'} | score ${score}) ${summary}`;
  })
  .join('\n')}
`
    : `**LONG-TERM MEMORY (Top Matches):**
No specific long-term memories seem relevant to this query.
`;

  const cardsPreview = cardContext && cardContext.length
    ? JSON.stringify(cardContext.slice(0, 6), null, 2)
    : 'No analysis cards yet.';

  const rawDataPreview = rawDataSample && rawDataSample.length
    ? JSON.stringify(rawDataSample.slice(0, 20), null, 2)
    : 'No raw data available.';

  const coreBriefing = aiCoreAnalysisSummary || 'No core analysis has been performed yet. This is your first look at the data.';
  const coreBriefingSection = `**CORE ANALYSIS BRIEFING (Your Memory):**
${coreBriefing}
`;

  const dataPreparationDetails = (() => {
    if (!dataPreparationPlan) {
      return 'No AI-driven data preparation was performed.';
    }
    const explanation = dataPreparationPlan.explanation || 'AI suggested preparing the data before analysis.';
    const codeBlock = dataPreparationPlan.jsFunctionBody
      ? `Code Executed: \`\`\`javascript
${dataPreparationPlan.jsFunctionBody}
\`\`\``
      : 'Code Executed: None (AI determined no transformation was necessary).';
    return `${explanation}\n${codeBlock}`;
  })();
  const dataPreparationSection = `**DATA PREPARATION LOG (How the raw data was cleaned):**
${dataPreparationDetails}
`;

  const guidingPrinciples = `**Guiding Principles & Common Sense:**
1. Synthesize and interpret: connect insights and explain the business implications—the "so what?".
2. Understand intent and sanity-check requests; if the data cannot support an ask, clarify and suggest alternatives.
3. Be proactive: surface key trends, outliers, risks, or opportunities.
4. Use business language focused on performance, contribution, and impact.
`;

  const datasetOverview = `**Dataset Overview**
- Title: ${datasetTitle}
- Current View: ${currentView}
- Detected Intent: ${intent}
- Categorical Columns: ${categoricalCols.join(', ') || 'None'}
- Numerical Columns: ${numericalCols.join(', ') || 'None'}
${metadataSection}`;

  const actionsInstructions = `**Available Actions & Tools**
1. \`text_response\`: Conversational reply. If the text references a specific card, include its \`cardId\`.
2. \`plan_creation\`: Propose a NEW chart. Provide a full plan object. For wide categorical charts, set \`defaultTopN\` (e.g., 8) and \`defaultHideOthers\` to \`true\` to keep charts readable.
3. \`dom_action\`: Interact with existing UI elements. Provide objects like:
   - {"toolName":"highlightCard","cardId":"card-123","scrollIntoView":true}
   - {"toolName":"changeCardChartType","cardId":"card-123","chartType":"line"}
   - {"toolName":"toggleCardData","cardId":"card-123","visible":true}
   - {"toolName":"setCardTopN","cardId":"card-123","topN":8,"hideOthers":true}
   - {"toolName":"setCardHideOthers","cardId":"card-123","hideOthers":false}
   - {"toolName":"clearCardSelection","cardId":"card-123"}
   - {"toolName":"resetCardZoom","cardId":"card-123"}
   - {"toolName":"setRawDataVisibility","visible":false}
   - {"toolName":"setRawDataFilter","query":"Asia","wholeWord":false}
   - {"toolName":"setRawDataWholeWord","wholeWord":true}
   - {"toolName":"setRawDataSort","column":"Region","direction":"ascending"}
   - {"toolName":"removeRawDataRows","column":"Status","values":["Cancelled"],"operator":"equals"}
4. \`execute_js_code\`: Supply complex JavaScript transformations for data cleansing/prep. Always accompany with a \`text_response\` describing the change.

**ReAct Requirements**
- Every action MUST include a \`thought\` explaining the reasoning immediately before acting.
- For multi-step tasks, outline the full plan in the FIRST action's \`thought\`, then execute the steps in order.
- Conclude with a \`text_response\` that summarizes results and suggests a logical next step for the user.
- When you change data or charts, acknowledge the outcome in a \`text_response\`.
- Respond strictly with a single JSON object: {"actions":[ ... ]}. No extra commentary outside JSON.
- Avoid \`proceed_to_analysis\` unless specifically required (deprecated).
`;

  const conversationSection = `**Conversation History:**
${history || 'No previous messages.'}
`;

  const userPromptWithContext = `
${coreBriefingSection}
${guidingPrinciples}
${datasetOverview}
${dataPreparationSection}
**Analysis Cards on Screen:**
${cardsPreview}

**Raw Data Sample (first 20 rows for context):**
${rawDataPreview}

${skillSection}${memorySection}${systemSection}${conversationSection}
**Latest User Message:** "${userPrompt}"

${actionsInstructions}
`;

  const systemPrompt = `You are an expert data analyst and business strategist operating with a Reason+Act (ReAct) mindset. Respond in ${settings.language}. Your entire reply MUST be a single JSON object containing an "actions" array, and each action MUST include a "thought" that clearly explains your reasoning before the action.`;

  let result;
  const geminiSchema = provider === 'google' ? getMultiActionChatResponseSchema() : null;
  if (provider === 'openai') {
    result = await callOpenAIJson(
      settings,
      systemPrompt,
      userPromptWithContext
    );
  } else {
    result = await callGeminiJson(
      settings,
      `${systemPrompt}\n${userPromptWithContext}`,
      { schema: geminiSchema }
    );
  }

  if (!result || !Array.isArray(result.actions)) {
    throw new Error('The AI response does not contain a valid actions array.');
  }

  const missingThought = result.actions.find(
    action => !action || typeof action.thought !== 'string' || !action.thought.trim()
  );
  if (missingThought) {
    throw new Error('The AI response is missing a required "thought" field on one or more actions.');
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
