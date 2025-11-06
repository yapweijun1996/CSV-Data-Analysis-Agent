import { createHeaderMapping, applyHeaderMapping } from './headerMapping.js';
import {
  detectHeadersTool,
  removeSummaryRowsTool,
  detectIdentifierColumnsTool,
  normalizeCurrencyValue,
} from './dataPrepTools.js';

const DEFAULT_SUMMARY_KEYWORDS = [
  'total',
  'subtotal',
  'grand total',
  'balance',
  'summary',
  'remarks',
  'note',
  'overall',
  'report',
];

const STAGE_DESCRIPTORS = [
  { key: 'titleExtraction', label: 'Title & Metadata' },
  { key: 'headerResolution', label: 'Header Resolution' },
  { key: 'dataNormalization', label: 'Data Rows' },
];

const ROW_RANGE_REGEX =
  /rows?\s*(\d+)(?:\s*(?:[-–—]|to|through)\s*(\d+)|\s*(?:and|&)\s*(\d+))?/gi;

const collectStageText = stage => {
  if (!stage || typeof stage !== 'object') {
    return '';
  }
  const parts = [];
  const append = value => {
    if (typeof value === 'string' && value.trim()) {
      parts.push(value.trim());
    }
  };
  ['goal', 'logMessage', 'nextAction', 'status', 'notes'].forEach(key => append(stage[key]));
  ['checkpoints', 'heuristics', 'fallbackStrategies', 'expectedArtifacts'].forEach(key => {
    if (Array.isArray(stage[key]) && stage[key].length) {
      parts.push(stage[key].join(' '));
    }
  });
  return parts.join(' ');
};

const extractRowIndicesFromText = text => {
  if (!text || typeof text !== 'string') {
    return [];
  }
  const indices = [];
  let match;
  while ((match = ROW_RANGE_REGEX.exec(text))) {
    const start = Number.parseInt(match[1], 10);
    const endCandidate = match[2] || match[3];
    const end = endCandidate !== undefined ? Number.parseInt(endCandidate, 10) : start;
    if (Number.isNaN(start)) {
      continue;
    }
    const resolvedEnd = Number.isNaN(end) ? start : end;
    const rangeStart = Math.min(start, resolvedEnd);
    const rangeEnd = Math.max(start, resolvedEnd);
    for (let value = rangeStart; value <= rangeEnd; value++) {
      indices.push(value);
    }
  }
  return indices;
};

const deriveStagePlanHints = stagePlan => {
  const hints = {
    metadataRowCount: null,
    headerRowCount: null,
    pivotRange: null,
    requiresUnpivot: false,
    excludeTotals: false,
    identifierLabels: [],
    pivotFieldLabel: null,
    valueFieldLabel: null,
  };
  if (!stagePlan || typeof stagePlan !== 'object') {
    return hints;
  }

  const stageTexts = {};
  STAGE_DESCRIPTORS.forEach(descriptor => {
    stageTexts[descriptor.key] = collectStageText(stagePlan[descriptor.key]);
  });
  const combinedText = Object.values(stageTexts)
    .filter(Boolean)
    .join(' ');

  if (/\b(unpivot|melt|wide format|crosstab)\b/i.test(combinedText)) {
    hints.requiresUnpivot = true;
  }
  if (/total\s+column|exclude\s+total/i.test(combinedText)) {
    hints.excludeTotals = true;
  }

  const pivotMatches = [...combinedText.matchAll(/column_(\d+)/gi)];
  if (pivotMatches.length) {
    const indices = pivotMatches
      .map(match => Number.parseInt(match[1], 10))
      .filter(Number.isFinite);
    if (indices.length) {
      hints.pivotRange = {
        start: Math.min(...indices),
        end: Math.max(...indices),
      };
    }
  }

  const metadataIndices = extractRowIndicesFromText(stageTexts.titleExtraction || '');
  if (metadataIndices.length) {
    hints.metadataRowCount = Math.max(...metadataIndices) + 1;
  }

  const headerIndices = extractRowIndicesFromText(stageTexts.headerResolution || '');
  if (headerIndices.length >= 2) {
    hints.headerRowCount = headerIndices.length;
  } else if (headerIndices.length === 1) {
    hints.headerRowCount = 1;
  }

  const identifierLabels = [];
  if (/account[_\s]?code/i.test(combinedText)) identifierLabels.push('Account_Code');
  if (/account[_\s]?description/i.test(combinedText)) identifierLabels.push('Account_Description');
  if (/payee name/i.test(combinedText)) identifierLabels.push('Payee Name');
  if (/invoice month/i.test(combinedText)) identifierLabels.push('Invoice Month');
  if (/code column/i.test(combinedText)) identifierLabels.push('Code');
  if (/description column/i.test(combinedText)) identifierLabels.push('Description');
  hints.identifierLabels = Array.from(new Set(identifierLabels));

  if (/project[_\s]?name/i.test(combinedText)) {
    hints.pivotFieldLabel = 'Project_Name';
  } else if (/project/i.test(combinedText)) {
    hints.pivotFieldLabel = 'Project';
  }
  if (/amount/i.test(stageTexts.dataNormalization || combinedText)) {
    hints.valueFieldLabel = 'Amount';
  }

  return hints;
};

const normaliseString = value => {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value.trim() : String(value).trim();
};

const buildOrderedGenericKeys = (metadata, sampleRow) => {
  if (Array.isArray(metadata?.genericHeaders) && metadata.genericHeaders.length) {
    return metadata.genericHeaders.slice();
  }
  const sourceRow = sampleRow || {};
  return Object.keys(sourceRow)
    .filter(key => /^column_\d+$/i.test(key))
    .sort((a, b) => {
      const numA = Number.parseInt(a.replace(/[^\d]/g, ''), 10) || 0;
      const numB = Number.parseInt(b.replace(/[^\d]/g, ''), 10) || 0;
      return numA - numB;
    });
};

const buildPivotColumnsFromHeaders = (headerRows, orderedKeys, hints) => {
  if (!Array.isArray(headerRows) || !headerRows.length) {
    return [];
  }
  const pivotRange = hints?.pivotRange;
  return orderedKeys
    .map(key => {
      const columnIndex = Number.parseInt(key.replace(/[^\d]/g, ''), 10) || 0;
      if (columnIndex <= 2) {
        return null;
      }
      if (
        pivotRange &&
        (columnIndex < pivotRange.start || columnIndex > pivotRange.end)
      ) {
        return null;
      }
      const labelParts = headerRows
        .map(row => normaliseString(row?.[key]))
        .filter(Boolean);
      const label = labelParts.length ? labelParts.join(' - ') : key;
      if (!label) {
        return null;
      }
      if (hints?.excludeTotals && /total/i.test(label)) {
        return null;
      }
      return { key, label };
    })
    .filter(Boolean);
};

const parseNumberSafe = value => {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = normalizeCurrencyValue(value, { allowNegative: true });
  if (normalized === null || Number.isNaN(normalized)) {
    const fallback = Number.parseFloat(String(value).replace(/,/g, ''));
    return Number.isNaN(fallback) ? null : fallback;
  }
  return normalized;
};

const extractReportingDetails = rows => {
  if (!Array.isArray(rows) || !rows.length) {
    return null;
  }
  const joined = rows
    .flatMap(row => Object.values(row || {}).map(value => String(value || '')))
    .join(' ');
  if (!joined) {
    return null;
  }
  const rangeMatch = joined.match(/Reporting Date\s*:\s*([\d./-]+)\s*Through\s*([\d./-]+)/i);
  const currencyMatch = joined.match(/Reporting Currency\s*:\s*([A-Z]{3})/i);
  const titleMatch = joined.match(/(Income Statement|Balance Sheet|Cash Flow)[^,;]*/i);
  return {
    reportTitle: titleMatch ? titleMatch[0].trim() : null,
    reportingPeriodStart: rangeMatch ? rangeMatch[1] : null,
    reportingPeriodEnd: rangeMatch ? rangeMatch[2] : null,
    reportingCurrency: currencyMatch ? currencyMatch[1] : null,
  };
};

const unpivotWideTable = ({
  headerRows,
  dataRows,
  metadata,
  hints,
}) => {
  if (!Array.isArray(headerRows) || !headerRows.length) {
    return { applied: false, reason: 'Stage plan requested unpivot but header rows are missing.' };
  }
  if (!Array.isArray(dataRows) || !dataRows.length) {
    return { applied: false, reason: 'No data rows available for unpivoting.' };
  }
  const orderedKeys = buildOrderedGenericKeys(metadata, dataRows[0]);
  if (!orderedKeys.length) {
    return { applied: false, reason: 'Unable to determine column ordering for unpivot.' };
  }
  const pivotColumns = buildPivotColumnsFromHeaders(headerRows, orderedKeys, hints);
  if (!pivotColumns.length) {
    return { applied: false, reason: 'Unable to derive pivot columns from header rows.' };
  }
  const identifierKeys = orderedKeys.slice(0, 2);
  const identifierLabels = hints?.identifierLabels?.length
    ? hints.identifierLabels
    : ['Code', 'Description'];
  const pivotFieldLabel = hints?.pivotFieldLabel || 'Pivot_Column';
  const valueFieldLabel = hints?.valueFieldLabel || 'Value';
  const reportingDetails = extractReportingDetails(headerRows);

  const tidyRows = [];
  dataRows.forEach(row => {
    const identifierValues = identifierKeys.map(key => normaliseString(row?.[key]));
    const hasIdentifiers = identifierValues.some(value => Boolean(value));
    if (!hasIdentifiers) {
      return;
    }
    pivotColumns.forEach(pivot => {
      const rawValue = row?.[pivot.key];
      const parsedValue = parseNumberSafe(rawValue);
      if (parsedValue === null) {
        return;
      }
      const record = {};
      record[identifierLabels[0] || identifierKeys[0] || 'Identifier_1'] = identifierValues[0] || null;
      if (identifierLabels[1] || identifierKeys[1]) {
        record[identifierLabels[1] || identifierKeys[1]] = identifierValues[1] || null;
      }
      record[pivotFieldLabel] = pivot.label;
      record[valueFieldLabel] = parsedValue;
      if (reportingDetails?.reportingCurrency) {
        record.Reporting_Currency = reportingDetails.reportingCurrency;
      }
      if (reportingDetails?.reportingPeriodStart) {
        record.Reporting_Period_Start = reportingDetails.reportingPeriodStart;
      }
      if (reportingDetails?.reportingPeriodEnd) {
        record.Reporting_Period_End = reportingDetails.reportingPeriodEnd;
      }
      tidyRows.push(record);
    });
  });

  if (!tidyRows.length) {
    return { applied: false, reason: 'Unpivot produced zero rows. Ensure numeric values exist.' };
  }

  const summary = `Unpivoted ${pivotColumns.length} columns (${orderedKeys[0]} → ${pivotColumns[pivotColumns.length - 1].key}); produced ${tidyRows.length} tidy rows from ${dataRows.length} source rows.`;

  return {
    applied: true,
    data: tidyRows,
    summary,
    pivotColumns,
    reportingDetails,
  };
};

const cloneStringArray = value =>
  Array.isArray(value) ? value.map(item => normaliseString(item)).filter(Boolean) : [];

const cloneStageDetail = (input, fallbackGoal = '') => ({
  goal: normaliseString(input?.goal) || fallbackGoal,
  checkpoints: cloneStringArray(input?.checkpoints),
  heuristics: cloneStringArray(input?.heuristics),
  fallbackStrategies: cloneStringArray(input?.fallbackStrategies),
  expectedArtifacts: cloneStringArray(input?.expectedArtifacts),
  nextAction: normaliseString(input?.nextAction) || null,
  status: input?.status || 'pending',
  logMessage: normaliseString(input?.logMessage) || `${fallbackGoal || 'Stage'} pending`,
});

const cloneStagePlan = plan => {
  const clone = {};
  STAGE_DESCRIPTORS.forEach(descriptor => {
    clone[descriptor.key] = cloneStageDetail(plan?.[descriptor.key], descriptor.label);
  });
  return clone;
};

const isMetadataRow = row => {
  if (!row || typeof row !== 'object') {
    return false;
  }
  const values = Object.values(row).map(normaliseString);
  const nonEmpty = values.filter(Boolean);
  if (!nonEmpty.length) {
    return true;
  }
  if (nonEmpty.length > 3) {
    return false;
  }
  const hasNumerics = nonEmpty.some(value => /\d/.test(value));
  return !hasNumerics;
};

const extractTitleFromRow = row => {
  const values = Object.values(row || {}).map(normaliseString).filter(Boolean);
  if (!values.length) {
    return null;
  }
  return values.join(' ').trim();
};

const stripMetadataRows = (rows, limit = 3, preferredCount = null) => {
  if (!Array.isArray(rows) || !rows.length) {
    return { metadataRows: [], remainingRows: [] };
  }
  if (Number.isFinite(preferredCount) && preferredCount > 0) {
    return {
      metadataRows: rows.slice(0, preferredCount),
      remainingRows: rows.slice(preferredCount),
    };
  }
  const metadataRows = [];
  let cursor = 0;
  while (cursor < rows.length && metadataRows.length < limit) {
    const currentRow = rows[cursor];
    if (!isMetadataRow(currentRow)) {
      break;
    }
    metadataRows.push(currentRow);
    cursor += 1;
  }
  return {
    metadataRows,
    remainingRows: rows.slice(cursor),
  };
};

const ensureGenericHeaders = (metadata, sampleRow) => {
  if (Array.isArray(metadata?.genericHeaders) && metadata.genericHeaders.length) {
    return metadata.genericHeaders;
  }
  const fallback = sampleRow && typeof sampleRow === 'object' ? Object.keys(sampleRow) : [];
  if (fallback.length) {
    return fallback;
  }
  return [];
};

const normaliseSummaryKeywords = keywords =>
  Array.isArray(keywords) && keywords.length
    ? keywords.map(keyword => keyword.toLowerCase())
    : DEFAULT_SUMMARY_KEYWORDS;

const stageLabel = key => {
  const descriptor = STAGE_DESCRIPTORS.find(item => item.key === key);
  return descriptor ? descriptor.label : key;
};

export const executeStagePlanPipeline = ({
  data,
  metadata = {},
  stagePlan = {},
  options = {},
} = {}) => {
  if (!Array.isArray(data) || !data.length) {
    return { applied: false, reason: 'No data available' };
  }

  const summaryKeywords = normaliseSummaryKeywords(options.summaryKeywords);
  let workingData = data.map(row => ({ ...(row || {}) }));
  const updatedMetadata = { ...metadata };
  const stagePlanClone = cloneStagePlan(stagePlan);
  const hints = deriveStagePlanHints(stagePlan);
  const stageLogs = [];
  const totalBefore = workingData.length;

  const updateStageStatus = (stageKey, status, message) => {
    if (stagePlanClone[stageKey]) {
      stagePlanClone[stageKey].status = status;
      stagePlanClone[stageKey].logMessage = message;
    }
    stageLogs.push({
      stage: stageKey,
      stageLabel: stageLabel(stageKey),
      status,
      message,
    });
  };

  // Stage 1: Title / metadata rows
  const preferredMetadataCount = Number.isFinite(hints.metadataRowCount) ? hints.metadataRowCount : null;
  const { metadataRows, remainingRows } = stripMetadataRows(
    workingData,
    options.maxMetadataRows || 3,
    preferredMetadataCount
  );
  if (metadataRows.length) {
    const titleCandidate = extractTitleFromRow(metadataRows[0]);
    const existingTitle = normaliseString(updatedMetadata.reportTitle);
    if (titleCandidate && !existingTitle) {
      updatedMetadata.reportTitle = titleCandidate;
    }
    updatedMetadata.leadingRows = (updatedMetadata.leadingRows || []).concat(
      metadataRows.map(row => Object.values(row).map(normaliseString))
    );
    updatedMetadata.totalLeadingRows =
      (updatedMetadata.totalLeadingRows || 0) + metadataRows.length;
    workingData = remainingRows;
    updateStageStatus(
      'titleExtraction',
      'ready',
      titleCandidate
        ? `Detected title "${titleCandidate}" and removed ${metadataRows.length} metadata row(s).`
          : `Removed ${metadataRows.length} metadata row(s).`
    );
  } else {
    updateStageStatus('titleExtraction', 'ready', 'No standalone title rows detected.');
  }

  if (!Array.isArray(workingData) || !workingData.length) {
    return {
      applied: false,
      reason: 'All rows were metadata; no data left after title detection.',
      stagePlan: stagePlanClone,
      logs: stageLogs,
    };
  }

  const headerRowCountHint =
    Number.isFinite(hints.headerRowCount) && hints.headerRowCount > 0
      ? hints.headerRowCount
      : hints.requiresUnpivot
        ? 2
        : 0;
  const safeHeaderCount =
    headerRowCountHint > 0 ? Math.min(headerRowCountHint, workingData.length) : 0;
  let headerRows = safeHeaderCount ? workingData.slice(0, safeHeaderCount) : [];
  workingData = safeHeaderCount ? workingData.slice(safeHeaderCount) : workingData;
  updatedMetadata.headerRows = headerRows;

  // Stage 2: Header resolution
  const headerDetection = detectHeadersTool({
    metadata: updatedMetadata,
    sampleRows: workingData.slice(0, 6),
    strategies: ['stage_plan_executor'],
  });
  const detectedHeaderIndex =
    typeof headerDetection.headerIndex === 'number' && headerDetection.headerIndex >= 0
      ? headerDetection.headerIndex
      : null;
  if (!headerRows.length && detectedHeaderIndex !== null) {
    const headerSliceCount = Math.min(detectedHeaderIndex + 1, workingData.length);
    headerRows = workingData.slice(0, headerSliceCount);
    workingData = workingData.slice(headerSliceCount);
  }
  const inferredHeaders =
    (Array.isArray(headerDetection.headers) && headerDetection.headers.length
      ? headerDetection.headers
      : Array.isArray(updatedMetadata.inferredHeaders) && updatedMetadata.inferredHeaders.length
      ? updatedMetadata.inferredHeaders
      : null) || [];

  if (inferredHeaders.length) {
    updatedMetadata.inferredHeaders = inferredHeaders;
  }

  const genericHeaders = ensureGenericHeaders(updatedMetadata, workingData[0]);
  const mappingResult = createHeaderMapping(
    {
      genericHeaders,
      inferredHeaders,
    },
    { fallbackPrefix: 'column_' }
  );
  updatedMetadata.headerMapping = mappingResult.mapping;

  updateStageStatus(
    'headerResolution',
    inferredHeaders.length ? 'ready' : 'pending',
    inferredHeaders.length
      ? `Mapped ${mappingResult.detected}/${mappingResult.total} headers (strategy: ${headerDetection.strategy || 'sample'}).`
      : 'Unable to infer canonical headers; using generic column names.'
  );

  // Stage 3: Data normalization
  if (hints.requiresUnpivot) {
    const unpivotResult = unpivotWideTable({
      headerRows,
      dataRows: workingData,
      metadata: updatedMetadata,
      hints,
    });
    if (!unpivotResult.applied) {
      updateStageStatus('dataNormalization', 'abort', unpivotResult.reason);
      return {
        applied: false,
        reason: unpivotResult.reason,
        stagePlan: stagePlanClone,
        logs: stageLogs,
      };
    }
    if (unpivotResult.reportingDetails) {
      updatedMetadata.reportingPeriodStart = unpivotResult.reportingDetails.reportingPeriodStart || updatedMetadata.reportingPeriodStart;
      updatedMetadata.reportingPeriodEnd = unpivotResult.reportingDetails.reportingPeriodEnd || updatedMetadata.reportingPeriodEnd;
      updatedMetadata.reportingCurrency = unpivotResult.reportingDetails.reportingCurrency || updatedMetadata.reportingCurrency;
      updatedMetadata.reportTitle = unpivotResult.reportingDetails.reportTitle || updatedMetadata.reportTitle;
    }
    updatedMetadata.cleanedRowCount = unpivotResult.data.length;
    updateStageStatus('dataNormalization', 'ready', unpivotResult.summary);

    return {
      applied: true,
      data: unpivotResult.data,
      metadata: updatedMetadata,
      stagePlan: stagePlanClone,
      logs: stageLogs,
      summary: unpivotResult.summary,
      originalRowCount: totalBefore,
      rowCount: unpivotResult.data.length,
    };
  }

  const canonicalRows = workingData.map(row =>
    applyHeaderMapping(row, updatedMetadata.headerMapping || {})
  );
  const summaryResult = removeSummaryRowsTool({
    data: canonicalRows,
    keywords: summaryKeywords,
  });
  const cleanedRows = summaryResult.cleanedData;
  if (!cleanedRows.length) {
    updateStageStatus(
      'dataNormalization',
      'abort',
      'Stage plan executor produced zero rows; aborting to avoid data loss.'
    );
    return {
      applied: false,
      reason: 'Data normalization produced zero rows.',
      stagePlan: stagePlanClone,
      logs: stageLogs,
    };
  }
  const identifierResult = detectIdentifierColumnsTool({
    data: cleanedRows,
    metadata: updatedMetadata,
  });
  updatedMetadata.cleanedRowCount = cleanedRows.length;
  updatedMetadata.removedSummaryRowCount =
    (updatedMetadata.removedSummaryRowCount || 0) + summaryResult.removedRows.length;
  updatedMetadata.identifierColumns = identifierResult.identifiers;

  updateStageStatus(
    'dataNormalization',
    'ready',
    `Removed ${summaryResult.removedRows.length} summary row(s); identified ${identifierResult.identifiers.length} identifier column(s).`
  );

  const summary = `Rows ${totalBefore} → ${cleanedRows.length} · summary rows removed ${summaryResult.removedRows.length}`;

  return {
    applied: true,
    data: cleanedRows,
    metadata: updatedMetadata,
    stagePlan: stagePlanClone,
    logs: stageLogs,
    summary,
    originalRowCount: totalBefore,
    rowCount: cleanedRows.length,
  };
};
