const PapaLib = typeof window !== 'undefined' ? window.Papa : null;

if (!PapaLib) {
  console.warn('PapaParse is not available globally; CSV parsing will fail. Ensure the CDN script is included in index.html.');
}

const MAX_HEADER_SCAN_ROWS = 15;
const MIN_TEXT_RATIO_FOR_HEADER = 0.6;

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
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }
  const cleanedString = String(value)
    .replace(/[$€,]/g, '')
    .trim();

  const num = Number(cleanedString);
  return Number.isNaN(num) ? null : num;
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

export const processCsv = file => {
  if (!PapaLib) {
    return Promise.reject(new Error('CSV parser is not available.'));
  }

  return new Promise((resolve, reject) => {
    PapaLib.parse(file, {
      header: false,
      skipEmptyLines: 'greedy',
      worker: true,
      complete: results => {
        const rawRows = results.data.map(row => {
          if (Array.isArray(row)) {
            return row;
          }
          // Handle unexpected objects by converting to array of values
          return Object.values(row);
        });

        const rows = rawRows;
        const { index: headerIndex, headerValues } = detectHeaderRow(rows);
        const expectedColumns = determineExpectedColumnCount(rows);
        const fallbackHeaderSource =
          headerValues && headerValues.length
            ? headerValues
            : rows.find(row => countNonEmptyCells(row) > 0) || [];
        const headers = buildHeaderNames(fallbackHeaderSource, expectedColumns || fallbackHeaderSource.length);

        const dataRows =
          headerIndex === null ? rows : rows.slice(headerIndex + 1);

        const structuredRows = [];
        const originalRows = [];
        let filteredSummaryRows = 0;

        dataRows.forEach(row => {
          const normalisedCells = headers.map((header, idx) => {
            const value = row[idx] !== undefined ? row[idx] : '';
            return normaliseCell(value);
          });

          const hasContent = normalisedCells.some(cell => cell);
          if (!hasContent) {
            return;
          }

          const record = {};
          headers.forEach((header, idx) => {
            record[header] = sanitizeValue(normalisedCells[idx]);
          });

          originalRows.push(record);

          if (rowLooksLikeSummary(normalisedCells)) {
            filteredSummaryRows += 1;
            return;
          }

          structuredRows.push(record);
        });

        if (!structuredRows.length && dataRows.length) {
          console.warn('CSV parsing produced rows but all were filtered out as non-data. Returning raw rows for debugging.');
        }

        const leadingRows = headerIndex === null ? [] : rows.slice(0, headerIndex);
        const leadingRowsNormalised = leadingRows.map(row => row.map(normaliseCell));
        const reportTitleRow = leadingRowsNormalised.find(row => row.some(cell => cell));
        const reportTitle = reportTitleRow
          ? reportTitleRow
              .map(cell => cell)
              .filter(cell => cell)
              .join(' ')
              .trim()
          : null;

        const metadata = {
          headerRow: headers,
          rawHeaderValues: (headerValues || []).map(normaliseCell),
          detectedHeaderIndex: headerIndex,
          totalRowsBeforeFilter: dataRows.length,
          originalRowCount: originalRows.length,
          cleanedRowCount: structuredRows.length,
          removedSummaryRowCount: filteredSummaryRows,
          leadingRows: leadingRowsNormalised.slice(0, 10),
          totalLeadingRows: leadingRowsNormalised.length,
          reportTitle: reportTitle || null,
          sampleDataRows: structuredRows.slice(0, 10),
        };

        resolve({ fileName: file.name, data: structuredRows, originalData: originalRows, metadata });
      },
      error: error => {
        reject(error);
      },
    });
  });
};

export const profileData = data => {
  if (!data || data.length === 0) return [];
  const headers = Object.keys(data[0]);
  const profiles = [];

  for (const header of headers) {
    let isNumerical = true;
    const values = data.map(row => row[header]);
    let numericCount = 0;

    for (const value of values) {
      const parsedNum = parseNumericValue(value);
      if (value !== null && String(value).trim() !== '') {
        if (parsedNum === null) {
          isNumerical = false;
          break;
        }
        numericCount++;
      }
    }

    if (isNumerical && numericCount > 0) {
      const numericValues = values
        .map(parseNumericValue)
        .filter(v => v !== null);
      profiles.push({
        name: header,
        type: 'numerical',
        valueRange: [Math.min(...numericValues), Math.max(...numericValues)],
        missingPercentage: (1 - numericValues.length / data.length) * 100,
      });
    } else {
      const uniqueValues = new Set(values.map(String));
      profiles.push({
        name: header,
        type: 'categorical',
        uniqueValues: uniqueValues.size,
        missingPercentage:
          (values.filter(v => v === null || String(v).trim() === '').length / data.length) * 100,
      });
    }
  }
  return profiles;
};

export const executeJavaScriptDataTransform = (data, jsFunctionBody) => {
  try {
    const transformFunction = new Function('data', jsFunctionBody);
    const result = transformFunction(data);

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

    aggregatedResult.push({
      [groupByColumn]: key,
      value: resultValue,
    });
  }

  aggregatedResult.sort(
    (a, b) => (Number(b.value) || 0) - (Number(a.value) || 0)
  );

  return aggregatedResult;
};
