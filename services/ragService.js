const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'for',
  'to',
  'of',
  'in',
  'on',
  'with',
  'at',
  'by',
  'from',
  'is',
  'it',
  'this',
  'that',
  'these',
  'those',
  'be',
  'are',
  'was',
  'were',
  'as',
  'about',
  'into',
  'over',
  'after',
]);

const tokenize = text => {
  if (!text) return [];
  return text
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter(token => !STOP_WORDS.has(token)) || [];
};

export const embedText = text => {
  const tokens = tokenize(text);
  if (!tokens.length) {
    return { norm: 0, weights: {} };
  }

  const weights = {};
  tokens.forEach(token => {
    weights[token] = (weights[token] || 0) + 1;
  });
  const norm = Math.sqrt(Object.values(weights).reduce((sum, count) => sum + count * count, 0));
  return { norm, weights };
};

export const cosineSimilarity = (a, b) => {
  if (!a || !b || !a.norm || !b.norm) return 0;
  let dot = 0;
  const keys = Object.keys(a.weights);
  for (const key of keys) {
    if (b.weights[key]) {
      dot += a.weights[key] * b.weights[key];
    }
  }
  return dot / (a.norm * b.norm);
};
