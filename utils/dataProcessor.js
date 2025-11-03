const PapaLib = typeof window !== 'undefined' ? window.Papa : null;

if (!PapaLib) {
  console.warn('PapaParse is not available globally; CSV parsing will fail. Ensure the CDN script is included in index.html.');
}

// Prevent CSV formula injection
const sanitizeValue = value => {
  if (typeof value === 'string' && value.startsWith('=')) {
    return `'${value}`;
  }
  return value;
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
      header: true,
      skipEmptyLines: true,
      worker: true,
      complete: results => {
        const sanitizedData = results.data.map(row => {
          const newRow = {};
          for (const key in row) {
            newRow[key] = sanitizeValue(String(row[key]));
          }
          return newRow;
        });
        resolve({ fileName: file.name, data: sanitizedData });
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
