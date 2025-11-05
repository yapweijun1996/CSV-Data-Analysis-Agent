export const normaliseTitleKey = value => {
  if (typeof value !== 'string') {
    if (value && typeof value.toString === 'function') {
      const text = value.toString();
      return text ? text.trim().toLowerCase() : null;
    }
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : null;
};
