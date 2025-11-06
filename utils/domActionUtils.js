export const normaliseBooleanFlag = value => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return null;
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (['true', '1', 'yes', 'y', 'on', 'enable', 'enabled'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off', 'disable', 'disabled'].includes(normalized)) {
      return false;
    }
  }
  return null;
};

export const resolveBooleanFromKeys = (source, keys) => {
  if (!source || typeof source !== 'object') {
    return null;
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      continue;
    }
    const value = normaliseBooleanFlag(source[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
};

export const collectStringList = (source, keys) => {
  const results = [];
  const seen = new Set();
  if (!source || typeof source !== 'object') {
    return results;
  }
  keys.forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      return;
    }
    const value = source[key];
    if (Array.isArray(value)) {
      value.forEach(item => {
        if (typeof item === 'string' && item.trim()) {
          const trimmed = item.trim();
          if (!seen.has(trimmed)) {
            seen.add(trimmed);
            results.push(trimmed);
          }
        }
      });
    } else if (typeof value === 'string' && value.trim()) {
      value
        .split(/[,|]/)
        .map(entry => entry.trim())
        .filter(Boolean)
        .forEach(entry => {
          if (!seen.has(entry)) {
            seen.add(entry);
            results.push(entry);
          }
        });
    }
  });
  return results;
};

export const pickFirstString = (source, keys) => {
  if (!source || typeof source !== 'object') {
    return null;
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      continue;
    }
    const raw = source[key];
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
  }
  return null;
};

export const parseTopNValue = raw => {
  if (raw === undefined) {
    return { valid: false };
  }
  if (raw === null) {
    return { valid: true, value: null };
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) {
      return { valid: false };
    }
    return { valid: true, value: raw };
  }
  if (typeof raw === 'boolean') {
    return { valid: true, value: raw ? 1 : null };
  }
  if (typeof raw === 'string') {
    const cleaned = raw.trim();
    if (!cleaned) {
      return { valid: false };
    }
    const lowered = cleaned.toLowerCase();
    if (['all', 'none', 'full'].includes(lowered)) {
      return { valid: true, value: null };
    }
    const numeric = Number(cleaned.replace(/,/g, ''));
    if (!Number.isNaN(numeric) && Number.isFinite(numeric) && numeric > 0) {
      return { valid: true, value: numeric };
    }
    return { valid: false };
  }
  return { valid: false };
};

export const parseIndexValue = (value, base = 0) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isInteger(value)) {
    return base === 1 ? value - 1 : value;
  }
  if (typeof value === 'string' && value.trim()) {
    const cleaned = value.replace(/#/g, '').trim();
    const parsed = Number(cleaned.replace(/,/g, ''));
    if (Number.isInteger(parsed)) {
      return base === 1 ? parsed - 1 : parsed;
    }
  }
  return null;
};

const CHART_TYPE_ALIAS = {
  bar: 'bar',
  'bar chart': 'bar',
  column: 'bar',
  line: 'line',
  'line chart': 'line',
  area: 'line',
  pie: 'pie',
  donut: 'doughnut',
  doughnut: 'doughnut',
  'doughnut chart': 'doughnut',
  scatter: 'scatter',
  'scatter plot': 'scatter',
  bubble: 'scatter',
};

export const normaliseChartType = input => {
  if (typeof input !== 'string') {
    return null;
  }
  const lowered = input.trim().toLowerCase();
  if (!lowered) {
    return null;
  }
  return CHART_TYPE_ALIAS[lowered] || null;
};

export const parseValueList = raw => {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw;
  }
  if (typeof raw === 'string') {
    if (!raw.trim()) return [];
    return raw
      .split(/[,|;]/)
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [raw];
};
