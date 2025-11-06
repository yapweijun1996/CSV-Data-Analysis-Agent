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

const SUMMARY_KEYWORDS = [
  'total',
  'subtotal',
  'grand total',
  'sum',
  'summary',
  'notes',
  'note',
  'memo',
  'remarks',
  'remark',
  'balance',
  'balances'
];
const SUMMARY_KEYWORDS_DISPLAY = SUMMARY_KEYWORDS.map(keyword => `'${keyword}'`).join(', ');
const rowContainsSummaryKeyword = row => {
  if (!row || typeof row !== 'object') {
    return false;
  }
  const values = Object.values(row);
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) continue;
    if (SUMMARY_KEYWORDS.some(keyword => trimmed === keyword || trimmed.startsWith(`${keyword} `))) {
      return true;
    }
  }
  return false;
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
        analysisSteps: {
          type: GeminiType.ARRAY,
          description: 'Step-by-step observations and decisions that lead to the transformation.',
          items: {
            type: GeminiType.STRING,
            description: 'Single reasoning step. Must be detailed and sequential.',
          },
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
      required: ['explanation', 'analysisSteps', 'outputColumns'],
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

  if (
    Array.isArray(metadata.genericHeaders) &&
    Array.isArray(metadata.inferredHeaders) &&
    metadata.genericHeaders.length
  ) {
    const mapping = metadata.genericHeaders
      .map((header, index) => {
        const target = metadata.inferredHeaders[index] || '(unknown)';
        return `${header} -> ${target}`;
      })
      .slice(0, 40);
    if (mapping.length) {
      lines.push(`Generic header mapping:\n${mapping.join('\n')}`);
    }
  }

  if (Array.isArray(metadata.sampleDataRows) && metadata.sampleDataRows.length) {
    const preview = metadata.sampleDataRows.slice(0, 3).map((row, index) => {
      try {
        return `Row ${index + 1}: ${JSON.stringify(row)}`;
      } catch (error) {
        const values = row && typeof row === 'object' ? Object.values(row) : [];
        return `Row ${index + 1}: ${values.filter(Boolean).join(' | ')}`;
      }
    });
    if (preview.length) {
      lines.push(`Sample data preview:\n${preview.join('\n')}`);
    }
  }

  return lines.join('\n');
};

const normaliseSampleDataForPlan = (columns, sampleData, metadata) => {
  if (!Array.isArray(sampleData)) {
    return [];
  }

  const columnNames = Array.isArray(columns)
    ? columns
        .map(column => (column && typeof column === 'object' ? column.name : null))
        .filter(Boolean)
    : [];

  const genericHeaders = Array.isArray(metadata?.genericHeaders) ? metadata.genericHeaders : [];
  const inferredHeaders = Array.isArray(metadata?.inferredHeaders) ? metadata.inferredHeaders : [];
  const aliasMap = {};

  if (genericHeaders.length && inferredHeaders.length) {
    genericHeaders.forEach((generic, index) => {
      if (generic) {
        aliasMap[generic] = inferredHeaders[index];
      }
    });
  }

  return sampleData.map(row => {
    if (!row || typeof row !== 'object') {
      return row;
    }
    if (!columnNames.length) {
      return { ...row };
    }

    const normalizedRow = { ...row };

    columnNames.forEach(name => {
      const aliasKey = aliasMap[name];
      const baseValue = Object.prototype.hasOwnProperty.call(row, name)
        ? row[name]
        : aliasKey && Object.prototype.hasOwnProperty.call(row, aliasKey)
          ? row[aliasKey]
          : '';

      if (!Object.prototype.hasOwnProperty.call(normalizedRow, name)) {
        normalizedRow[name] = baseValue;
      } else if (normalizedRow[name] === '' && baseValue !== '') {
        normalizedRow[name] = baseValue;
      }

      if (aliasKey) {
        if (!Object.prototype.hasOwnProperty.call(normalizedRow, aliasKey)) {
          normalizedRow[aliasKey] = baseValue;
        } else if (normalizedRow[aliasKey] === '' && baseValue !== '') {
          normalizedRow[aliasKey] = baseValue;
        }
      }
    });

    return normalizedRow;
  });
};

const sanitizeJsFunctionBody = jsBody => {
  if (typeof jsBody !== 'string') {
    return jsBody;
  }
  let cleaned = jsBody.trim();

  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:javascript|js)?\s*/i, '').replace(/```$/i, '').trim();
  }

  const stripLeadingComments = source => {
    let result = source;
    const commentPattern = /^(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)+/;
    while (commentPattern.test(result)) {
      result = result.replace(commentPattern, '').trimStart();
    }
    return result;
  };

  const stripTrailingSemicolon = source => source.replace(/;\s*$/, '').trim();

  const wrapInvocation = expression => `return (${stripTrailingSemicolon(expression)})(data, _util);`;

  const core = stripLeadingComments(cleaned);

  if (/^function\b/i.test(core)) {
    return wrapInvocation(core);
  }

  let match = core.match(
    /^(?:const|let|var)\s+[a-zA-Z_$][\w$]*\s*=\s*(function\s*\([^)]*\)\s*{[\s\S]*})\s*;?\s*$/i
  );
  if (match && match[1]) {
    return wrapInvocation(match[1]);
  }

  match = core.match(
    /^(?:const|let|var)\s+[a-zA-Z_$][\w$]*\s*=\s*(\([^)]*\)\s*=>\s*(?:{[\s\S]*}|[^\n;]+))\s*;?\s*$/i
  );
  if (match && match[1]) {
    return wrapInvocation(match[1]);
  }

  match = core.match(/^export\s+default\s+(function\s*\([^)]*\)\s*{[\s\S]*})\s*;?\s*$/i);
  if (match && match[1]) {
    return wrapInvocation(match[1]);
  }

  match = core.match(/^module\.exports\s*=\s*(function\s*\([^)]*\)\s*{[\s\S]*})\s*;?\s*/i);
  if (match && match[1]) {
    return wrapInvocation(match[1]);
  }

  return core;
};

const stripJsComments = source =>
  typeof source === 'string'
    ? source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*$/gm, '')
    : '';

const detectHardCodedPatternsInJs = source => {
  if (typeof source !== 'string' || !source.trim()) {
    return [];
  }

  const stripped = stripJsComments(source);
  const issueSet = new Set();

  if (/\bdata\s*\[\s*\d+\s*\]/.test(stripped)) {
    issueSet.add('direct array indexing like data[1]');
  }

  const genericColumnLiterals = stripped.match(/['"]column_(\d+)['"]/gi);
  if (genericColumnLiterals) {
    issueSet.add('hard-coded generic headers such as "column_3"');
  }

  const columnLabelLiterals = stripped.match(/['"]Column\s+\d+['"]/g);
  if (columnLabelLiterals) {
    issueSet.add('hard-coded "Column N" labels');
  }

  return Array.from(issueSet);
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

export const generateDataPreparationPlan = async (
  columns,
  sampleData,
  settings,
  metadata = null,
  previousError = null,
  iterationContext = null
) => {
  const provider = settings.provider || 'google';
  if (provider === 'openai' && !settings.openAIApiKey) {
    return { explanation: 'No transformation needed as API key is not set.', jsFunctionBody: null, outputColumns: columns };
  }
  if (provider === 'google' && !settings.geminiApiKey) {
    return { explanation: 'No transformation needed as API key is not set.', jsFunctionBody: null, outputColumns: columns };
  }

  const normalizedSampleData = normaliseSampleDataForPlan(columns, Array.isArray(sampleData) ? sampleData : [], metadata);
  const sampleRowsForPrompt = normalizedSampleData.slice(0, 20);
  const genericHeaders = Array.isArray(metadata?.genericHeaders) ? metadata.genericHeaders : [];
  const inferredHeaders = Array.isArray(metadata?.inferredHeaders) ? metadata.inferredHeaders : [];
  const headerMappingPreview = (() => {
    if (!genericHeaders.length || !inferredHeaders.length) {
      return '';
    }
    const pairs = genericHeaders
      .map((header, index) => {
        const alias = inferredHeaders[index];
        if (!header) return '';
        return `${header} -> ${alias || '(unknown)'}`;
      })
      .filter(Boolean)
      .slice(0, 30);
    return pairs.length ? pairs.join('\n') : '';
  })();
  const hasCrosstabShape =
    genericHeaders.length >= 6 &&
    normalizedSampleData.length > 0 &&
    typeof normalizedSampleData[0] === 'object' &&
    Object.keys(normalizedSampleData[0]).some(key => /^column_\d+$/i.test(key));

  const metadataContext = formatMetadataContext(metadata, {
    leadingRowLimit: 10,
    contextRowLimit: 20,
  });
  const contextSection = metadataContext ? `Dataset context:\n${metadataContext}\n\n` : '';

const systemPrompt = `You are an expert data engineer. Your task is to analyze a raw dataset and, if necessary, provide a JavaScript function to clean and reshape it into a tidy, analysis-ready format. CRITICALLY, you must also provide the schema of the NEW, transformed data with detailed data types.
A tidy format has: 1. Each variable as a column. 2. Each observation as a row.
You MUST respond with a single valid JSON object, and nothing else. The JSON object must adhere to the provided schema.`;

const buildUserPrompt = (lastError, iterationContext = null) => {
  const iterationSummary = (() => {
    if (!iterationContext || typeof iterationContext !== 'object') {
      return '';
    }
    const { iteration, maxIterations, history } = iterationContext;
    const parts = [];
    if (typeof iteration === 'number' && typeof maxIterations === 'number') {
      parts.push(
        `You are working in multi-pass mode. This is iteration ${iteration} of ${maxIterations}. Focus this iteration on a single coherent transformation.`
      );
    }
    if (Array.isArray(history) && history.length) {
      const recent = history.slice(-5);
      parts.push(
        'Previous iterations:',
        ...recent.map(entry => {
          const statusLabel = entry.status ? String(entry.status).toUpperCase() : 'UNKNOWN';
          const explanation = entry.summary || entry.explanation || '(no explanation provided)';
          return `- Iteration ${entry.iteration}: status=${statusLabel}. ${explanation}`;
        })
      );
    }
    return parts.length ? `${parts.join('\n')}\n\n` : '';
  })();

  const offendingSummaryText = (() => {
    if (!lastError || typeof lastError.message !== 'string') return null;
    const marker = 'Offending rows include:';
    const index = lastError.message.indexOf(marker);
    if (index === -1) return null;
    const extracted = lastError.message
      .slice(index + marker.length)
      .trim()
      .replace(/\.$/, '');
    return extracted || null;
  })();

  const multiPassRules = `Multi-pass requirements:
- You MUST set the "status" field: use "continue" if more passes will be needed after this step, "done" when the dataset is tidy, or "abort" if cleanup cannot proceed safely.
- When status is "continue", provide code that performs ONLY the next logical step and describe what will remain afterwards.
- When status is "done", omit the JavaScript body (or return null) and explain why no further steps are required.
- Do not repeat work already finished in prior iterations; build on the current cleaned dataset.${
    offendingSummaryText
      ? `\n- Previously flagged summary rows that MUST be removed this iteration: ${offendingSummaryText}`
      : ''
  }`;

  const mandatorySummaryBullet = offendingSummaryText
    ? `- **MANDATORY SUMMARY REMOVAL**: The following rows were identified as summaries and must be excluded from the transformed dataset: ${offendingSummaryText}. If any should remain, set status="abort" and explain why.`
    : '- **MANDATORY SUMMARY REMOVAL**: Any row matching the summary keywords must be excluded from the transformed dataset. When uncertain, remove the row and justify in your status message.';

  return `${contextSection}${iterationSummary}${multiPassRules}

Common problems to fix:
- **CRITICAL RULE on NUMBER PARSING**: This is the most common source of errors. To handle numbers that might be formatted as strings (e.g., "$1,234.56", "50%"), you are provided with a safe utility function: \`_util.parseNumber(value)\`.
    - **YOU MUST use \`_util.parseNumber(value)\` for ALL numeric conversions.**
    - **DO NOT use \`parseInt()\`, \`parseFloat()\`, or \`Number()\` directly.** The provided utility is guaranteed to handle various formats correctly.
- **CRITICAL RULE on SPLITTING NUMERIC STRINGS**: If you encounter a single string field that contains multiple comma-separated numbers (which themselves may contain commas as thousand separators, e.g., "1,234.50,5,678.00,-9,123.45"), you are provided a utility \`_util.splitNumericString(value)\` to correctly split the string into an array of number strings.
    - **YOU MUST use this utility for this specific case.**
    - **DO NOT use a simple \`string.split(',')\`**, as this will incorrectly break up numbers.
    - **Example**: To parse a field 'MonthlyValues' containing "1,500.00,2,000.00", your code should be: \`const values = _util.splitNumericString(row.MonthlyValues);\` This will correctly return \`['1,500.00', '2,000.00']\`.
- **Distinguishing Data from Summaries**: Your most critical task is to differentiate between valid data rows and non-data rows (like summaries or metadata).
    - A row is likely **valid data** if it has a value in its primary identifier column(s) (e.g., 'Account Code', 'Product ID') and in its metric columns.
    - **CRITICAL: Do not confuse hierarchical data with summary rows.** Look for patterns in identifier columns where one code is a prefix of another (e.g., '50' is a parent to '5010'). These hierarchical parent rows are **valid data** representing a higher level of aggregation and MUST be kept. Your role is to reshape the data, not to pre-summarize it by removing these levels.
    - A row is likely **non-data** and should be removed if it's explicitly a summary (e.g., contains 'Total', 'Subtotal' in a descriptive column) OR if it's metadata (e.g., the primary identifier column is empty but other columns contain text, like a section header).
- **Summary Keyword Radar**: Treat any row whose textual cells match or start with these keywords as metadata/non-data unless strong evidence proves otherwise: ${SUMMARY_KEYWORDS_DISPLAY}.
${mandatorySummaryBullet}
- **Crosstab/Wide Format**: Unpivot data where column headers are actually values (e.g., years, regions) so that each observation is one row.
- **Multi-header Rows**: Skip any initial junk rows (titles, blank lines, headers split across rows) before the true header.
- **NO HARD-CODED INDEXES**: You must dynamically detect header rows and identifier columns by examining the provided sample rows. Never assume fixed row numbers or literal labels (e.g., "Code", "Description") will exist. Use fallbacks (e.g., scanning for rows with many text cells followed by rows with numeric cells) so the transform works even when column labels change.

${headerMappingPreview ? `Generic to inferred header mapping:\n${headerMappingPreview}\n` : ''}
${hasCrosstabShape ? `CROSSTAB ALERT:
- The dataset contains many generic columns (e.g., column_1, column_2...). Treat these as pivoted metrics that must be unpivoted/melted into tidy rows.
- Preserve identifier columns (codes, descriptions, category labels) as-is.
- For each pivot column, produce rows with explicit fields such as { Code, Description, PivotColumnName, PivotValue } so every numeric value becomes its own observation.
- You MUST return a non-null \`jsFunctionBody\` that performs this unpivot; returning null is not acceptable when this pattern is detected.
- After reshaping, update \`outputColumns\` to reflect the tidy structure (e.g., 'code' categorical, 'project' categorical, 'pivot_column' categorical, 'pivot_value' numerical).
- Include logic to drop empty or subtotal rows but keep hierarchical parent rows.\n` : ''}

Dataset Columns (Initial Schema):
${JSON.stringify(columns, null, 2)}
Sample Data (up to 20 rows):
${JSON.stringify(sampleRowsForPrompt, null, 2)}
${lastError ? `On the previous attempt, your generated code failed with this error: "${lastError.message}". Please analyze the error and provide a corrected response.` : ''}

Your task:
1. **Study (Think Step-by-Step)**: Describe what you observe in the dataset. List the problems (multi-row headers, totals, blank/title rows, etc.). Output this as \`analysisSteps\` — a detailed, ordered list of your reasoning before coding.
2. **Plan Transformation**: Based on those steps, decide on the exact cleaning/reshaping actions (unpivot, drop rows, rename columns, parse numbers, etc.).
3. **Define Output Schema**: Determine the exact column names and data types AFTER your transformation. Use specific types where possible: 'categorical', 'numerical', 'date', 'time', 'currency', 'percentage'.
4. **Write Code**: If transformation is needed, write the body of a JavaScript function. It receives two arguments, \`data\` and \`_util\`, and must return the transformed array of objects.
5. **Explain**: Provide a concise, user-facing explanation of what you did.

**CRITICAL REQUIREMENTS:**
- Never assume specific header text exists. If you cannot confidently locate headers or identifier columns, throw an Error explaining what data was missing instead of returning an empty array.
- You MUST provide the \`analysisSteps\` array capturing your chain-of-thought (observations ➜ decisions ➜ actions). Each item should be a full sentence.
- You MUST provide the \`outputColumns\` array. If no transformation is needed, it should match the input schema (but update types if you discovered more specific ones).
- Your JavaScript MUST include a \`return\` statement that returns the transformed data array.
- Whenever you convert numbers, you MUST use \`_util.parseNumber\`. Whenever you split comma-separated numeric strings, you MUST use \`_util.splitNumericString\`.
- If the dataset exhibits the Crosstab alert above, you MUST return a non-null \`jsFunctionBody\` that unpivots the data into tidy rows. Do not respond with null in this situation.
`;
};

  const schema = getDataPreparationSchema();
  let lastError =
    previousError instanceof Error
      ? previousError
      : previousError
      ? new Error(
          typeof previousError === 'string'
            ? previousError
            : previousError.message
            ? previousError.message
            : String(previousError)
        )
      : null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let plan;
      const userPrompt = buildUserPrompt(lastError, iterationContext);

      if (provider === 'openai') {
        plan = await callOpenAIJson(settings, systemPrompt, userPrompt);
      } else {
        const combinedPrompt = `${systemPrompt}\n${userPrompt}`;
        plan = await callGeminiJson(settings, combinedPrompt, { schema });
      }

      if (!plan) {
        throw new Error('AI returned an empty plan.');
      }

      if (Array.isArray(plan.analysisSteps)) {
        plan.analysisSteps = plan.analysisSteps.map(step =>
          typeof step === 'string' ? step.trim() : String(step)
        ).filter(step => step);
      } else if (typeof plan.analysisSteps === 'string') {
        plan.analysisSteps = [plan.analysisSteps.trim()].filter(Boolean);
      } else {
        plan.analysisSteps = [];
      }

      if (!plan.outputColumns || !Array.isArray(plan.outputColumns) || plan.outputColumns.length === 0) {
        plan.outputColumns = columns;
      }

      console.groupCollapsed('[DataPrep] AI plan result');
      try {
        console.log('Crosstab detected:', hasCrosstabShape);
        console.log('Plan explanation:', plan.explanation || '(none)');
        console.log('Returned jsFunctionBody:', Boolean(plan.jsFunctionBody));
        console.log('Analysis steps:', plan.analysisSteps);
        console.log('Output columns:', plan.outputColumns);
        console.log('Sample rows sent to model (first 3):', sampleRowsForPrompt.slice(0, 3));
        if (!plan.jsFunctionBody && hasCrosstabShape) {
          console.warn(
            '[DataPrep] Gemini skipped transformation even though Crosstab alert was triggered. Inspect plan payload below.'
          );
        }
        console.log('Full plan payload:', plan);
      } finally {
        console.groupEnd();
      }

      if (plan.jsFunctionBody) {
        const normalizedJsBody = sanitizeJsFunctionBody(plan.jsFunctionBody);
        plan.jsFunctionBody = normalizedJsBody;
        console.log('Sanitized jsFunctionBody preview:', normalizedJsBody);
        const hardCodedIssues = detectHardCodedPatternsInJs(normalizedJsBody);
        if (hardCodedIssues.length) {
          const message = `Generated transform relies on hard-coded structure (${hardCodedIssues.join(
            '; '
          )}). Detect headers and identifier columns dynamically instead of using fixed indexes.`;
          lastError = new Error(message);
          console.warn('[DataPrep] Rejected transform due to brittle structure assumptions:', message);
          continue;
        }
        const mockUtil = {
          parseNumber: value => {
            const cleaned = String(value ?? '')
              .replace(/[$\s,%]/g, '')
              .replace(/,/g, '')
              .trim();
            const parsed = Number.parseFloat(cleaned);
            return Number.isNaN(parsed) ? 0 : parsed;
          },
          splitNumericString: value => {
            if (value === null || value === undefined) return [];
            return String(value).split(',');
          },
        };

        try {
          const transformFunction = new Function('data', '_util', normalizedJsBody);
          const testInput = normalizedSampleData.slice(0, 10);
          const testResult = transformFunction(testInput, mockUtil);
          if (!Array.isArray(testResult)) {
            console.warn('[DataPrep] Transform function returned non-array during validation:', testResult);
            throw new Error('Generated function did not return an array.');
          }
          if (!testResult.length) {
            throw new Error('Generated function produced an empty dataset. Ensure valid rows remain after cleaning.');
          }
          if (typeof testResult[0] !== 'object' || testResult[0] === null) {
            throw new Error('Generated function did not return an array of objects.');
          }
          const summaryRowsDetected = testResult.some(rowContainsSummaryKeyword);
          if (summaryRowsDetected) {
            throw new Error('Transformed data still contains summary/metadata rows (e.g., total, subtotal, notes). Remove them and retry.');
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(`AI-generated transformation failed validation (attempt ${attempt + 1}).`, lastError);
          continue;
        }
      }

      return plan;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Error in data preparation plan generation (attempt ${attempt + 1}):`, lastError);
    }
  }

  throw new Error(`AI failed to generate a valid data preparation plan after multiple attempts. Last error: ${lastError?.message}`);
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
