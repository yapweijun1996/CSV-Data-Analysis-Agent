import { executePlan } from '../utils/dataProcessor.js';
import { applyHeaderMapping as applyHeaderMappingHelper } from '../utils/headerMapping.js';
import {
  detectHeadersTool,
  removeSummaryRowsTool,
  detectIdentifierColumnsTool,
  normalizeCurrencyValue,
  isLikelyIdentifierValue,
  describeColumns as describeColumnsHelper,
} from '../utils/dataPrepTools.js';
import { buildPromptFragments, formatMetadataContext } from './promptFragments.js';

const GENAI_MODULE_URL = 'https://aistudiocdn.com/@google/genai@1.28.0';
let googleModulePromise = null;
let GoogleGenAIClass = null;
let GeminiType = null;
let planArraySchema = null;
let singlePlanSchema = null;
let dataPreparationSchemaCache = null;
let stageDetailSchemaCache = null;
let stagePlanSchemaCache = null;
let agentLogEntrySchemaCache = null;
let multiActionChatResponseSchemaCache = null;
let proactiveInsightSchemaCache = null;
let chatPlanSchemaCache = null;
const MAX_CHAT_HISTORY_MESSAGES = 8;
const MAX_SYSTEM_MESSAGES = 5;
const MAX_SKILL_PROMPT_ENTRIES = 8;
const MAX_MEMORY_PROMPT_ENTRIES = 5;

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
  const ensureString = typeof text === 'string' ? text : String(text);
  // Gemini responses may prepend thinking traces such as <think>...</think>; strip them eagerly.
  const withoutThinking = ensureString.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const stripFences = value =>
    value.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  const candidates = [];
  candidates.push(stripFences(withoutThinking.trim()));

  const attemptParse = candidate => {
    if (!candidate) return null;
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  };

  for (const candidate of candidates) {
    const parsed = attemptParse(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  const fallbackSlices = (() => {
    const fallback = [];
    const normalized = candidates[0] || '';
    const objectStart = normalized.indexOf('{');
    const objectEnd = normalized.lastIndexOf('}');
    if (objectStart !== -1 && objectEnd > objectStart) {
      fallback.push(normalized.slice(objectStart, objectEnd + 1));
    }
    const arrayStart = normalized.indexOf('[');
    const arrayEnd = normalized.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      fallback.push(normalized.slice(arrayStart, arrayEnd + 1));
    }
    return fallback;
  })();

  for (const candidate of fallbackSlices) {
    const parsed = attemptParse(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  const parseError = new Error('AI response is not valid JSON.');
  parseError.rawResponse = candidates[0];
  throw parseError;
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

const STAGE_PLAN_DEFAULTS = [
  {
    key: 'titleExtraction',
    label: 'Title & Metadata',
    fallbackGoal: 'Detect report titles and metadata-only rows before data starts.',
  },
  {
    key: 'headerResolution',
    label: 'Header Identification',
    fallbackGoal: 'Resolve multi-row headers into canonical column names.',
  },
  {
    key: 'dataNormalization',
    label: 'Data Rows',
    fallbackGoal: 'Clean numerical values, unpivot wide columns, and remove summary rows.',
  },
];

const normaliseStringArray = value =>
  Array.isArray(value)
    ? value
        .map(entry => (typeof entry === 'string' ? entry.trim() : String(entry || '')).trim())
        .filter(Boolean)
    : [];

const normaliseStageDetail = (stage, fallbackGoal, label) => {
  if (!stage || typeof stage !== 'object') {
    return {
      goal: fallbackGoal,
      checkpoints: [],
      heuristics: [],
      fallbackStrategies: [],
      expectedArtifacts: [],
      nextAction: null,
      status: 'pending',
      logMessage: `${label}: pending`,
    };
  }
  const normaliseString = value =>
    typeof value === 'string' ? value.trim() : value == null ? null : String(value).trim();
  return {
    goal: normaliseString(stage.goal) || fallbackGoal,
    checkpoints: normaliseStringArray(stage.checkpoints),
    heuristics: normaliseStringArray(stage.heuristics),
    fallbackStrategies: normaliseStringArray(stage.fallbackStrategies),
    expectedArtifacts: normaliseStringArray(stage.expectedArtifacts),
    nextAction: normaliseString(stage.nextAction),
    status:
      stage.status && typeof stage.status === 'string'
        ? stage.status.toLowerCase()
        : 'pending',
    logMessage: normaliseString(stage.logMessage) || `${label}: pending`,
  };
};

const normaliseStagePlan = rawPlan => {
  if (!rawPlan || typeof rawPlan !== 'object') {
    return STAGE_PLAN_DEFAULTS.reduce((acc, descriptor) => {
      acc[descriptor.key] = normaliseStageDetail(null, descriptor.fallbackGoal, descriptor.label);
      return acc;
    }, {});
  }
  return STAGE_PLAN_DEFAULTS.reduce((acc, descriptor) => {
    acc[descriptor.key] = normaliseStageDetail(
      rawPlan[descriptor.key],
      descriptor.fallbackGoal,
      descriptor.label
    );
    return acc;
  }, {});
};

const normaliseAgentLogEntries = entries => {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries
    .map(entry => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const stage =
        typeof entry.stage === 'string' ? entry.stage.toLowerCase().trim() : 'general';
      const thought =
        typeof entry.thought === 'string'
          ? entry.thought.trim()
          : entry.thought != null
          ? String(entry.thought).trim()
          : '';
      if (!thought) {
        return null;
      }
      const action =
        typeof entry.action === 'string'
          ? entry.action.trim()
          : entry.action != null
          ? String(entry.action).trim()
          : null;
      const status =
        typeof entry.status === 'string'
          ? entry.status.trim()
          : stage === 'general'
          ? null
          : 'pending';
      return {
        stage: stage || 'general',
        thought,
        action,
        status,
      };
    })
    .filter(Boolean);
};

const trimChatHistory = (history = [], limit = MAX_CHAT_HISTORY_MESSAGES, systemLimit = MAX_SYSTEM_MESSAGES) => {
  if (!Array.isArray(history) || history.length === 0) {
    return [];
  }
  if (history.length <= limit + systemLimit) {
    return history;
  }
  const systemIndices = [];
  const otherIndices = [];
  history.forEach((msg, index) => {
    if (msg?.sender === 'system') {
      systemIndices.push(index);
    } else {
      otherIndices.push(index);
    }
  });
  const keep = new Set();
  systemIndices.slice(-systemLimit).forEach(idx => keep.add(idx));
  otherIndices.slice(-limit).forEach(idx => keep.add(idx));
  return history.filter((_, index) => keep.has(index));
};

const isGreetingOnly = text => {
  if (!text || typeof text !== 'string') {
    return false;
  }
  const normalized = text.trim().toLowerCase();
  if (!normalized || normalized.length > 24) {
    return false;
  }
  const greetingRegex =
    /^(hi|hello|hey|hola|bonjour|ciao|hallo|嗨+|你好|您好|早安|午安|晚安)(\s+(there|team))?([!！。\.]{0,2})$/i;
  return greetingRegex.test(normalized);
};

const formatNumber = value => {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) {
    return null;
  }
  try {
    return num.toLocaleString();
  } catch (error) {
    return String(num);
  }
};

const summariseColumns = columns => {
  const list = Array.isArray(columns) ? columns : [];
  const names = list.map(col => (col?.name ? String(col.name).trim() : '')).filter(Boolean);
  const categoricalCount = list.filter(col => col?.type === 'categorical').length;
  const numericalCount = list.filter(col => col?.type === 'numerical').length;
  return {
    total: list.length,
    categoricalCount,
    numericalCount,
    sampleNames: names.slice(0, 3),
  };
};

const deriveColumnBuckets = (columns = []) => {
  const list = Array.isArray(columns) ? columns : [];
  const normalise = value => (typeof value === 'string' ? value.trim() : '');
  const buckets = {
    identifiers: [],
    dimensions: [],
    measures: [],
    currencies: [],
    percentages: [],
    time: [],
    categorical: [],
    numerical: [],
  };
  list.forEach(column => {
    const name = normalise(column?.name);
    if (!name) return;
    if (column?.type === 'categorical') {
      buckets.categorical.push(name);
    } else if (column?.type === 'numerical') {
      buckets.numerical.push(name);
    }
    const roles = Array.isArray(column?.roles) ? column.roles : [];
    if (roles.includes('identifier')) {
      buckets.identifiers.push(name);
    }
    if (roles.includes('dimension')) {
      buckets.dimensions.push(name);
    }
    if (roles.includes('measure')) {
      buckets.measures.push(name);
    }
    if (roles.includes('currency')) {
      buckets.currencies.push(name);
    }
    if (roles.includes('percentage')) {
      buckets.percentages.push(name);
    }
    if (roles.includes('time')) {
      buckets.time.push(name);
    }
  });
  const dedupe = list => Array.from(new Set(list));
  Object.keys(buckets).forEach(key => {
    buckets[key] = dedupe(buckets[key]);
  });
  return buckets;
};

const summariseRowStats = (metadata, rawDataSample) => {
  const toNum = value => {
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num : null;
  };
  const original = metadata ? toNum(metadata.originalRowCount) : null;
  const cleaned = metadata ? toNum(metadata.cleanedRowCount) : null;
  const contextCount = metadata ? toNum(metadata.contextRowCount) : null;
  const removed = metadata ? toNum(metadata.removedRowCount) : null;
  const rawSampleCount = Array.isArray(rawDataSample) ? rawDataSample.length : null;
  const cleanedCount = cleaned ?? original ?? rawSampleCount ?? contextCount;
  const removedRows =
    removed ?? (original !== null && cleaned !== null ? Math.max(original - cleaned, 0) : null);
  return {
    cleanedCount,
    removedRows,
  };
};

const summariseCardContext = cardContext => {
  const list = Array.isArray(cardContext) ? cardContext : [];
  const titles = list
    .map(card => (card?.title ? String(card.title).trim() : ''))
    .filter(Boolean);
  return {
    count: list.length,
    latestTitles: titles.slice(-3).reverse(),
  };
};

const takeSentences = (text, limit = 2) => {
  if (!text || typeof text !== 'string') return [];
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const matches = cleaned.match(/[^。.!?]+[。.!?]?/g) || [cleaned];
  return matches.map(sentence => sentence.trim()).filter(Boolean).slice(0, limit);
};

const ensureList = value => {
  if (Array.isArray(value)) {
    return value.map(item => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return [];
};

const deriveOpeningSummary = context => {
  const datasetLabel = context?.datasetTitle || '資料集';
  const columnStats = summariseColumns(context?.columns);
  const rowStats = summariseRowStats(context?.metadata, context?.rawDataSample);
  const cardStats = summariseCardContext(context?.cardContext);
  const columnText = columnStats.total
    ? `${columnStats.total} 欄（${columnStats.numericalCount} 數值 / ${columnStats.categoricalCount} 類別）`
    : '欄位資訊待確認';
  const rowText = rowStats.cleanedCount ? `${formatNumber(rowStats.cleanedCount)} 筆 ready` : '筆數尚待解析';
  const progressText = cardStats.count
    ? `目前已生成 ${cardStats.count} 張分析卡`
    : '尚未建立任何分析卡';

  if (context?.mode === 'fallback') {
    const reason = context?.fallbackReason || '上一輪模型回應缺少可執行結構';
    return `⚠️ ${reason}。資料集「${datasetLabel}」仍保持載入狀態（${columnText}、${rowText}），等你重新下達指令。`;
  }

  return `👋 Dataset「${datasetLabel}」ready — ${columnText}，${rowText}，${progressText}。`;
};

const deriveInsightLines = context => {
  if (context?.mode === 'fallback' && context?.fallbackReason) {
    return [
      `Safe mode: ${context.fallbackReason}，資料已保留，請重新描述你的需求。`,
    ];
  }
  const aiSummarySentences = takeSentences(context?.aiCoreAnalysisSummary, 3);
  if (aiSummarySentences.length) {
    return aiSummarySentences;
  }
  const cardStats = summariseCardContext(context?.cardContext);
  if (cardStats.count) {
    return cardStats.latestTitles.map(title => `分析卡已就緒：${title}`);
  }
  const columnStats = summariseColumns(context?.columns);
  if (columnStats.sampleNames.length) {
    const columnLine = `可用欄位 sample：${columnStats.sampleNames.join(', ')}`;
    const totalLine = columnStats.total
      ? `總計 ${columnStats.total} 欄，可針對其中任意欄位建立統計/圖表。`
      : null;
    return [columnLine, totalLine].filter(Boolean);
  }
  return ['等你指定想要分析的欄位或假設。'];
};

const deriveRiskLines = context => {
  if (context?.mode === 'fallback') {
    return [
      context?.fallbackReason
        ? `上一輪輸出未通過驗證：${context.fallbackReason}`
        : '上一輪輸出未通過驗證，已切換安全模式。',
    ];
  }
  const rowStats = summariseRowStats(context?.metadata, context?.rawDataSample);
  if (rowStats.removedRows) {
    return [
      `資料清理階段移除了 ${formatNumber(rowStats.removedRows)} 列（subtotal/空值等），必要時可切到 Raw 資料檢查。`,
    ];
  }
  const cardStats = summariseCardContext(context?.cardContext);
  if (!cardStats.count) {
    return ['尚未執行圖表或演算，目前沒有額外風險。'];
  }
  return ['請留意欄位定義與單位是否一致，需要我復核時直接告訴我。'];
};

const deriveRecommendationLines = context => {
  if (context?.mode === 'fallback') {
    return [
      '請再描述一次需求（越具體的欄位/篩選條件越好），我會立即重跑分析。',
      '若問題持續，可直接指定想比較的欄位名稱，我會改用替代方案執行。',
    ];
  }
  const columnStats = summariseColumns(context?.columns);
  const cardStats = summariseCardContext(context?.cardContext);
  if (!cardStats.count) {
    if (columnStats.sampleNames.length >= 2) {
      const [first, second, third] = columnStats.sampleNames;
      const compareTarget = second || third || columnStats.sampleNames[0];
      return [
        `可以請我分析 ${first} by ${compareTarget}，或指定你關心的 KPI/條件。`,
        '也能先幫你做資料品質檢查、清理摘要列或建立新的指標。',
      ];
    }
    if (columnStats.sampleNames.length === 1) {
      return [
        `若想了解 ${columnStats.sampleNames[0]} 的趨勢或分佈，直接告訴我想看的切角即可。`,
      ];
    }
    return ['告訴我想看的欄位、條件或假設，我就會立即開始分析。'];
  }
  const latestTitle = cardStats.latestTitles[0];
  const secondTitle = cardStats.latestTitles[1];
  const columnFallback = columnStats.sampleNames[0];
  return [
    latestTitle ? `可以深入 ${latestTitle}，例如加入篩選或比較不同區段。` : '可以要求我深入最新的分析卡。',
    secondTitle
      ? `也能延伸 ${secondTitle}，把不同維度放在同一張圖表比較。`
      : columnFallback
      ? `或請我針對 ${columnFallback} 建立新的拆解圖表。`
      : '需要其他指標、預測或報告時直接告訴我。',
  ].filter(Boolean);
};

const formatListSection = lines => {
  if (!lines || !lines.length) {
    return '- 尚無更新';
  }
  return lines.map(line => `- ${line}`).join('\n');
};

const buildStructuredTextResponse = (sections = {}, context = {}) => {
  const summary =
    (typeof sections.openingSummary === 'string' && sections.openingSummary.trim()) ||
    deriveOpeningSummary(context);
  const insightsLines = (() => {
    const provided = ensureList(sections.insights);
    return provided.length ? provided : deriveInsightLines(context);
  })();
  const riskLines = (() => {
    const provided = ensureList(sections.risks);
    return provided.length ? provided : deriveRiskLines(context);
  })();
  const recommendationLines = (() => {
    const provided = ensureList(sections.recommendations);
    return provided.length ? provided : deriveRecommendationLines(context);
  })();

  return `Opening summary: ${summary || '目前沒有新的洞察，等你發出指令。'}
Key insights list:
${formatListSection(insightsLines)}
Risks or limitations:
${formatListSection(riskLines)}
Recommended actions / next step for the user:
${formatListSection(recommendationLines)}`;
};

const validateActionResponse = response => {
  if (!response || typeof response !== 'object') {
    return 'AI response payload is empty.';
  }
  if (!Array.isArray(response.actions) || !response.actions.length) {
    return 'The AI response does not contain a valid actions array.';
  }
  const missingThought = response.actions.find(
    action => !action || typeof action.thought !== 'string' || !action.thought.trim()
  );
  if (missingThought) {
    return 'The AI response is missing a required "thought" field on one or more actions.';
  }
  return null;
};

const buildFallbackActionResponse = (rawText, context = {}) => {
  const fallbackReason = 'LLM 回覆缺少有效 actions 結構';
  const sanitizedSummary =
    typeof rawText === 'string' && rawText.trim()
      ? rawText.trim().split('\n').slice(0, 2).join(' ')
      : `⚠️ ${fallbackReason}，但資料仍保持載入狀態，可重新下達指令。`;
  const fallbackText = buildStructuredTextResponse(
    {
      openingSummary: sanitizedSummary,
    },
    { ...context, mode: 'fallback', fallbackReason }
  );
  return {
    actions: [
      {
        responseType: 'text_response',
        thought: 'LLM 回覆缺少有效的 actions 結構，改以安全模板回應使用者並請求新的輸入。',
        text: fallbackText,
      },
    ],
  };
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

const getStageDetailSchema = () => {
  if (!GeminiType) return null;
  if (!stageDetailSchemaCache) {
    stageDetailSchemaCache = {
      type: GeminiType.OBJECT,
      properties: {
        goal: {
          type: GeminiType.STRING,
          description: 'High-level objective for this stage.',
        },
        checkpoints: {
          type: GeminiType.ARRAY,
          description: 'Ordered micro-steps the agent will follow.',
          items: {
            type: GeminiType.STRING,
            description: 'Single actionable checkpoint.',
          },
        },
        heuristics: {
          type: GeminiType.ARRAY,
          description: 'Rules of thumb or signals to watch for while executing this stage.',
          items: {
            type: GeminiType.STRING,
          },
        },
        fallbackStrategies: {
          type: GeminiType.ARRAY,
          description: 'Contingency plans if the primary checkpoints fail.',
          items: {
            type: GeminiType.STRING,
          },
        },
        expectedArtifacts: {
          type: GeminiType.ARRAY,
          description: 'Concrete outputs produced by this stage (e.g. detected title string).',
          items: {
            type: GeminiType.STRING,
          },
        },
        nextAction: {
          type: GeminiType.STRING,
          description: 'What the agent should do immediately after completing this stage.',
        },
        status: {
          type: GeminiType.STRING,
          enum: ['pending', 'in_progress', 'ready'],
          description: 'Stage readiness indicator.',
        },
        logMessage: {
          type: GeminiType.STRING,
          description: 'Single sentence summarizing the current progress for UI logs.',
        },
      },
      required: ['goal', 'checkpoints'],
    };
  }
  return stageDetailSchemaCache;
};

const getStagePlanSchema = () => {
  if (!GeminiType) return null;
  if (!stagePlanSchemaCache) {
    stagePlanSchemaCache = {
      type: GeminiType.OBJECT,
      properties: {
        titleExtraction: {
          description: 'Plan for isolating report titles and metadata rows.',
          ...getStageDetailSchema(),
        },
        headerResolution: {
          description: 'Plan for detecting header rows and producing canonical column names.',
          ...getStageDetailSchema(),
        },
        dataNormalization: {
          description: 'Plan for row-level cleansing/unpivoting/number normalization.',
          ...getStageDetailSchema(),
        },
      },
      required: ['titleExtraction', 'headerResolution', 'dataNormalization'],
    };
  }
  return stagePlanSchemaCache;
};

const getAgentLogEntrySchema = () => {
  if (!GeminiType) return null;
  if (!agentLogEntrySchemaCache) {
    agentLogEntrySchemaCache = {
      type: GeminiType.OBJECT,
      properties: {
        stage: {
          type: GeminiType.STRING,
          enum: ['title', 'header', 'data', 'general'],
          description: 'Which stage this log entry refers to.',
        },
        thought: {
          type: GeminiType.STRING,
          description: 'What the agent is thinking/observing.',
        },
        action: {
          type: GeminiType.STRING,
          description: 'Concrete action or tool call to perform next.',
        },
        status: {
          type: GeminiType.STRING,
          description: 'Optional status label such as pending/in_progress/done.',
        },
      },
      required: ['stage', 'thought'],
    };
  }
  return agentLogEntrySchemaCache;
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
        stagePlan: {
          description:
            'Structured multi-stage plan (title/header/data) describing how the agent will iteratively clean the dataset.',
          ...getStagePlanSchema(),
        },
        agentLog: {
          type: GeminiType.ARRAY,
          description: 'Running log of agent thoughts/actions for UI display.',
          items: getAgentLogEntrySchema(),
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
        toolCalls: {
          type: GeminiType.ARRAY,
          description:
            'Optional list of tool invocations to run before writing code. Each call must specify a recognized tool name and args.',
          items: {
            type: GeminiType.OBJECT,
            properties: {
              tool: {
                type: GeminiType.STRING,
                enum: ['detect_headers', 'remove_summary_rows', 'detect_identifier_columns'],
                description: 'Tool identifier to execute.',
              },
              args: {
                type: GeminiType.STRING,
                description: 'JSON string containing arguments for the tool call.',
              },
            },
            required: ['tool'],
          },
        },
      },
      required: ['explanation', 'analysisSteps', 'outputColumns', 'stagePlan'],
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

const getChatPlanSchema = () => {
  if (!GeminiType) return null;
  if (!chatPlanSchemaCache) {
    chatPlanSchemaCache = {
      type: GeminiType.OBJECT,
      properties: {
        steps: {
          type: GeminiType.ARRAY,
          description: 'Small, sequential steps for diagnose/plan/execute phases.',
          items: {
            type: GeminiType.OBJECT,
            properties: {
              id: { type: GeminiType.STRING },
              phase: { type: GeminiType.STRING },
              goal: { type: GeminiType.STRING },
              notes: { type: GeminiType.STRING },
              toolHints: {
                type: GeminiType.ARRAY,
                items: { type: GeminiType.STRING },
              },
            },
            required: ['phase', 'goal'],
          },
        },
      },
      required: ['steps'],
    };
  }
  return chatPlanSchemaCache;
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

  if (/^(?:async\s+)?function\b/i.test(core)) {
    return wrapInvocation(core);
  }

  const tryMatchAndWrap = patterns => {
    for (const pattern of patterns) {
      const match = core.match(pattern);
      if (match && match[1]) {
        return wrapInvocation(match[1]);
      }
    }
    return null;
  };

  const wrapped =
    tryMatchAndWrap([
      /^(?:const|let|var)\s+[a-zA-Z_$][\w$]*\s*=\s*((?:async\s+)?function\s*\([^)]*\)\s*{[\s\S]*})\s*;?\s*$/i,
      /^(?:const|let|var)\s+[a-zA-Z_$][\w$]*\s*=\s*((?:async\s*)?\([^)]*\)\s*=>\s*(?:{[\s\S]*}|[^\n;]+))\s*;?\s*$/i,
      /^export\s+default\s+((?:async\s+)?function\s*\([^)]*\)\s*{[\s\S]*})\s*;?\s*$/i,
      /^module\.exports\s*=\s*((?:async\s+)?function\s*\([^)]*\)\s*{[\s\S]*})\s*;?\s*/i,
      /^((?:async\s*)?\([^)]*\)\s*=>\s*(?:{[\s\S]*}|[^\n;]+))\s*;?\s*$/i,
      /^((?:async\s*)?[a-zA-Z_$][\w$]*\s*=>\s*(?:{[\s\S]*}|[^\n;]+))\s*;?\s*$/i,
    ]) || null;

  if (wrapped) {
    return wrapped;
  }

  return core;
};

const callOpenAIJson = async (settings, systemPrompt, userPrompt, options = {}) => {
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
  const rawContent = response?.choices?.[0]?.message?.content || '';
  const parsed = cleanJson(rawContent);
  if (options.includeRaw) {
    return { parsed, rawText: rawContent };
  }
  return parsed;
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
    generationConfig: {
      thinkingConfig: {
        thinkingBudget: 1888,
      },
    },
  };
  const { schema, includeRaw } = options || {};
  if (schema) {
    config.responseSchema = schema;
  }
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config,
    })
  );
  const rawText = typeof response.text === 'function' ? await response.text() : response.text;
  const parsed = cleanJson(rawText);
  if (includeRaw) {
    return { parsed, rawText };
  }
  return parsed;
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

const CHAT_PHASES = ['diagnose', 'plan', 'execute', 'adjust', 'verify'];

const createFallbackChatPlan = (intent = 'general') => [
  {
    id: 'step-1',
    phase: 'diagnose',
    goal: `快速確認意圖（${intent}）並找出需要的資料列或圖卡。`,
    toolHints: ['thought_log'],
  },
  {
    id: 'step-2',
    phase: 'plan',
    goal: '決定要使用的卡片/工具（例如 highlightCard 或 plan_creation）。',
    toolHints: ['plan_creation', 'dom_action'],
  },
  {
    id: 'step-3',
    phase: 'execute',
    goal: '執行動作並給出 text_response，包含下一步建議。',
    toolHints: ['text_response'],
  },
];

const normaliseChatPlanSteps = rawPlan => {
  const rawSteps = Array.isArray(rawPlan?.steps) ? rawPlan.steps : [];
  const normalized = rawSteps
    .map((step, index) => {
      if (!step || typeof step !== 'object') {
        return null;
      }
      const phase = typeof step.phase === 'string' ? step.phase.toLowerCase().trim() : 'execute';
      return {
        id: step.id || step.stepId || `step-${index + 1}`,
        phase: CHAT_PHASES.includes(phase) ? phase : 'execute',
        goal: typeof step.goal === 'string' && step.goal.trim()
          ? step.goal.trim()
          : typeof step.task === 'string'
            ? step.task.trim()
            : '回應使用者需求',
        notes: typeof step.notes === 'string' ? step.notes.trim() : step.reasoning || null,
        toolHints: Array.isArray(step.toolHints)
          ? step.toolHints
              .map(hint => (typeof hint === 'string' ? hint.trim() : ''))
              .filter(Boolean)
              .slice(0, 4)
          : [],
      };
    })
    .filter(Boolean)
    .slice(0, 5);
  return normalized.length ? normalized : null;
};

const summariseCardsForPlanPrompt = cardContext => {
  if (!Array.isArray(cardContext) || !cardContext.length) {
    return 'No analysis cards yet.';
  }
  return cardContext
    .slice(0, 5)
    .map(card => {
      const title = card?.title || card?.id || 'Untitled card';
      return `- ${title}`;
    })
    .join('\n');
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
  const columnBuckets = deriveColumnBuckets(columns);

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
  if (!normalized.groupByColumn) {
    normalized.groupByColumn =
      columnBuckets.identifiers[0] ||
      columnBuckets.time[0] ||
      columnBuckets.dimensions[0] ||
      columnBuckets.categorical[0] ||
      null;
  }
  if (!normalized.valueColumn && normalized.chartType !== 'scatter') {
    normalized.valueColumn =
      columnBuckets.currencies[0] ||
      columnBuckets.measures[0] ||
      columnBuckets.percentages[0] ||
      columnBuckets.numerical[0] ||
      null;
  }

  const valueColumnMatches = columnName =>
    columnName &&
    normalized.valueColumn &&
    columnName.toLowerCase() === String(normalized.valueColumn).toLowerCase();
  const hasNumericValueColumn = columns.some(column => {
    if (!column?.name) return false;
    const matches = valueColumnMatches(column.name);
    if (!matches) return false;
    if (column.type === 'numerical') {
      return true;
    }
    if (Array.isArray(column.roles)) {
      return column.roles.some(role =>
        ['measure', 'currency', 'percentage'].includes(role)
      );
    }
    return false;
  });
  if (SUPPORTED_AGGREGATIONS.has(maybeAggregation)) {
    normalized.aggregation = maybeAggregation;
  } else {
    normalized.aggregation = hasNumericValueColumn ? 'sum' : 'count';
  }

  if (normalized.aggregation === 'count') {
    if (hasNumericValueColumn && normalized.valueColumn) {
      normalized.aggregation = 'sum';
    } else {
      normalized.valueColumn = null;
    }
  } else if (!normalized.valueColumn) {
    normalized.aggregation = 'count';
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
          const hint =
            entry.lastError && typeof entry.lastError === 'string'
              ? ` Last error: ${entry.lastError}`
              : '';
          return `- Iteration ${entry.iteration}: status=${statusLabel}. ${explanation}${hint}`;
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

  const headerMappingSection = (() => {
    if (!iterationContext || typeof iterationContext !== 'object') {
      return '';
    }
    const headerMapping = iterationContext.headerMapping;
    if (!headerMapping || typeof headerMapping !== 'object') {
      return '';
    }
    const mapping = headerMapping.mapping;
    if (!mapping || typeof mapping !== 'object') {
      return '';
    }
    const entries = Object.entries(mapping);
    if (!entries.length) {
      return '';
    }
    const preview = entries
      .slice(0, 12)
      .map(([from, to]) => `- ${from} -> ${to}`)
      .join('\n');
    const mappingJson = JSON.stringify(mapping, null, 2);
    const fallbackReminder = headerMapping.hasUnmapped
      ? '\nSome targets still fall back to generic names. Detect descriptive headers dynamically whenever possible.'
      : '';
    return `Header mapping (already detected — NEVER hard-code "column_N" outside this block):
${preview || '- (mapping summary available)'}
Embed and use it like this:
const HEADER_MAPPING = ${mappingJson};
const canonical = _util.applyHeaderMapping(row, HEADER_MAPPING);
// Always reference canonical["Field Name"] to avoid brittle code.${fallbackReminder}`;
  })();

  const mandatorySummaryBullet = offendingSummaryText
    ? `- **MANDATORY SUMMARY REMOVAL**: These rows were flagged as summaries and must be excluded from the transformed dataset: ${offendingSummaryText}. If any should remain, set status="abort" and justify.`
    : '- **MANDATORY SUMMARY REMOVAL**: Any row matching the summary keywords must be excluded from the transformed dataset. When uncertain, remove the row and mention it in your status message.';

  const columnContextBlock = (() => {
    if (!iterationContext || typeof iterationContext !== 'object') {
      return '\n';
    }
    const columnContext = iterationContext.columnContext;
    if (!columnContext || typeof columnContext !== 'object') {
      return '\n';
    }
    const lines = [];
    if (typeof columnContext.totalColumns === 'number') {
      const categorical =
        typeof columnContext.categoricalColumns === 'number' ? columnContext.categoricalColumns : 0;
      const numerical =
        typeof columnContext.numericalColumns === 'number' ? columnContext.numericalColumns : 0;
      lines.push(
        `Columns detected: ${columnContext.totalColumns} (categorical: ${categorical}, numerical: ${numerical}).`
      );
    }
    if (Array.isArray(columnContext.sampleNames) && columnContext.sampleNames.length) {
      lines.push(`Canonical column samples: ${columnContext.sampleNames.join(', ')}`);
    }
    if (Array.isArray(columnContext.headerPairs) && columnContext.headerPairs.length) {
      const preview = columnContext.headerPairs
        .slice(0, 12)
        .map(entry => `- ${entry}`)
        .join('\n');
      lines.push(`Generic → canonical mapping hints:\n${preview}`);
    }
    if (
      columnContext.semanticSummary &&
      typeof columnContext.semanticSummary === 'object' &&
      Object.keys(columnContext.semanticSummary).length
    ) {
      const breakdown = Object.entries(columnContext.semanticSummary)
        .map(([key, count]) => `${key}: ${count}`)
        .join(', ');
      lines.push(`Semantic breakdown: ${breakdown}`);
    }
    const appendList = (items, label) => {
      if (Array.isArray(items) && items.length) {
        lines.push(`${label}: ${items.join(', ')}`);
      }
    };
    appendList(columnContext.identifierColumns, 'Identifier candidates');
    appendList(columnContext.dateColumns, 'Date/period columns');
    appendList(columnContext.currencyColumns, 'Currency columns');
    appendList(columnContext.percentageColumns, 'Percentage columns');
    appendList(columnContext.trickyColumns, 'Mixed identifier columns');
    return lines.length ? `Column context:\n${lines.join('\n')}\n\n` : '\n';
  })();

  const headerMappingBlock = headerMappingSection ? `\n${headerMappingSection}\n` : '\n';
  const violationGuidance =
    iterationContext &&
    typeof iterationContext === 'object' &&
    typeof iterationContext.violationGuidance === 'string'
      ? iterationContext.violationGuidance.trim()
      : '';
  const violationGuidanceBlock = violationGuidance
    ? `\n**Immediate Fix Guidance:**\n${violationGuidance}\n`
    : '\n';
  const toolHistoryBlock =
    iterationContext &&
    Array.isArray(iterationContext.toolHistory) &&
    iterationContext.toolHistory.length
      ? `\nRecent Tool Results:\n${iterationContext.toolHistory
          .slice(-5)
          .map(entry => {
            const label = entry.tool || 'tool';
            const payload = entry.result || entry.identifiers || entry;
            return `- ${label}: ${JSON.stringify(payload)}`;
          })
          .join('\n')}\n`
      : '\n';
  const helpersDescription = `\nAvailable Helpers (invoke via _util.<name>):\n- detectHeaders(metadata)\n- removeSummaryRows(rows, keywords?)\n- detectIdentifierColumns(rows, metadata)\n- normalizeNumber(value, options?)\n- isValidIdentifierValue(value)\n- describeColumns(metadata)\nIf you need to run a dedicated tool instead of writing code, respond with "toolCalls": [{"tool":"detect_headers","args":"{\"strategies\":[\"metadata\",\"sample\"]}"}] and omit jsFunctionBody. The "args" field MUST be a JSON string.`;
  const failureContextBlock = (() => {
    const context = lastError?.failureContext;
    if (!context) {
      return '\n';
    }
    const lines = ['\n**Previous Failure Diagnostics:**'];
    if (context.reason) {
      lines.push(`- Reason: ${context.reason}`);
    }
    if (context.codePreview) {
      lines.push('- Code preview (first 400 chars):', '```javascript', context.codePreview.slice(0, 400), '```');
    }
    if (context.sampleRows) {
      const sampleText = JSON.stringify(context.sampleRows, null, 2);
      lines.push('- Sample rows excerpt:', '```json', sampleText.slice(0, 400), '```');
    }
    return `${lines.join('\n')}\n`;
  })();
  const stagePlanContract = `\nStage Planning Contract (Vanilla Agent):\n- ALWAYS populate \`stagePlan\` with three objects: \`titleExtraction\`, \`headerResolution\`, and \`dataNormalization\`.\n- Treat每個階段 as an independent micro-goal: checkpoints must be tiny, verifiable actions (e.g., “Inspect rows 0–2 for title text”, “Call detectHeaders to confirm canonical names”) rather than a single large paragraph.\n- Each stage must include: goal, ordered checkpoints, heuristics, fallbackStrategies, expectedArtifacts, nextAction, status, and a concise logMessage so the UI can narrate progress step by step.\n- Provide \`agentLog\` entries (e.g., {"stage":"title","thought":"Row 0 looks like a title","action":"store row 0 as metadata"}) so engineers can audit the thinking trail and Raw Data Explorer can explain what changed.\n- Prefer setting \`jsFunctionBody\` to null. Only emit code if the transformation is trivial or you can faithfully translate the stage plan into deterministic steps; otherwise describe the algorithm inside \`stagePlan\` so the Vanilla Agent can execute it tool-by-tool.\n- When a Crosstab/wide layout is detected, explicitly outline the unpivot logic inside \`dataNormalization\` (identifier detection, iteration ranges, helper calls) and avoid relying on hard-coded indices.`;

  return `${contextSection}${columnContextBlock}${iterationSummary}${multiPassRules}${headerMappingBlock}${violationGuidanceBlock}${toolHistoryBlock}${helpersDescription}${stagePlanContract}${failureContextBlock}

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
- **HEADER MAPPING IS MANDATORY**: Always embed the provided \`HEADER_MAPPING\` snippet (or dynamically detect one) and access fields via \`const canonical = _util.applyHeaderMapping(row, HEADER_MAPPING)\`. If no mapping is supplied, call the detection helpers first.
- **NO HARD-CODED INDEXES**: You must dynamically detect header rows and identifier columns by examining the provided sample rows. Never assume fixed row numbers or literal labels (e.g., "Code", "Description") will exist. Use fallbacks (e.g., scanning for rows with many text cells followed by rows with numeric cells) so the transform works even when column labels change.

${headerMappingPreview ? `Generic to inferred header mapping:\n${headerMappingPreview}\n` : ''}
${hasCrosstabShape ? `CROSSTAB ALERT:
- The dataset contains many generic columns (e.g., column_1, column_2...). Treat these as pivoted metrics that must be unpivoted/melted into tidy rows.
- Preserve identifier columns (codes, descriptions, category labels) as-is.
- For each pivot column, produce rows with explicit fields such as { Code, Description, PivotColumnName, PivotValue } so every numeric value becomes its own observation.
- Document the unpivot procedure explicitly inside \`stagePlan.dataNormalization\` (list identifier detection, iteration ranges, helper calls). Only include code if the plan cannot be expressed clearly.
- After reshaping, update \`outputColumns\` to reflect the tidy structure (e.g., 'code' categorical, 'project' categorical, 'pivot_column' categorical, 'pivot_value' numerical).
- Include logic to drop empty or subtotal rows but keep hierarchical parent rows.\n` : ''}

Dataset Columns (Initial Schema):
${JSON.stringify(columns, null, 2)}
Sample Data (up to 20 rows):
${JSON.stringify(sampleRowsForPrompt, null, 2)}
${lastError ? `On the previous attempt, your generated code failed with this error: "${lastError.message}". Please analyze the error and provide a corrected response.` : ''}

Your task:
1. **Study (Think Step-by-Step)**: Describe what you observe in the dataset. List the problems (multi-row headers, totals, blank/title rows, etc.). Output this as \`analysisSteps\` — a detailed, ordered list of your reasoning before coding.
2. **Plan Transformation**: Based on those steps, decide on the exact cleaning/reshaping actions (unpivot, drop rows, rename columns, parse numbers, etc.) and fill the \`stagePlan\` object (title → header → data).
3. **Define Output Schema**: Determine the exact column names and data types AFTER your transformation. Use specific types where possible: 'categorical', 'numerical', 'date', 'time', 'currency', 'percentage'.
4. **Stage Deliverable (Optional Code)**: If a concise JavaScript snippet is necessary, write the body of a function that receives \`data\` and \`_util\` and returns the transformed array. Otherwise set \`jsFunctionBody\` to null and rely on the stage plan.
5. **Explain**: Provide a concise, user-facing explanation of what you did.

**CRITICAL REQUIREMENTS:**
- Never assume specific header text exists. If you cannot confidently locate headers or identifier columns, throw an Error explaining what data was missing instead of returning an empty array.
- You MUST provide the \`analysisSteps\` array capturing your chain-of-thought (observations ➜ decisions ➜ actions). Each item should be a full sentence.
- You MUST provide the \`outputColumns\` array. If no transformation is needed, it should match the input schema (but update types if you discovered more specific ones).
- If you provide JavaScript, it MUST include a \`return\` statement that returns the transformed data array.
- Mirror your \`stagePlan\` checkpoints in code and comments. Each checkpoint should translate into a tiny sequential action (e.g., remove metadata rows → resolve headers → normalize rows) so the UI can narrate progress and verify Raw Data Explorer shows the same result.
- Never access \`data\` using numeric literals (e.g., \`data[0]\`, \`data[3]\`, \`data[data.length - 1]\`). Determine headers/rows dynamically via the provided helper utilities.
- Whenever you convert numbers, you MUST use \`_util.parseNumber\`. Whenever you split comma-separated numeric strings, you MUST use \`_util.splitNumericString\`.
- When the dataset exhibits the Crosstab alert, your \`stagePlan.dataNormalization\` must detail the unpivot algorithm (identifier detection, per-column iteration, parsing). Include code only if absolutely necessary.
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
        const { parsed, rawText } = await callGeminiJson(settings, combinedPrompt, {
          schema,
          includeRaw: true,
        });
        plan = parsed;
        if (!plan) {
          const parseError = new Error('AI response is empty.');
          parseError.rawResponse = rawText;
          throw parseError;
        }
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

      plan.stagePlan = normaliseStagePlan(plan.stagePlan);
      plan.agentLog = normaliseAgentLogEntries(plan.agentLog);

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
        console.log('Stage plan:', plan.stagePlan);
        if (plan.agentLog && plan.agentLog.length) {
          console.log('Agent log:', plan.agentLog);
        }
        console.log('Sample rows sent to model (first 20):', sampleRowsForPrompt.slice(0, 20));
        console.log('Full plan payload:', plan);
      } finally {
        console.groupEnd();
      }

      if (plan.jsFunctionBody) {
        const normalizedJsBody = sanitizeJsFunctionBody(plan.jsFunctionBody);
        plan.jsFunctionBody = normalizedJsBody;
        console.log('Sanitized jsFunctionBody preview:', normalizedJsBody);
        // Mirror the runtime helper surface so validation executes exactly what the agent can do.
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
          applyHeaderMapping: (row, mapping) => applyHeaderMappingHelper(row, mapping),
          detectHeaders: metadata => detectHeadersTool({ metadata }),
          removeSummaryRows: (rows, keywords) =>
            removeSummaryRowsTool({ data: rows, keywords }).cleanedData,
          detectIdentifierColumns: (rows, metadata) =>
            detectIdentifierColumnsTool({ data: rows, metadata }).identifiers,
          isValidIdentifierValue: value => isLikelyIdentifierValue(value),
          normalizeNumber: (value, options) => normalizeCurrencyValue(value, options),
          describeColumns: metadata => describeColumnsHelper(metadata),
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
          const wrappedError = error instanceof Error ? error : new Error(String(error));
          wrappedError.failureContext = {
            type: 'js_validation_error',
            reason: wrappedError.message,
            codePreview: normalizedJsBody ? normalizedJsBody.slice(0, 800) : null,
            sampleRows: normalizedSampleData.slice(0, 3),
          };
          lastError = wrappedError;
          console.warn(`AI-generated transformation failed validation (attempt ${attempt + 1}).`, wrappedError);
          continue;
        }
      }

      return plan;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Error in data preparation plan generation (attempt ${attempt + 1}):`, lastError);
    }
  }

  const finalError = new Error(
    `AI failed to generate a valid data preparation plan after multiple attempts. Last error: ${lastError?.message}`
  );
  if (lastError && lastError.rawResponse) {
    finalError.rawResponse = lastError.rawResponse;
  }
  throw finalError;
};

export const generateChatStepPlan = async (planInput = {}, settings = {}) => {
  const fallbackPlan = createFallbackChatPlan(planInput.intent);
  const provider = settings.provider || 'google';
  const isApiKeySet = provider === 'google' ? !!settings.geminiApiKey : !!settings.openAIApiKey;
  if (!isApiKeySet) {
    return { steps: fallbackPlan, source: 'fallback', reason: 'missing_api_key' };
  }

  const fragments = buildPromptFragments({
    columns: Array.isArray(planInput.columns) ? planInput.columns : [],
    metadata: planInput.metadata || null,
    currentView: planInput.currentView,
    intent: planInput.intent,
    language: settings.language,
    dataPreparationPlan: planInput.dataPreparationPlan || null,
    skillCatalog: Array.isArray(planInput.skillCatalog) ? planInput.skillCatalog : [],
    memoryContext: Array.isArray(planInput.memoryContext) ? planInput.memoryContext : [],
  });

  const cardsSummary = summariseCardsForPlanPrompt(planInput.cardContext);
  const planSystemPrompt =
    'You are a workflow planner for a CSV analysis agent. Return JSON with 2-4 concise steps (diagnose/plan/execute/verify). Each step should describe a tiny action and optional tool hints.';
  const planUserPrompt = `Dataset overview:\n${fragments.datasetOverview}\n\nAvailable skills:\n${fragments.skillLibrary}\n\nRelevant memories:\n${fragments.memoryPreview}\n\nExisting cards:\n${cardsSummary}\n\nCore analysis summary:\n${planInput.aiCoreAnalysisSummary || 'None'}\n\nLatest user message: "${planInput.userPrompt || ''}"\nDetected intent: ${planInput.intent || 'general'}\n`;

  try {
    let rawPlan;
    if (provider === 'openai') {
      rawPlan = await callOpenAIJson(settings, planSystemPrompt, planUserPrompt);
    } else {
      rawPlan = await callGeminiJson(settings, `${planSystemPrompt}\n${planUserPrompt}`, {
        schema: getChatPlanSchema(),
      });
    }
    const normalized = normaliseChatPlanSteps(rawPlan) || fallbackPlan;
    const usedFallback = normalized === fallbackPlan;
    return { steps: normalized, source: usedFallback ? 'fallback' : 'llm' };
  } catch (error) {
    console.warn('Chat step planning failed. Falling back to default plan.', error);
    return {
      steps: fallbackPlan,
      source: 'fallback',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
};

const buildAnalysisPlanPrompt = (columns, sampleData, numPlans, metadata) => {
  const buckets = deriveColumnBuckets(columns);
  const categorical = buckets.categorical;
  const numerical = buckets.numerical;
  const identifiers = buckets.identifiers;
  const measures = buckets.measures;
  const currencies = buckets.currencies;
  const timeCols = buckets.time;
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
- Identifiers: ${identifiers.join(', ') || 'None'}
- Measures: ${measures.join(', ') || 'None'}
- Currency columns: ${currencies.join(', ') || 'None'}
- Time columns: ${timeCols.join(', ') || 'None'}
Sample rows:
${JSON.stringify(sampleData.slice(0, 5), null, 2)}
Generate up to ${numPlans} insightful analysis plans as a JSON array. Each plan must have:
- chartType (bar|line|pie|doughnut|scatter)
- title
- description
- aggregation (sum|count|avg) when applicable
- groupByColumn and valueColumn when applicable
When choosing columns:
- Prefer identifier/time columns for groupBy fields.
- Prefer measures/currency columns for value columns.
Avoid generating plans with dozens of categories (keep charts readable).`;
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
  dataPreparationPlan = null,
  chatStepPlan = null
) => {
  const provider = settings.provider || 'google';
  const isApiKeySet =
    provider === 'google' ? !!settings.geminiApiKey : !!settings.openAIApiKey;
  if (!isApiKeySet) {
    return { actions: [{ responseType: 'text_response', text: 'Cloud AI is disabled. API Key not provided.' }] };
  }

  const trimmedHistory = trimChatHistory(Array.isArray(chatHistory) ? chatHistory : []);
  const categoricalCols = columns.filter(c => c.type === 'categorical').map(c => c.name);
  const numericalCols = columns.filter(c => c.type === 'numerical').map(c => c.name);
  const history = trimmedHistory.map(m => `${m.sender}: ${m.text}`).join('\n');
  const recentSystemMessages = trimmedHistory
    .filter(msg => msg.sender === 'system')
    .slice(-MAX_SYSTEM_MESSAGES)
    .map(msg => `- [${msg.type || 'system'}] ${msg.text}`)
    .join('\n');
  const systemSection = recentSystemMessages ? `**Recent System Messages:**\n${recentSystemMessages}\n` : '';

  const datasetTitle = metadata?.reportTitle || 'Not detected';
  const normalizedUserPrompt = typeof userPrompt === 'string' ? userPrompt.trim() : '';
  const isGeneralIntent = !intent || intent === 'general';
  if (isGeneralIntent && isGreetingOnly(normalizedUserPrompt)) {
    const greetingText = buildStructuredTextResponse(
      {},
      {
        mode: 'greeting',
        datasetTitle,
        columns,
        cardContext,
        aiCoreAnalysisSummary,
        metadata,
        rawDataSample,
        intent,
      }
    );
    return {
      actions: [
        {
          responseType: 'text_response',
          thought: '使用者只有打招呼，先以輕量問候並提示可提供協助，避免浪費額外的 LLM token。',
          text: greetingText,
        },
      ],
    };
  }

  const fragments = buildPromptFragments({
    columns,
    metadata,
    currentView,
    intent,
    language: settings.language,
    dataPreparationPlan,
    skillCatalog: Array.isArray(skillCatalog) ? skillCatalog.slice(0, MAX_SKILL_PROMPT_ENTRIES) : [],
    memoryContext: Array.isArray(memoryContext)
      ? memoryContext.slice(0, MAX_MEMORY_PROMPT_ENTRIES)
      : [],
  });

  const cardsPreview = cardContext && cardContext.length
    ? JSON.stringify(cardContext.slice(0, 6), null, 2)
    : 'No analysis cards yet.';

  const rawDataPreview = rawDataSample && rawDataSample.length
    ? JSON.stringify(rawDataSample.slice(0, 12), null, 2)
    : 'No raw data available.';

  const coreBriefing = aiCoreAnalysisSummary || 'No core analysis has been performed yet. This is your first look at the data.';
  const coreBriefingSection = `**CORE ANALYSIS BRIEFING (Your Memory):**
${coreBriefing}
`;

  const dataPreparationSection = fragments.dataPreparationLog;

  const guidingPrinciples = `**Guiding Principles & Common Sense:**
1. Synthesize and interpret: connect insights and explain the business implications—the "so what?".
2. Understand intent and sanity-check requests; if the data cannot support an ask, clarify and suggest alternatives.
3. Be proactive: surface key trends, outliers, risks, or opportunities.
4. Use business language focused on performance, contribution, and impact.
`;

  const datasetOverview = fragments.datasetOverview;
  const plannedStepsSection = (() => {
    if (!chatStepPlan || !Array.isArray(chatStepPlan.steps) || !chatStepPlan.steps.length) {
      return '';
    }
    const summary = chatStepPlan.steps
      .map((step, index) => {
        const phaseLabel = (step.phase || 'step').toUpperCase();
        const hints = Array.isArray(step.toolHints) && step.toolHints.length
          ? ` (tools: ${step.toolHints.join(', ')})`
          : '';
        return `${index + 1}. [${phaseLabel}] ${step.goal}${hints}`;
      })
      .join('\n');
    return `**Planned Steps (follow sequentially):**\n${summary}\n`;
  })();

  const responseTemplate = `**Response Template (use for text_response):**
1. Opening summary (1-2 sentences) stating the main takeaway.
2. Key insights list (each bullet = insight + supporting metric / card reference).
3. Risks or limitations (state "None" if not applicable).
4. Recommended actions / next step for the user.
Always follow this structure unless the user requests something extremely specific that conflicts with it.`;

  const actionsInstructions = `${fragments.toolInstructions}
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
${plannedStepsSection}
${dataPreparationSection}
**Analysis Cards on Screen:**
${cardsPreview}

**Raw Data Sample (first 12 rows for context):**
${rawDataPreview}

${fragments.skillLibrary}
${fragments.memoryPreview}
${systemSection}${conversationSection}
**Latest User Message:** "${userPrompt}"

${responseTemplate}

${actionsInstructions}
`;

  const systemPrompt = `You are an expert data analyst and business strategist operating with a Reason+Act (ReAct) mindset. Respond in ${settings.language}. Your entire reply MUST be a single JSON object containing an "actions" array, and each action MUST include a "thought" that clearly explains your reasoning before the action. When producing a text_response, follow the Response Template exactly (opening summary, key insights, risks, recommendations).`;

  let result;
  let openAIRawText = '';
  const geminiSchema = provider === 'google' ? getMultiActionChatResponseSchema() : null;
  if (provider === 'openai') {
    const { parsed, rawText } = await callOpenAIJson(
      settings,
      systemPrompt,
      userPromptWithContext,
      { includeRaw: true }
    );
    result = parsed;
    openAIRawText = rawText;
  } else {
    result = await callGeminiJson(
      settings,
      `${systemPrompt}\n${userPromptWithContext}`,
      { schema: geminiSchema }
    );
  }

  const validationError = validateActionResponse(result);
  if (validationError) {
    if (provider === 'openai') {
      console.warn('OpenAI chat payload invalid, using fallback text response.', validationError);
      return buildFallbackActionResponse(openAIRawText, {
        datasetTitle,
        columns,
        cardContext,
        aiCoreAnalysisSummary,
        metadata,
        rawDataSample,
        intent,
      });
    }
    throw new Error(validationError);
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
