import { escapeHtml } from './helpers.js';

const linkify = text => {
  const withMarkdownLinks = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a class="text-blue-600 underline" target="_blank" rel="noopener noreferrer" href="$2">$1</a>'
  );

  return withMarkdownLinks.replace(/(^|[\s(])((https?:\/\/[^\s<)]+))/g, (match, prefix, url) => {
    return `${prefix}<a class="text-blue-600 underline break-words" target="_blank" rel="noopener noreferrer" href="${url}">${url}</a>`;
  });
};

const applyInlineFormatting = text => {
  let result = linkify(text);
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');
  result = result.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-slate-200 text-slate-800 text-[13px]">$1</code>');
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  result = result.replace(/_(.+?)_/g, '<em>$1</em>');
  return result;
};

const coalesceBreaks = parts => {
  const filtered = [];
  parts.forEach(part => {
    if (part === '<br />' && filtered[filtered.length - 1] === '<br />') {
      return;
    }
    filtered.push(part);
  });
  return filtered;
};

/**
 * Convert basic markdown style text into safe HTML snippets.
 *
 * @param {string} value
 * @returns {string}
 */
export const formatMessageMarkdown = value => {
  if (!value) {
    return '';
  }
  const safe = escapeHtml(value);
  const lines = safe.split(/\r?\n/);
  const htmlParts = [];
  let inList = false;
  let inOrderedList = false;

  const closeLists = () => {
    if (inList) {
      htmlParts.push('</ul>');
      inList = false;
    }
    if (inOrderedList) {
      htmlParts.push('</ol>');
      inOrderedList = false;
    }
  };

  lines.forEach(rawLine => {
    const line = rawLine.trim();
    if (!line.length) {
      closeLists();
      htmlParts.push('<br />');
      return;
    }

    // Ordered list lines like "1. Step"
    const olMatch = line.match(/^\d+\.\s+(.*)/);
    if (olMatch) {
      if (!inOrderedList) {
        if (inList) {
          htmlParts.push('</ul>');
          inList = false;
        }
        htmlParts.push('<ol class="list-decimal list-outside pl-5 space-y-1 text-left">');
        inOrderedList = true;
      }
      const itemContent = applyInlineFormatting(olMatch[1]);
      htmlParts.push(`<li>${itemContent}</li>`);
      return;
    }

    // Unordered list lines like "- item" or "* item"
    const listMatch = line.match(/^[-*]\s+(.*)/);
    if (listMatch) {
      if (!inList) {
        if (inOrderedList) {
          htmlParts.push('</ol>');
          inOrderedList = false;
        }
        htmlParts.push('<ul class="list-disc list-outside pl-5 space-y-1 text-left">');
        inList = true;
      }
      const itemContent = applyInlineFormatting(listMatch[1]);
      htmlParts.push(`<li>${itemContent}</li>`);
      return;
    }

    // Paragraph
    closeLists();
    const paragraphContent = applyInlineFormatting(rawLine);
    htmlParts.push(`<p class="leading-relaxed">${paragraphContent}</p>`);
  });

  closeLists();
  return coalesceBreaks(htmlParts).join('');
};
