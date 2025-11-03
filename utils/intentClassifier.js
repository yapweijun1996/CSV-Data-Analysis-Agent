const ANALYSIS_KEYWORDS = ['chart', 'visual', 'trend', 'compare', 'group', 'sum', 'average', 'insight'];
const CLEANING_KEYWORDS = ['clean', 'remove', 'filter', 'fix', 'rename', 'split', 'merge', 'transform'];
const NARRATIVE_KEYWORDS = ['explain', 'summary', 'story', 'describe', 'narrative'];

const includesKeyword = (text, keywords) => {
  if (!text) return false;
  const lower = text.toLowerCase();
  return keywords.some(keyword => lower.includes(keyword));
};

export const detectIntent = (message, columnProfiles = []) => {
  if (!message) return 'unknown';

  if (includesKeyword(message, CLEANING_KEYWORDS)) {
    return 'cleaning';
  }

  if (includesKeyword(message, ANALYSIS_KEYWORDS)) {
    return 'analysis';
  }

  if (includesKeyword(message, NARRATIVE_KEYWORDS)) {
    return 'narrative';
  }

  const hasTimeColumn = columnProfiles?.some(profile =>
    /date|time|year|month/i.test(profile?.name || '')
  );
  if (hasTimeColumn && /forecast|predict|trend/i.test(message.toLowerCase())) {
    return 'analysis';
  }

  return 'general';
};
