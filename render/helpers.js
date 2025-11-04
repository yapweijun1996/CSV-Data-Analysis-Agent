/**
 * 安全转义字符串以防止注入。
 *
 * @param {unknown} value
 * @returns {string}
 */
export const escapeHtml = value => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};
