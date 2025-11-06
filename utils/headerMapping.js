const normaliseKey = key => {
  if (typeof key !== 'string') {
    return '';
  }
  return key.trim();
};

export const createHeaderMapping = (metadata, options = {}) => {
  const genericHeaders = Array.isArray(metadata?.genericHeaders) ? metadata.genericHeaders : [];
  const inferredHeaders = Array.isArray(metadata?.inferredHeaders) ? metadata.inferredHeaders : [];
  const fallbackPrefix =
    typeof options.fallbackPrefix === 'string' && options.fallbackPrefix.trim()
      ? options.fallbackPrefix.trim()
      : 'column_';

  const mapping = {};
  let unmappedCount = 0;

  genericHeaders.forEach((header, index) => {
    const genericKey = normaliseKey(header) || `${fallbackPrefix}${index + 1}`;
    const inferredKey = normaliseKey(inferredHeaders[index]);
    if (!inferredKey) {
      unmappedCount += 1;
    }
    mapping[genericKey] = inferredKey || `${fallbackPrefix}${index + 1}`;
  });

  return {
    mapping,
    detected: inferredHeaders.filter(name => normaliseKey(name)).length,
    total: genericHeaders.length,
    hasUnmapped: unmappedCount > 0,
  };
};

export const applyHeaderMapping = (row, mapping) => {
  if (!row || typeof row !== 'object') {
    return {};
  }
  const result = {};
  const entries = Object.entries(row);
  for (const [key, value] of entries) {
    const normalisedKey = normaliseKey(key);
    const targetKey = normalisedKey && mapping && mapping[normalisedKey] ? mapping[normalisedKey] : normalisedKey;
    if (!targetKey) {
      continue;
    }
    result[targetKey] = value;
  }
  return result;
};

