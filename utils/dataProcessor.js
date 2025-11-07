import { applyHeaderMapping as applyHeaderMappingHelper } from './headerMapping.js';
import {
  detectHeadersTool,
  removeSummaryRowsTool,
  detectIdentifierColumnsTool,
  normalizeCurrencyValue,
  isLikelyIdentifierValue,
  describeColumns as describeColumnsHelper,
} from './dataPrepTools.js';

const PapaLib = typeof window !== 'undefined' ? window.Papa : null;

if (!PapaLib) {
  console.warn('PapaParse is not available globally; CSV parsing will fail. Ensure the CDN script is included in index.html.');
}

const MAX_HEADER_SCAN_ROWS = 15;
const MIN_TEXT_RATIO_FOR_HEADER = 0.6;
const CONTEXT_ROWS_LIMIT = 20;

// Prevent CSV formula injection
const sanitizeValue = value => {
  if (typeof value === 'string' && value.startsWith('=')) {
    return `'${value}`;
  }
  return value;
};

const normaliseCell = value => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  return String(value).trim();
};

const countNonEmptyCells = row =>
  row.reduce((count, cell) => (normaliseCell(cell) ? count + 1 : count), 0);

const looksNumeric = value => {
  if (!value) return false;
  const cleaned = value.replace(/[$%,]/g, '').trim();
  if (!cleaned) return false;
  return !Number.isNaN(Number(cleaned));
};

const looksLikeDate = value => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return false;
  }
  const stringValue = String(value).trim();
  if (!stringValue) return false;
  if (!/[0-9]{1,4}[-/][0-9]{1,2}[-/][0-9]{1,4}/.test(stringValue)) {
    return false;
  }
  const parsed = Date.parse(stringValue);
  return !Number.isNaN(parsed);
};

const isPercentageString = value => {
  if (value === null || value === undefined) return false;
  const stringValue = String(value).trim();
  if (!stringValue) return false;
  return /%$/.test(stringValue);
};

const isCurrencyString = value => {
  if (value === null || value === undefined) return false;
  const stringValue = String(value);
  return /[$€£¥]/.test(stringValue);
};

const hasAlphaNumericMix = value => {
  if (value === null || value === undefined) {
    return false;
  }
  const stringValue = String(value);
  return /[a-z]/i.test(stringValue) && /\d/.test(stringValue);
};

const QUARTER_REGEX = /^q([1-4])(?:\s*\/?\s*('?[\d]{2,4}))?$/i;

const MONTHS = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const DAYS = {
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
  sunday: 7,
  sun: 7,
};

const parseYearToken = token => {
  if (!token) {
    return null;
  }
  const cleaned = token.replace(/[^0-9]/g, '');
  if (!cleaned) {
    return null;
  }
  let year = Number.parseInt(cleaned, 10);
  if (Number.isNaN(year)) {
    return null;
  }
  if (cleaned.length === 2) {
    year += year >= 50 ? 1900 : 2000;
  }
  return year;
};

const extractTokenFromDictionary = (rawValue, dictionary) => {
  if (rawValue === null || rawValue === undefined) {
    return '';
  }
  const trimmed = String(rawValue).trim().toLowerCase();
  if (!trimmed) {
    return '';
  }
  if (Object.prototype.hasOwnProperty.call(dictionary, trimmed)) {
    return trimmed;
  }
  const tokens = trimmed.split(/[^a-z]+/).filter(Boolean);
  for (const token of tokens) {
    if (Object.prototype.hasOwnProperty.call(dictionary, token)) {
      return token;
    }
  }
  return '';
};

const extractMonthToken = rawValue => extractTokenFromDictionary(rawValue, MONTHS);
const extractDayToken = rawValue => extractTokenFromDictionary(rawValue, DAYS);

const extractQuarterDetails = rawValue => {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }
  const source = String(rawValue).toLowerCase();
  const quarterMatch = source.match(/q\s*([1-4])/);
  if (!quarterMatch) {
    return null;
  }
  const quarter = Number.parseInt(quarterMatch[1], 10);
  if (Number.isNaN(quarter)) {
    return null;
  }

  const after = source.slice(quarterMatch.index + quarterMatch[0].length);
  const before = source.slice(0, quarterMatch.index);

  let yearString = null;
  const afterYear = after.match(/'?([\d]{2,4})/);
  if (afterYear && afterYear[1]) {
    yearString = afterYear[1];
  } else {
    const beforeYear = before.match(/([\d]{2,4})'?$/);
    if (beforeYear && beforeYear[1]) {
      yearString = beforeYear[1];
    }
  }

  const year = yearString ? parseYearToken(yearString) || 0 : 0;

  return { quarter, year };
};

const extractMonthDetails = rawValue => {
  const monthToken = extractMonthToken(rawValue);
  if (!monthToken) {
    return null;
  }
  const month = MONTHS[monthToken];
  if (!month) {
    return null;
  }
  const source = String(rawValue);
  let year = null;
  const longYear = source.match(/(\d{4})/);
  if (longYear && longYear[1]) {
    year = parseYearToken(longYear[1]);
  }
  if (year === null) {
    const shortYear = source.match(/(\d{2})(?![\d])/);
    if (shortYear && shortYear[1]) {
      year = parseYearToken(shortYear[1]);
    }
  }
  return { month, year };
};

const getChronologicalSortValue = (value, sorter) => {
  const rawValue = String(value ?? '').trim();
  const lowerValue = rawValue.toLowerCase();

  if (!rawValue) {
    return Number.POSITIVE_INFINITY;
  }

  switch (sorter) {
    case 'quarter': {
      const details = extractQuarterDetails(rawValue);
      if (!details) {
        return Number.POSITIVE_INFINITY;
      }
      const { quarter, year } = details;
      return year * 10 + quarter;
    }
    case 'month': {
      const details = extractMonthDetails(rawValue);
      if (!details) {
        return Number.POSITIVE_INFINITY;
      }
      const { month, year } = details;
      const resolvedYear = year ?? 0;
      return resolvedYear * 100 + month;
    }
    case 'day': {
      const dayToken = extractDayToken(rawValue);
      if (!dayToken) {
        return Number.POSITIVE_INFINITY;
      }
      const day = DAYS[dayToken];
      return day ? day : Number.POSITIVE_INFINITY;
    }
    default:
      return Number.POSITIVE_INFINITY;
  }
};

const tryChronologicalSort = (data, key) => {
  if (!Array.isArray(data) || data.length < 2) {
    return null;
  }

  const sample = data
    .flatMap(row => {
      const value = row?.[key];
      return value === null || value === undefined ? [] : [String(value)];
    })
    .slice(0, 10)
    .map(value => value.trim())
    .filter(value => value.length > 0);

  if (!sample.length) {
    return null;
  }

  const normalised = sample.map(value => value.toLowerCase());
  const denominator = normalised.length;
  if (denominator === 0) {
    return null;
  }

  const quarterMatches = sample.filter(value => extractQuarterDetails(value)).length;
  const monthMatches = sample.filter(value => extractMonthToken(value)).length;
  const dayMatches = sample.filter(value => extractDayToken(value)).length;
  const dateMatches = normalised.filter(value => looksLikeDate(value)).length;

  let sorter = null;

  if (quarterMatches / denominator >= 0.5) {
    sorter = 'quarter';
  } else if (monthMatches / denominator >= 0.5) {
    sorter = 'month';
  } else if (dayMatches / denominator >= 0.5) {
    sorter = 'day';
  } else if (dateMatches / denominator >= 0.5) {
    return [...data].sort(
      (a, b) =>
        new Date(String(a?.[key])).getTime() -
        new Date(String(b?.[key])).getTime()
    );
  }

  if (!sorter) {
    return null;
  }

  return [...data].sort((a, b) => {
    const valueA = getChronologicalSortValue(a?.[key], sorter);
    const valueB = getChronologicalSortValue(b?.[key], sorter);
    return valueA - valueB;
  });
};

const determineExpectedColumnCount = rows => {
  const counter = new Map();
  rows.forEach(row => {
    const count = countNonEmptyCells(row);
    if (count === 0) return;
    counter.set(count, (counter.get(count) || 0) + 1);
  });
  const entries = Array.from(counter.entries());
  if (!entries.length) return 0;
  entries.sort((a, b) => {
    if (b[1] === a[1]) {
      return b[0] - a[0];
    }
    return b[1] - a[1];
  });
  return entries[0][0];
};

const detectHeaderRow = rows => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { index: null, headerValues: [] };
  }

  const expectedColumns = determineExpectedColumnCount(rows);

  const limit = Math.min(rows.length, MAX_HEADER_SCAN_ROWS);
  for (let index = 0; index < limit; index++) {
    const row = rows[index];
    const nonEmpty = countNonEmptyCells(row);
    if (nonEmpty === 0) continue;
    if (expectedColumns && nonEmpty !== expectedColumns) {
      // Allow slightly wider rows (e.g., table title spanning columns), otherwise skip
      if (nonEmpty < expectedColumns) {
        continue;
      }
    }

    const normalisedRow = row.map(normaliseCell);
    const textCells = normalisedRow.filter(cell => cell && !looksNumeric(cell));
    const textRatio = nonEmpty === 0 ? 0 : textCells.length / nonEmpty;
    const uniqueTokens = new Set(textCells.map(token => token.toLowerCase()));

    if (textCells.length === 0) continue;
    if (textRatio < MIN_TEXT_RATIO_FOR_HEADER) continue;
    if (uniqueTokens.size < Math.max(1, Math.min(textCells.length, nonEmpty - 1))) continue;
    if (normalisedRow.some(cell => /total/i.test(cell)) && textCells.length <= 1) {
      // Guard against "Total" rows being mistaken as headers
      continue;
    }

    return { index, headerValues: normalisedRow };
  }

  const fallbackIndex = rows.findIndex(row => countNonEmptyCells(row) > 0);
  if (fallbackIndex === -1) {
    return { index: null, headerValues: [] };
  }
  return { index: fallbackIndex, headerValues: rows[fallbackIndex].map(normaliseCell) };
};

const buildHeaderNames = (rawHeaderValues, expectedLength) => {
  const headers = [];
  const used = new Set();
  const length = expectedLength || rawHeaderValues.length || 0;

  for (let i = 0; i < length; i++) {
    const rawValue = normaliseCell(rawHeaderValues[i]);
    let baseName = rawValue || `Column ${i + 1}`;

    // Normalise spacing and punctuation while keeping it human-readable
    baseName = baseName.replace(/\s+/g, ' ').trim();
    if (!baseName) {
      baseName = `Column ${i + 1}`;
    }

    let candidate = baseName;
    let suffix = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = `${baseName} (${suffix})`;
      suffix += 1;
    }
    used.add(candidate.toLowerCase());
    headers.push(candidate);
  }

  return headers;
};

const rowLooksLikeSummary = values => {
  const trimmedValues = values.map(normaliseCell);
  if (trimmedValues.every(value => !value)) {
    return true;
  }

  const firstCell = trimmedValues[0] || '';
  const firstCellLower = firstCell.toLowerCase();
  if (!firstCellLower) {
    return false;
  }

  if (/^(report|title|summary|project title|table)\b/.test(firstCellLower) && trimmedValues.slice(1).every(value => !value)) {
    return true;
  }

  if (/^(generated on|created on|as of)\b/.test(firstCellLower) && trimmedValues.slice(1).every(value => !value)) {
    return true;
  }

  if (/\b(total|subtotal|grand total|overall total)\b/.test(firstCellLower)) {
    const remaining = trimmedValues.slice(1);
    const restAreNumericOrEmpty = remaining.every(value => !value || looksNumeric(value));
    if (restAreNumericOrEmpty) {
      return true;
    }
  }

  if (/^page\s+\d+/i.test(firstCell)) {
    return true;
  }

  return false;
};

export const parseNumericValue = value => {
  if (value === null || value === undefined) {
    return null;
  }
  let stringValue = String(value).trim();
  if (!stringValue) {
    return null;
  }

  let isNegative = false;
  if (stringValue.startsWith('(') && stringValue.endsWith(')')) {
    stringValue = stringValue.slice(1, -1);
    isNegative = true;
  }

  stringValue = stringValue.replace(/[$\s€£¥%]/g, '');

  const lastComma = stringValue.lastIndexOf(',');
  const lastDot = stringValue.lastIndexOf('.');
  if (lastComma > lastDot) {
    stringValue = stringValue.replace(/\./g, '').replace(',', '.');
  } else {
    stringValue = stringValue.replace(/,/g, '');
  }

  const parsed = Number.parseFloat(stringValue);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return isNegative ? -parsed : parsed;
};

export const applyTopNWithOthers = (data, groupByKey, valueKey, topN) => {
  if (data.length <= topN) {
    return data;
  }

  const sortedData = [...data].sort((a, b) => (Number(b[valueKey]) || 0) - (Number(a[valueKey]) || 0));

  const topData = sortedData.slice(0, topN - 1);
  const otherData = sortedData.slice(topN - 1);

  if (otherData.length > 0) {
    const otherSum = otherData.reduce((acc, row) => acc + (Number(row[valueKey]) || 0), 0);
    const othersRow = {
      [groupByKey]: 'Others',
      [valueKey]: otherSum,
    };
    return [...topData, othersRow];
  }

  return topData;
};

const inferNumericColumns = (rows, sampleSize = 200) => {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const firstRow = rows[0];
  if (!firstRow || typeof firstRow !== 'object') return [];
  const columnNames = Object.keys(firstRow);
  const columnScores = columnNames.map(name => {
    let numericCount = 0;
    let evaluated = 0;
    for (let index = 0; index < rows.length; index++) {
      const value = parseNumericValue(rows[index]?.[name]);
      if (value !== null) {
        numericCount++;
      }
      evaluated++;
      if (evaluated >= sampleSize) {
        break;
      }
    }
    return { name, numericCount };
  });

  return columnScores
    .filter(score => score.numericCount > 0)
    .sort((a, b) => b.numericCount - a.numericCount)
    .map(score => score.name);
};

const isDataCloneError = error => {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /DataCloneError/i.test(message);
};

const parseCsvWithWorkerOption = (file, useWorker) =>
  new Promise((resolve, reject) => {
    PapaLib.parse(file, {
      header: false,
      skipEmptyLines: 'greedy',
      worker: useWorker,
      dynamicTyping: false,
      complete: results => {
        try {
          const rawRows = Array.isArray(results?.data)
            ? results.data.map(row => (Array.isArray(row) ? row : Object.values(row || [])))
            : [];

          if (!rawRows.length) {
            resolve({
              fileName: file.name,
              data: [],
              originalData: [],
              metadata: {
                headerRow: [],
                rawHeaderValues: [],
                detectedHeaderIndex: null,
                totalRowsBeforeFilter: 0,
                originalRowCount: 0,
                cleanedRowCount: 0,
                removedSummaryRowCount: 0,
                leadingRows: [],
                totalLeadingRows: 0,
                reportTitle: null,
                sampleDataRows: [],
                contextRows: [],
                contextRowCount: 0,
                genericHeaders: [],
                inferredHeaders: [],
                genericRowCount: 0,
              },
            });
            return;
          }

          const maxColumns = rawRows.reduce((max, row) => Math.max(max, row.length || 0), 0);
          const genericHeaders = Array.from({ length: maxColumns }, (_, i) => `column_${i + 1}`);
          const genericRows = rawRows.map(rowArray => {
            const record = {};
            genericHeaders.forEach((header, idx) => {
              const value = rowArray[idx] !== undefined ? rowArray[idx] : '';
              record[header] = sanitizeValue(String(value));
            });
            return record;
          });

          const { index: headerIndex, headerValues } = detectHeaderRow(rawRows);
          const expectedColumns = determineExpectedColumnCount(rawRows);
          const fallbackHeaderSource =
            headerValues && headerValues.length
              ? headerValues
              : rawRows.find(row => countNonEmptyCells(row) > 0) || [];
          const inferredHeaders = buildHeaderNames(
            fallbackHeaderSource,
            expectedColumns || fallbackHeaderSource.length
          );

          const dataRows = headerIndex === null ? rawRows : rawRows.slice(headerIndex + 1);
          const structuredRows = [];
          const originalRows = [];
          let summaryRowCount = 0;

          dataRows.forEach(row => {
            const normalisedCells = inferredHeaders.map((header, idx) => {
              const cellValue = row[idx] !== undefined ? row[idx] : '';
              return normaliseCell(cellValue);
            });

            if (!normalisedCells.some(Boolean)) {
              return;
            }

            const record = {};
            inferredHeaders.forEach((header, idx) => {
              record[header] = sanitizeValue(normalisedCells[idx]);
            });

            originalRows.push(record);

            if (rowLooksLikeSummary(normalisedCells)) {
              summaryRowCount += 1;
            }

            structuredRows.push(record);
          });

          const leadingRows = headerIndex === null ? [] : rawRows.slice(0, headerIndex);
          const leadingRowsNormalised = leadingRows.map(row => row.map(normaliseCell));
          const dataContextRows = structuredRows
            .slice(0, CONTEXT_ROWS_LIMIT)
            .map(row => inferredHeaders.map(header => normaliseCell(row[header])));
          const contextRows = [...leadingRowsNormalised, ...dataContextRows].slice(
            0,
            CONTEXT_ROWS_LIMIT
          );
          const reportTitleRow = leadingRowsNormalised.find(row => row.some(cell => cell));
          const reportTitle = reportTitleRow
            ? reportTitleRow
                .map(cell => cell)
                .filter(cell => cell)
                .join(' ')
                .trim()
            : null;

          const metadata = {
            headerRow: inferredHeaders,
            rawHeaderValues: (headerValues || []).map(normaliseCell),
            detectedHeaderIndex: headerIndex,
            totalRowsBeforeFilter: dataRows.length,
            originalRowCount: originalRows.length,
            cleanedRowCount: structuredRows.length,
            removedSummaryRowCount: summaryRowCount,
            leadingRows: leadingRowsNormalised.slice(0, 10),
            totalLeadingRows: leadingRowsNormalised.length,
            reportTitle: reportTitle || null,
            sampleDataRows: structuredRows.slice(0, 10),
            contextRows,
            contextRowCount: contextRows.length,
            genericHeaders,
            inferredHeaders,
            genericRowCount: genericRows.length,
          };

          resolve({
            fileName: file.name,
            data: genericRows,
            originalData: originalRows,
            metadata,
          });
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      },
      error: error => {
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    });
  });

export const processCsv = file => {
  if (!PapaLib) {
    return Promise.reject(new Error('CSV parser is not available.'));
  }

  return parseCsvWithWorkerOption(file, true).catch(error => {
    if (isDataCloneError(error)) {
      console.warn(
        'CSV worker parsing failed due to DataCloneError; retrying without Web Worker for this file.',
        error
      );
      return parseCsvWithWorkerOption(file, false);
    }
    throw error;
  });
};

export const profileData = data => {
  if (!data || data.length === 0) return [];
  const headers = Object.keys(data[0]);
  const profiles = [];

  for (const header of headers) {
    const values = data.map(row => row[header]);
    let numericCount = 0;
    let nonEmptyCount = 0;
    let containsNonNumeric = false;
    let currencyHints = 0;
    let percentageHints = 0;
    let dateHints = 0;
    let identifierHints = 0;
    const numericValues = [];
    const canonicalValues = [];

    values.forEach(value => {
      const normalised = value === null || value === undefined ? '' : String(value).trim();
      canonicalValues.push(normalised);
      if (!normalised) {
        return;
      }
      nonEmptyCount += 1;
      if (isCurrencyString(normalised)) {
        currencyHints += 1;
      }
      if (isPercentageString(normalised)) {
        percentageHints += 1;
      }
      if (looksLikeDate(normalised)) {
        dateHints += 1;
      }
      if (isLikelyIdentifierValue(normalised) && hasAlphaNumericMix(normalised)) {
        identifierHints += 1;
      }
      const parsedNum = parseNumericValue(value);
      if (parsedNum === null) {
        containsNonNumeric = true;
      } else {
        numericCount += 1;
        numericValues.push(parsedNum);
      }
    });

    const hasNumericCoverage = numericCount > 0 && !containsNonNumeric;
    const missingPercentage = data.length === 0 ? 0 : ((data.length - nonEmptyCount) / data.length) * 100;
    const uniqueValues = new Set(
      canonicalValues
        .filter(Boolean)
        .map(raw => raw.toLowerCase())
    );
    const uniquenessRatio = nonEmptyCount === 0 ? 0 : uniqueValues.size / nonEmptyCount;
    const identifierRatio = nonEmptyCount === 0 ? 0 : identifierHints / nonEmptyCount;
    const currencyRatio = nonEmptyCount === 0 ? 0 : currencyHints / nonEmptyCount;
    const percentageRatio = nonEmptyCount === 0 ? 0 : percentageHints / nonEmptyCount;
    const dateRatio = nonEmptyCount === 0 ? 0 : dateHints / nonEmptyCount;

    const isLikelyIdentifierColumn = identifierRatio >= 0.5 && uniquenessRatio >= 0.5;
    const isTrickyMixed = !hasNumericCoverage && identifierRatio >= 0.3 && identifierRatio < 0.5;

    let semanticType = 'text';
    if (dateRatio >= 0.6) {
      semanticType = 'date';
    } else if (currencyRatio >= 0.6) {
      semanticType = 'currency';
    } else if (percentageRatio >= 0.6) {
      semanticType = 'percentage';
    } else if (isLikelyIdentifierColumn) {
      semanticType = 'identifier';
    } else if (hasNumericCoverage) {
      semanticType = 'numeric';
    }

    let columnType = hasNumericCoverage && !isLikelyIdentifierColumn ? 'numerical' : 'categorical';

    const roles = new Set();
    if (columnType === 'numerical') {
      roles.add('measure');
    } else {
      roles.add('dimension');
    }
    if (semanticType === 'identifier') {
      roles.add('identifier');
    }
    if (semanticType === 'date') {
      roles.add('time');
    }
    if (semanticType === 'currency') {
      roles.add('currency');
    }
    if (semanticType === 'percentage') {
      roles.add('percentage');
    }

    const profile = {
      name: header,
      type: columnType,
      missingPercentage,
      uniquenessRatio,
      semanticType,
      roles: Array.from(roles),
      sampleValues: canonicalValues.filter(Boolean).slice(0, 5),
      isLikelyIdentifier: isLikelyIdentifierColumn,
      isTrickyMixed,
    };

    if (columnType === 'numerical') {
      const min = numericValues.length ? Math.min(...numericValues) : null;
      const max = numericValues.length ? Math.max(...numericValues) : null;
      profile.valueRange = [min, max];
    } else {
      profile.uniqueValues = uniqueValues.size;
    }

    profiles.push(profile);
  }
  return profiles;
};

const splitNumericString = input => {
  if (input === null || input === undefined) return [];
  const parsableString = String(input).replace(/,(?=-?\d)/g, '|');
  return parsableString.split('|');
};

export const executeJavaScriptDataTransform = (data, jsFunctionBody) => {
  try {
    const utils = {
      parseNumber: value => parseNumericValue(value),
      splitNumericString,
      applyHeaderMapping: (row, mapping) => applyHeaderMappingHelper(row, mapping),
      detectHeaders: metadata => detectHeadersTool({ metadata }),
      removeSummaryRows: (rows, keywords) => removeSummaryRowsTool({ data: rows, keywords }).cleanedData,
      detectIdentifierColumns: (rows, metadata) =>
        detectIdentifierColumnsTool({ data: rows, metadata }).identifiers,
      isValidIdentifierValue: value => isLikelyIdentifierValue(value),
      normalizeNumber: (value, options) => normalizeCurrencyValue(value, options),
      describeColumns: metadata => describeColumnsHelper(metadata),
    };
    const transformFunction = new Function('data', '_util', jsFunctionBody);
    const result = transformFunction(data, utils);

    if (!Array.isArray(result)) {
      console.error('The AI-generated transform function did not return an array. It may be missing a return statement.', {
        returnedValue: result,
        generatedCode: jsFunctionBody,
      });
      throw new Error('The AI-generated transform function did not return an array.');
    }

    if (result.length > 0 && typeof result[0] !== 'object') {
      throw new Error('The AI-generated transform function did not return an array of objects.');
    }

    return result;
  } catch (error) {
    console.error('Executing AI-generated JavaScript failed:', error);
    throw new Error(
      `AI-generated data transformation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

export const executePlan = (csvData, plan) => {
  // Advanced analysis: Correlation Matrix
  // Produces a flat list of top correlated pairs suitable for bar charts:
  // [{ pair: "colA ~ colB", value: correlation }, ...]
  // We set plan.groupByColumn/valueColumn for downstream components to render.
  if (plan.analysisType === 'correlation') {
    const dataRows = Array.isArray(csvData?.data) ? csvData.data : [];
    if (!dataRows.length) return [];

    // Resolve numeric columns: prefer explicit valueColumns if provided; otherwise infer.
    let numericColumns = [];
    if (Array.isArray(plan.valueColumns) && plan.valueColumns.length) {
      const knownColumns = Object.keys(dataRows[0] || {});
      numericColumns = plan.valueColumns.filter(col => knownColumns.includes(col));
    } else {
      numericColumns = inferNumericColumns(dataRows);
    }

    // Guardrail: limit number of columns to avoid O(N^2) explosion.
    const MAX_COLUMNS_FOR_CORR = typeof plan.maxColumns === 'number' ? plan.maxColumns : 12;
    if (numericColumns.length > MAX_COLUMNS_FOR_CORR) {
      numericColumns = numericColumns.slice(0, MAX_COLUMNS_FOR_CORR);
    }

    const results = [];
    for (let i = 0; i < numericColumns.length; i++) {
      for (let j = i + 1; j < numericColumns.length; j++) {
        const colA = numericColumns[i];
        const colB = numericColumns[j];

        const xs = [];
        const ys = [];
        for (let r = 0; r < dataRows.length; r++) {
          const x = parseNumericValue(dataRows[r]?.[colA]);
          const y = parseNumericValue(dataRows[r]?.[colB]);
          if (x !== null && y !== null) {
            xs.push(x);
            ys.push(y);
          }
        }

        let corr = 0;
        const n = xs.length;
        if (n >= 3) {
          const meanX = xs.reduce((s, v) => s + v, 0) / n;
          const meanY = ys.reduce((s, v) => s + v, 0) / n;
          let num = 0;
          let sx = 0;
          let sy = 0;
          for (let k = 0; k < n; k++) {
            const dx = xs[k] - meanX;
            const dy = ys[k] - meanY;
            num += dx * dy;
            sx += dx * dx;
            sy += dy * dy;
          }
          const denom = Math.sqrt(sx * sy);
          corr = denom === 0 ? 0 : num / denom;
        }

        results.push({
          pair: `${colA} ~ ${colB}`,
          value: corr,
        });
      }
    }

    // Sort by absolute correlation strength and limit top pairs for readability.
    results.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    const TOP_PAIRS_LIMIT = typeof plan.topPairs === 'number' ? plan.topPairs : 50;
    const limited = results.slice(0, TOP_PAIRS_LIMIT);

    // Hint downstream renderer to use 'pair' and 'value' keys like normal aggregations.
    plan.groupByColumn = 'pair';
    plan.valueColumn = 'value';
    // Optional: tag aggregation to avoid audits expecting 'sum'/'count'
    plan.aggregation = plan.aggregation || 'none';

    return limited;
  }

  // Advanced analysis: K-Means clustering
  if (plan.analysisType === 'clustering_kmeans') {
    const dataRows = Array.isArray(csvData?.data) ? csvData.data : [];
    if (!dataRows.length) return [];

    // Resolve feature columns: prefer explicit featureColumns; otherwise infer from data.
    let featureColumns = Array.isArray(plan.featureColumns) && plan.featureColumns.length
      ? plan.featureColumns.filter(col => col && (dataRows[0] && Object.prototype.hasOwnProperty.call(dataRows[0], col)))
      : inferNumericColumns(dataRows);

    // Guardrails: ensure we have features and cap dimension for performance
    const MAX_FEATURES = typeof plan.maxFeatures === 'number' ? plan.maxFeatures : 6;
    featureColumns = (featureColumns || []).slice(0, MAX_FEATURES);
    if (!featureColumns.length) {
      // No numeric feature available; fallback to scatter auto-handling
      plan.analysisType = undefined;
    } else {
      // Resolve axes: prefer plan.xValueColumn / plan.yValueColumn if valid; else pick two distinct numeric columns; else row index
      const allNumericColumns = inferNumericColumns(dataRows);
      const isNum = c => allNumericColumns.includes(c);

      let useRowIndexForX = false;
      let useRowIndexForY = false;

      let xCol = plan.xValueColumn && isNum(plan.xValueColumn) ? plan.xValueColumn : null;
      if (!xCol) {
        xCol = featureColumns.find(c => isNum(c)) || allNumericColumns[0] || null;
      }
      if (!xCol) {
        xCol = 'Row Index';
        useRowIndexForX = true;
      }

      let yCol = plan.yValueColumn && isNum(plan.yValueColumn) ? plan.yValueColumn : null;
      if (!yCol || yCol === xCol) {
        yCol =
          featureColumns.find(c => c !== xCol && isNum(c)) ||
          allNumericColumns.find(c => c !== xCol) ||
          null;
      }
      if (!yCol || yCol === xCol) {
        if (!useRowIndexForX) {
          yCol = 'Row Index';
          useRowIndexForY = true;
        } else {
          // Both axes would be row index; fall back to standard scatter flow
          plan.analysisType = undefined;
        }
      }

      if (plan.analysisType === 'clustering_kmeans') {
        // Build feature matrix (filter out rows with any missing feature)
        const matrix = [];
        const rowRefs = [];
        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i];
          const vector = [];
          let valid = true;
          for (const col of featureColumns) {
            const val = parseNumericValue(row[col]);
            if (val === null) {
              valid = false;
              break;
            }
            vector.push(val);
          }
          if (valid && vector.length) {
            matrix.push(vector);
            rowRefs.push(i);
          }
        }
        if (!matrix.length) {
          // Nothing to cluster; fall back to standard scatter
          plan.analysisType = undefined;
        } else {
          // Standardize features (default true)
          const standardize = plan.standardize !== false;
          if (standardize) {
            const dim = featureColumns.length;
            const means = new Array(dim).fill(0);
            const stds = new Array(dim).fill(0);
            for (let j = 0; j < dim; j++) {
              let sum = 0;
              for (let i = 0; i < matrix.length; i++) sum += matrix[i][j];
              means[j] = sum / matrix.length;
            }
            for (let j = 0; j < dim; j++) {
              let s = 0;
              for (let i = 0; i < matrix.length; i++) {
                const d = matrix[i][j] - means[j];
                s += d * d;
              }
              stds[j] = Math.sqrt(s / Math.max(matrix.length - 1, 1)) || 1;
            }
            for (let i = 0; i < matrix.length; i++) {
              for (let j = 0; j < dim; j++) {
                matrix[i][j] = (matrix[i][j] - means[j]) / (stds[j] || 1);
              }
            }
          }

          // K-Means parameters
          const k = Math.max(2, Math.min(12, Number(plan.k) || 3));
          const maxIter = typeof plan.maxIterations === 'number' ? plan.maxIterations : 100;

          // Initialize centroids (deterministic spread across dataset)
          const centroids = [];
          const usedIdx = new Set();
          for (let c = 0; c < k; c++) {
            let idx = Math.floor((c + 0.5) * matrix.length / k);
            if (idx >= matrix.length) idx = matrix.length - 1;
            if (usedIdx.has(idx)) idx = Math.floor(Math.random() * matrix.length);
            usedIdx.add(idx);
            centroids.push([...matrix[idx]]);
          }

          // Iterate assign/update
          const dim = featureColumns.length;
          let assignments = new Array(matrix.length).fill(-1);
          for (let iter = 0; iter < maxIter; iter++) {
            let changed = 0;
            // Assign step
            for (let i = 0; i < matrix.length; i++) {
              let best = 0;
              let bestDist = Infinity;
              for (let c = 0; c < k; c++) {
                let d = 0;
                const a = matrix[i];
                const b = centroids[c];
                for (let j = 0; j < dim; j++) {
                  const diff = a[j] - b[j];
                  d += diff * diff;
                }
                if (d < bestDist) {
                  bestDist = d;
                  best = c;
                }
              }
              if (assignments[i] !== best) {
                assignments[i] = best;
                changed++;
              }
            }
            // Update step
            const sums = Array.from({ length: k }, () => new Array(dim).fill(0));
            const counts = new Array(k).fill(0);
            for (let i = 0; i < matrix.length; i++) {
              const c = assignments[i];
              counts[c]++;
              for (let j = 0; j < dim; j++) {
                sums[c][j] += matrix[i][j];
              }
            }
            for (let c = 0; c < k; c++) {
              if (counts[c] === 0) continue; // keep previous centroid if empty
              for (let j = 0; j < dim; j++) {
                centroids[c][j] = sums[c][j] / counts[c];
              }
            }
            if (changed === 0) break;
          }

          // Build scatter output enriched with cluster label
          const output = [];
          for (let idx = 0; idx < rowRefs.length; idx++) {
            const rowIndex = rowRefs[idx];
            const row = dataRows[rowIndex];
            const x = useRowIndexForX ? rowIndex + 1 : parseNumericValue(row[xCol]);
            const y = useRowIndexForY ? rowIndex + 1 : parseNumericValue(row[yCol]);
            if (x === null || y === null) continue;
            output.push({
              [xCol]: x,
              [yCol]: y,
              cluster: `Cluster ${assignments[idx] + 1}`,
            });
          }

          plan.xValueColumn = xCol;
          plan.yValueColumn = yCol;

          return output;
        }
      }
    }
  }

  // Advanced analysis: Time Series Decomposition (trend via moving average)
  if (plan.analysisType === 'time_series_decompose') {
    const dataRows = Array.isArray(csvData?.data) ? csvData.data : [];
    if (!dataRows.length) return [];

    const timeCol = plan.groupByColumn;
    const valCol = plan.valueColumn;
    if (!timeCol || !valCol) return [];

    // Aggregate by time key (sum)
    const seriesMap = new Map();
    for (const row of dataRows) {
      const key = String(row?.[timeCol]);
      const v = parseNumericValue(row?.[valCol]);
      if (key && v !== null) {
        seriesMap.set(key, (seriesMap.get(key) || 0) + v);
      }
    }

    // Sort by time (try Date, fallback string)
    const entries = Array.from(seriesMap.entries());
    const parsed = entries.map(([k, v]) => {
      const t = Date.parse(k);
      return { k, v, t: Number.isNaN(t) ? null : t };
    });
    const dateCount = parsed.filter(p => p.t !== null).length;
    if (dateCount >= Math.floor(parsed.length * 0.6)) {
      parsed.sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity));
    } else {
      parsed.sort((a, b) => String(a.k).localeCompare(String(b.k)));
    }

    // Moving average window
    const w = Math.max(2, Number(plan.window) || 7);
    const values = parsed.map(p => Number(p.v) || 0);
    const trend = [];
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= w) {
        sum -= values[i - w];
      }
      const count = i + 1 < w ? i + 1 : w;
      trend.push(sum / count);
    }

    // Output trend as line series
    const output = parsed.map((p, i) => ({
      [timeCol]: p.k,
      value: trend[i],
    }));

    plan.aggregation = plan.aggregation || 'none';
    plan.groupByColumn = timeCol;
    plan.valueColumn = 'value';
    return output;
  }

  // Advanced analysis: Linear Prediction (simple OLS on index)
  if (plan.analysisType === 'prediction_linear') {
    const dataRows = Array.isArray(csvData?.data) ? csvData.data : [];
    if (!dataRows.length) return [];

    const timeCol = plan.groupByColumn;
    const valCol = plan.valueColumn;
    if (!timeCol || !valCol) return [];

    // Aggregate by time key (sum)
    const seriesMap = new Map();
    for (const row of dataRows) {
      const key = String(row?.[timeCol]);
      const v = parseNumericValue(row?.[valCol]);
      if (key && v !== null) {
        seriesMap.set(key, (seriesMap.get(key) || 0) + v);
      }
    }

    // Sort by time (try Date, fallback string)
    const entries = Array.from(seriesMap.entries());
    const parsed = entries.map(([k, v]) => {
      const t = Date.parse(k);
      return { k, v, t: Number.isNaN(t) ? null : t };
    });
    const dateCount = parsed.filter(p => p.t !== null).length;
    if (dateCount >= Math.floor(parsed.length * 0.6)) {
      parsed.sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity));
    } else {
      parsed.sort((a, b) => String(a.k).localeCompare(String(b.k)));
    }

    // Build regression on index x = 1..n
    const ys = parsed.map(p => Number(p.v) || 0);
    const n = ys.length;
    if (n < 2) {
      // Not enough points to fit; just return observed
      const observed = parsed.map(p => ({ [timeCol]: p.k, value: Number(p.v) || 0 }));
      plan.aggregation = plan.aggregation || 'none';
      plan.groupByColumn = timeCol;
      plan.valueColumn = 'value';
      return observed;
    }
    let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
    for (let i = 0; i < n; i++) {
      const x = i + 1;
      const y = ys[i];
      sumX += x;
      sumY += y;
      sumXX += x * x;
      sumXY += x * y;
    }
    const denom = (n * sumXX - sumX * sumX) || 1;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    // Determine time step if dates are available
    let stepMs = null;
    if (dateCount >= 2) {
      const dts = parsed.filter(p => p.t !== null).map(p => p.t);
      const diffs = [];
      for (let i = 1; i < dts.length; i++) {
        const diff = dts[i] - dts[i - 1];
        if (diff > 0) diffs.push(diff);
      }
      if (diffs.length) {
        diffs.sort((a, b) => a - b);
        const mid = Math.floor(diffs.length / 2);
        stepMs = diffs.length % 2 ? diffs[mid] : Math.floor((diffs[mid - 1] + diffs[mid]) / 2);
        if (stepMs <= 0) stepMs = null;
      }
    }

    // Prepare forecast horizon
    const horizon = Math.max(1, Math.min(365, Number(plan.horizon) || 10));

    // Observed points (as-is)
    const observed = parsed.map((p, i) => ({
      [timeCol]: p.k,
      value: Number(ys[i]) || 0,
    }));

    // Compute future time labels
    const lastTime = parsed[parsed.length - 1]?.t ?? null;

    const formatDate = (ms) => {
      try {
        const d = new Date(ms);
        // ISO date (yyyy-mm-dd)
        return d.toISOString().slice(0, 10);
      } catch {
        return String(ms);
      }
    };

    const future = [];
    for (let h = 1; h <= horizon; h++) {
      const x = n + h;
      const yhat = intercept + slope * x;
      let label;
      if (stepMs && lastTime !== null) {
        label = formatDate(lastTime + stepMs * h);
      } else {
        label = `Forecast ${h}`;
      }
      future.push({
        [timeCol]: label,
        value: yhat,
        isForecast: true,
      });
    }

    plan.aggregation = plan.aggregation || 'none';
    plan.groupByColumn = timeCol;
    plan.valueColumn = 'value';
    return [...observed, ...future];
  }
  // Existing scatter handling
  if (plan.chartType === 'scatter') {
    const dataRows = Array.isArray(csvData?.data) ? csvData.data : [];
    const numericColumns = inferNumericColumns(dataRows);

    let useRowIndexForX = false;
    let useRowIndexForY = false;

    let resolvedX =
      plan.xValueColumn && numericColumns.includes(plan.xValueColumn)
        ? plan.xValueColumn
        : null;

    if (!resolvedX) {
      resolvedX =
        numericColumns.find(col => col !== plan.yValueColumn) || numericColumns[0] || null;
    }

    if (!resolvedX) {
      resolvedX = 'Row Index';
      useRowIndexForX = true;
    }

    let resolvedY =
      plan.yValueColumn && numericColumns.includes(plan.yValueColumn)
        ? plan.yValueColumn
        : null;

    if (!resolvedY || resolvedY === resolvedX) {
      resolvedY =
        numericColumns.find(col => col !== resolvedX) ||
        (resolvedY && numericColumns.includes(resolvedY) ? resolvedY : null);
    }

    if (!resolvedY || resolvedY === resolvedX) {
      if (!useRowIndexForX) {
        resolvedY = 'Row Index';
        useRowIndexForY = true;
      } else {
        throw new Error('Scatter plot plan is missing numerical columns for both axes.');
      }
    }

    plan.xValueColumn = resolvedX;
    plan.yValueColumn = resolvedY;

    return dataRows
      .map((row, index) => {
        const xValue = useRowIndexForX
          ? index + 1
          : parseNumericValue(row?.[resolvedX]);
        const yValue = useRowIndexForY
          ? index + 1
          : parseNumericValue(row?.[resolvedY]);
        return {
          [resolvedX]: xValue,
          [resolvedY]: yValue,
        };
      })
      .filter(point => point[resolvedX] !== null && point[resolvedY] !== null);
  }

  const { groupByColumn, valueColumn, aggregation } = plan;
  if (!groupByColumn || !aggregation) {
    throw new Error('Non-scatter plans must provide groupByColumn and aggregation.');
  }

  const groups = {};

  csvData.data.forEach(row => {
    const groupKey = String(row[groupByColumn]);
    if (groupKey === 'undefined' || groupKey === 'null') return;

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }

    if (valueColumn) {
      const value = parseNumericValue(row[valueColumn]);
      if (value !== null) {
        groups[groupKey].push(value);
      }
    } else if (aggregation === 'count') {
      groups[groupKey].push(1);
    }
  });

  const aggregatedResult = [];

  for (const key in groups) {
    const values = groups[key];
    let resultValue;

    switch (aggregation) {
      case 'sum':
        resultValue = values.reduce((acc, val) => acc + val, 0);
        break;
      case 'count':
        resultValue = values.length;
        break;
      case 'avg':
        resultValue = values.reduce((acc, val) => acc + val, 0) / (values.length || 1);
        break;
      default:
        throw new Error(`Unsupported aggregation type: ${aggregation}`);
    }

    const targetValueKey = valueColumn || (aggregation === 'count' ? 'count' : 'value');
    aggregatedResult.push({
      [groupByColumn]: key,
      [targetValueKey]: resultValue,
    });
  }

  const finalValueKey = valueColumn || (aggregation === 'count' ? 'count' : 'value');
  if (!plan.valueColumn) {
    plan.valueColumn = finalValueKey;
  }

  const chronologicalOrder = tryChronologicalSort(aggregatedResult, groupByColumn);
  if (chronologicalOrder) {
    return chronologicalOrder;
  }

  if (
    plan.chartType === 'line' &&
    aggregatedResult.length > 0 &&
    looksLikeDate(aggregatedResult[0][groupByColumn])
  ) {
    aggregatedResult.sort(
      (a, b) =>
        new Date(String(a[groupByColumn])).getTime() -
        new Date(String(b[groupByColumn])).getTime()
    );
  } else {
    aggregatedResult.sort(
      (a, b) => (Number(b[finalValueKey]) || 0) - (Number(a[finalValueKey]) || 0)
    );
  }

  return aggregatedResult;
};
