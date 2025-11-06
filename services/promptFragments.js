const MAX_CACHE_ENTRIES = 32;

const datasetOverviewCache = new Map();
const dataPrepCache = new Map();
const skillLibraryCache = new Map();
const toolInstructionsCache = new Map();
const memoryPreviewCache = new Map();

const fnv1a = text => {
  const normalized = typeof text === 'string' ? text : JSON.stringify(text ?? null);
  if (!normalized || normalized.length === 0) {
    return '0';
  }
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
    hash >>>= 0;
  }
  return hash.toString(16);
};

const buildCacheKey = parts => parts.filter(Boolean).join('|');

const setCache = (cache, key, value) => {
  cache.set(key, value);
  if (cache.size > MAX_CACHE_ENTRIES) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  return value;
};

const summariseColumns = columns => {
  const list = Array.isArray(columns) ? columns : [];
  const categorical = [];
  const numerical = [];
  list.forEach(column => {
    if (!column || typeof column !== 'object') {
      return;
    }
    if (column.type === 'categorical') {
      categorical.push(column.name);
    } else if (column.type === 'numerical') {
      numerical.push(column.name);
    }
  });
  return {
    categorical,
    numerical,
  };
};

export const formatMetadataContext = (metadata, options = {}) => {
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

const buildDatasetOverview = ({ columns, metadata, currentView, intent, language }) => {
  const { categorical, numerical } = summariseColumns(columns);
  const datasetTitle = metadata?.reportTitle || 'Not detected';
  const categoricalList = categorical.slice(0, 8).join(', ') || 'None';
  const numericalList = numerical.slice(0, 8).join(', ') || 'None';
  const metadataContext = formatMetadataContext(metadata, {
    leadingRowLimit: 5,
    contextRowLimit: 8,
  });
  const header = language === 'zh-TW' ? '資料總覽' : 'Dataset Overview';
  const lines = [
    `**${header}**`,
    `- Title: ${datasetTitle}`,
    `- Current View: ${currentView || 'N/A'}`,
    `- Detected Intent: ${intent || 'general'}`,
    `- Categorical Columns: ${categoricalList}`,
    `- Numerical Columns: ${numericalList}`,
  ];
  if (metadataContext) {
    lines.push(metadataContext);
  }
  return lines.join('\n');
};

const buildDataPreparationLog = dataPreparationPlan => {
  if (!dataPreparationPlan) {
    return '**DATA PREPARATION LOG:**\nNo AI-driven data preparation was performed.';
  }
  const explanation = dataPreparationPlan.explanation || 'AI suggested preparing the data before analysis.';
  const codeBlock = dataPreparationPlan.jsFunctionBody
    ? `Code Executed: \`\`\`javascript\n${dataPreparationPlan.jsFunctionBody}\n\`\`\``
    : 'Code Executed: None (AI determined no transformation was necessary).';
  return `**DATA PREPARATION LOG:**\n${explanation}\n${codeBlock}`;
};

const buildSkillLibrary = skillCatalog => {
  if (!Array.isArray(skillCatalog) || !skillCatalog.length) {
    return '**Skill Library:**\nNo reusable skills are registered.';
  }
  const capped = skillCatalog.slice(0, 8).map(skill => {
    const id = skill?.id || 'unnamed-skill';
    const label = skill?.label || 'Untitled Skill';
    const description = skill?.description || 'No description';
    return `- [${id}] ${label}: ${description}`;
  });
  return `**Skill Library (${capped.length} available):**\n${capped.join('\n')}`;
};

const TOOL_INSTRUCTIONS_TEXT = `**Available Actions & Tools**
1. \`text_response\`: Conversational reply. Include \`cardId\` when referencing a card.
2. \`plan_creation\`: Propose a NEW chart. Provide a full plan object and set \`defaultTopN\` / \`defaultHideOthers\` for wide categories.
3. \`dom_action\`: Interact with UI elements (highlight cards, adjust chart options, control raw data filters/sorts, etc.).
4. \`execute_js_code\`: Supply JavaScript transformations for data cleansing/prep and pair with a \`text_response\` that explains results.
- Never call \`setRawDataFilter\` without a query. Ask the user for specifics if uncertain.
- Conclude with a \`text_response\` summarizing outcomes and suggesting the next action.`;

const buildMemoryPreview = memoryContext => {
  if (!Array.isArray(memoryContext) || !memoryContext.length) {
    return '**LONG-TERM MEMORY (Top Matches):**\nNo specific long-term memories seem relevant to this query.';
  }
  const capped = memoryContext.slice(0, 5).map(item => {
    const score = typeof item.score === 'number' ? item.score.toFixed(2) : 'n/a';
    const summary = item.summary || item.text || '';
    const kind = item.kind || 'note';
    return `- (${kind} | score ${score}) ${summary}`;
  });
  return `**LONG-TERM MEMORY (Top Matches):**\n${capped.join('\n')}`;
};

export const getDatasetOverviewFragment = params => {
  const key = buildCacheKey([
    params?.metadata?.datasetFingerprint || params?.metadata?.datasetId || 'unknown-dataset',
    params?.currentView || 'unknown-view',
    params?.intent || 'general',
    params?.language || 'en',
    fnv1a((params?.columns || []).map(column => `${column?.name}:${column?.type}`)),
  ]);
  if (datasetOverviewCache.has(key)) {
    return datasetOverviewCache.get(key);
  }
  return setCache(datasetOverviewCache, key, buildDatasetOverview(params));
};

export const getDataPreparationFragment = dataPreparationPlan => {
  const key = dataPreparationPlan ? fnv1a([dataPreparationPlan.explanation, dataPreparationPlan.jsFunctionBody]) : 'none';
  if (dataPrepCache.has(key)) {
    return dataPrepCache.get(key);
  }
  return setCache(dataPrepCache, key, buildDataPreparationLog(dataPreparationPlan));
};

export const getSkillLibraryFragment = skillCatalog => {
  const key = fnv1a(skillCatalog || []);
  if (skillLibraryCache.has(key)) {
    return skillLibraryCache.get(key);
  }
  return setCache(skillLibraryCache, key, buildSkillLibrary(skillCatalog));
};

export const getToolInstructionsFragment = () => {
  const key = 'default-tool-instructions';
  if (toolInstructionsCache.has(key)) {
    return toolInstructionsCache.get(key);
  }
  return setCache(toolInstructionsCache, key, TOOL_INSTRUCTIONS_TEXT);
};

export const getMemoryPreviewFragment = memoryContext => {
  const key = fnv1a(memoryContext || []);
  if (memoryPreviewCache.has(key)) {
    return memoryPreviewCache.get(key);
  }
  return setCache(memoryPreviewCache, key, buildMemoryPreview(memoryContext));
};

export const buildPromptFragments = params => {
  return {
    datasetOverview: getDatasetOverviewFragment(params),
    dataPreparationLog: getDataPreparationFragment(params?.dataPreparationPlan || null),
    skillLibrary: getSkillLibraryFragment(params?.skillCatalog || []),
    memoryPreview: getMemoryPreviewFragment(params?.memoryContext || []),
    toolInstructions: getToolInstructionsFragment(),
  };
};
