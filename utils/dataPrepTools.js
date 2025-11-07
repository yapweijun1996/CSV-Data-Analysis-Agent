const DEFAULT_SUMMARY_KEYWORDS = [
  'total',
  'subtotal',
  'summary',
  'grand total',
  'report',
  'balance',
  'subtotal for',
];

const normaliseString = value =>
  typeof value === 'string'
    ? value.trim().toLowerCase()
    : String(value || '').trim().toLowerCase();

const denormaliseString = value => (typeof value === 'string' ? value.trim() : String(value || '').trim());

const normaliseKeywords = keywords =>
  Array.isArray(keywords) && keywords.length ? keywords.map(keyword => keyword.toLowerCase()) : [];

const safeRows = rows => (Array.isArray(rows) ? rows.filter(Boolean) : []);

const buildFingerprint = values => values.filter(Boolean).join('|');

const extractOrderedValues = (row, metadata) => {
  if (!row || typeof row !== 'object') {
    return [];
  }
  const headerOrder =
    Array.isArray(metadata?.headerRow) && metadata.headerRow.length
      ? metadata.headerRow
      : Array.isArray(metadata?.inferredHeaders) && metadata.inferredHeaders.length
      ? metadata.inferredHeaders
      : null;
  const genericOrder =
    Array.isArray(metadata?.genericHeaders) && metadata.genericHeaders.length
      ? metadata.genericHeaders
      : null;
  const pickValues = order =>
    order.map(name =>
      normaliseString(Object.prototype.hasOwnProperty.call(row, name) ? row[name] : '')
    );
  if (headerOrder) {
    const values = pickValues(headerOrder);
    if (values.some(value => value)) {
      return values;
    }
  }
  if (genericOrder) {
    const values = pickValues(genericOrder);
    if (values.some(value => value)) {
      return values;
    }
  }
  return Object.keys(row)
    .sort()
    .map(key => normaliseString(row[key]));
};

const tokenise = value =>
  value
    .split(/[^A-Za-z0-9%]+/g)
    .map(token => token.trim().toLowerCase())
    .filter(token => token && token.length <= 32 && !/^\d+$/.test(token));

const deriveHeaderTokens = (metadata, extraKeywords = []) => {
  const tokens = new Set();
  const sources = [
    ...(Array.isArray(metadata?.headerRow) ? metadata.headerRow : []),
    ...(Array.isArray(metadata?.inferredHeaders) ? metadata.inferredHeaders : []),
    ...(Array.isArray(metadata?.structureEvidence?.headerPairs)
      ? metadata.structureEvidence.headerPairs
      : []),
    ...(Array.isArray(extraKeywords) ? extraKeywords : []),
  ];
  sources.forEach(value => {
    if (!value) return;
    const raw =
      typeof value === 'string'
        ? value
        : Array.isArray(value)
        ? value.join(' ')
        : String(value);
    tokenise(raw).forEach(token => tokens.add(token));
  });
  return tokens;
};

const isHeaderLikeRow = (values, headerTokens) => {
  if (!values.length) return false;
  if (headerTokens && headerTokens.size) {
    const matches = values.filter(value => headerTokens.has(value)).length;
    if (matches > 0) {
      const coverage = matches / Math.max(values.length, headerTokens.size);
      if (coverage >= 0.6 && matches >= Math.min(headerTokens.size, 2)) {
        return true;
      }
    }
  }
  const textish = values.filter(value => value && !/\d{2,}/.test(value) && value.length <= 30);
  return textish.length >= Math.max(2, Math.ceil(values.length * 0.6));
};

const stripNumericPrefix = value => value.replace(/^[\d.\s-:]+/, '').trim();

export const detectHeadersTool = ({ metadata, sampleRows = [], strategies = [] } = {}) => {
  const inferredHeaders = Array.isArray(metadata?.inferredHeaders) ? metadata.inferredHeaders : [];
  if (inferredHeaders.length) {
    return {
      headerIndex: typeof metadata?.detectedHeaderIndex === 'number' ? metadata.detectedHeaderIndex : 0,
      headers: inferredHeaders,
      confidence: 0.9,
      strategy: 'metadata.inferredHeaders',
    };
  }

  const candidateRow = safeRows(sampleRows).find(row => row && typeof row === 'object');
  const headers = candidateRow ? Object.keys(candidateRow) : [];

  return {
    headerIndex: 0,
    headers,
    confidence: headers.length ? 0.5 : 0,
    strategy: strategies.join(',') || 'sampleRows',
  };
};

export const removeLeadingRowsTool = ({ data, metadata, maxRows = 8, keywords = [] } = {}) => {
  const rows = safeRows(data);
  const cleanedData = [];
  const removedRows = [];
  const stats = { titleRows: 0, headerRows: 0, leadingRows: 0 };
  const reportTitle =
    typeof metadata?.reportTitle === 'string' ? metadata.reportTitle.trim().toLowerCase() : '';
  const headerTokens = deriveHeaderTokens(metadata, keywords);
  const headerFingerprint =
    headerTokens.size && Array.isArray(metadata?.headerRow)
      ? buildFingerprint(metadata.headerRow.map(value => normaliseString(value)))
      : null;
  const leadingFingerprints = new Set(
    (Array.isArray(metadata?.leadingRows) ? metadata.leadingRows : [])
      .map(row => (Array.isArray(row) ? buildFingerprint(row.map(value => normaliseString(value))) : ''))
      .filter(Boolean)
  );

  rows.forEach((row, index) => {
    if (!row) {
      return;
    }
    const values = extractOrderedValues(row, metadata);
    const fingerprint = buildFingerprint(values);
    const nonEmpty = values.filter(Boolean);
    const withinScanWindow = index < maxRows;
    let reason = null;
    if (withinScanWindow && reportTitle) {
      const hasTitleMatch = nonEmpty.some(value => value === reportTitle);
      const looseMatch = nonEmpty.some(value => stripNumericPrefix(value) === reportTitle);
      if (hasTitleMatch || looseMatch) {
        reason = 'title';
      }
    }
    if (!reason && withinScanWindow && leadingFingerprints.has(fingerprint)) {
      reason = 'leading';
    }
    if (
      !reason &&
      withinScanWindow &&
      ((headerFingerprint && fingerprint === headerFingerprint) || isHeaderLikeRow(nonEmpty, headerTokens))
    ) {
      reason = 'header';
    }
    if (
      !reason &&
      withinScanWindow &&
      nonEmpty.length === 1 &&
      nonEmpty[0] &&
      nonEmpty[0].length > 12 &&
      !/\d/.test(nonEmpty[0])
    ) {
      reason = 'title';
    }

    if (reason) {
      removedRows.push(row);
      if (reason === 'title') {
        stats.titleRows += 1;
      } else if (reason === 'header') {
        stats.headerRows += 1;
      } else {
        stats.leadingRows += 1;
      }
    } else {
      cleanedData.push(row);
    }
  });

  return {
    cleanedData,
    removedRows,
    stats,
  };
};

export const removeSummaryRowsTool = ({ data, keywords = DEFAULT_SUMMARY_KEYWORDS } = {}) => {
  const lowerKeywords = normaliseKeywords(keywords).filter(Boolean);
  if (!lowerKeywords.length) {
    return { cleanedData: Array.isArray(data) ? [...data] : [], removedRows: [] };
  }
  const cleaned = [];
  const removed = [];
  safeRows(data).forEach(row => {
    const values = Object.values(row || {}).map(value => denormaliseString(value).toLowerCase());
    const isSummary = values.some(value => {
      const lower = value.toLowerCase();
      return lowerKeywords.some(keyword => lower.includes(keyword));
    });
    if (isSummary) {
      removed.push(row);
    } else {
      cleaned.push(row);
    }
  });
  return { cleanedData: cleaned, removedRows: removed };
};

export const detectIdentifierColumnsTool = ({ data, metadata } = {}) => {
  const rows = safeRows(data);
  const headers =
    Array.isArray(metadata?.inferredHeaders) && metadata.inferredHeaders.length
      ? metadata.inferredHeaders
      : rows.length && rows[0]
      ? Object.keys(rows[0])
      : [];

  const candidateScores = headers.map(header => {
    const seen = new Set();
    let nonEmpty = 0;
    rows.forEach(row => {
      const value = denormaliseString(row?.[header]);
      if (!value) {
        return;
      }
      nonEmpty += 1;
      seen.add(value);
    });
    return {
      header,
      uniqueness: nonEmpty ? seen.size / nonEmpty : 0,
    };
  });

  const identifiers = candidateScores
    .filter(score => score.uniqueness >= 0.8)
    .map(score => score.header);

  return {
    identifiers,
    confidence: identifiers.length ? 0.7 : 0.2,
    evaluatedColumns: candidateScores,
  };
};

export const normalizeCurrencyValue = (value, options = {}) => {
  if (value === null || value === undefined) {
    return null;
  }
  const { allowNegative = true } = options;
  const cleaned = String(value)
    .replace(/[$€£¥]/g, '')
    .replace(/\s+/g, '')
    .replace(/,/g, '')
    .trim();
  if (!cleaned) {
    return null;
  }
  const numeric = Number.parseFloat(cleaned);
  if (Number.isNaN(numeric)) {
    return null;
  }
  if (!allowNegative && numeric < 0) {
    return null;
  }
  return numeric;
};

export const isLikelyIdentifierValue = value => {
  if (value === null || value === undefined) return false;
  const stringValue = String(value).trim();
  if (!stringValue) return false;
  if (stringValue.length > 80) return false;
  if (/subtotal|total|summary/i.test(stringValue)) return false;
  return true;
};

export const describeColumns = metadata => {
  if (!metadata) {
    return [];
  }
  const headers = Array.isArray(metadata.inferredHeaders) ? metadata.inferredHeaders : [];
  const profiles = Array.isArray(metadata.columnProfiles) ? metadata.columnProfiles : [];
  if (profiles.length) {
    return profiles;
  }
  return headers.map(name => ({
    name,
    type: 'unknown',
  }));
};

export const runHelperPipeline = (actions = [], context = {}) => {
  const log = [];
  let workingData = Array.isArray(context.data) ? [...context.data] : null;
  actions.forEach(action => {
    if (!action || typeof action !== 'object') {
      return;
    }
    const { tool, args } = action;
    switch (tool) {
      case 'removeSummaryRows': {
        const result = removeSummaryRowsTool({ data: workingData, ...(args || {}) });
        workingData = result.cleanedData;
        log.push({ tool, removed: result.removedRows.length });
        break;
      }
      case 'detectIdentifierColumns': {
        const result = detectIdentifierColumnsTool({ data: workingData, ...(args || {}) });
        log.push({ tool, identifiers: result.identifiers });
        break;
      }
      default:
        log.push({ tool, skipped: true });
        break;
    }
  });
  return { data: workingData, log };
};
