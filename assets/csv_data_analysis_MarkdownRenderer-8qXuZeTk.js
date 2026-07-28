import { W as We, a as reactExports, j as jsxRuntimeExports } from "./csv_data_analysis_vendor-react-core-C-mUT8EF.js";
import { H as HighlightJS, b as bash, c as css, j as javascript, d as json, m as markdown, s as sql, t as typescript, x as xml } from "./csv_data_analysis_vendor-ui-DPkU1-1J.js";
import { u as useAppStore } from "./csv_data_analysis_index-L92MBGHW.js";
import { U as getTranslation } from "./csv_data_analysis_app-agent-DytoEScF.js";
HighlightJS.registerLanguage("bash", bash);
HighlightJS.registerLanguage("css", css);
HighlightJS.registerLanguage("javascript", javascript);
HighlightJS.registerLanguage("json", json);
HighlightJS.registerLanguage("markdown", markdown);
HighlightJS.registerLanguage("sql", sql);
HighlightJS.registerLanguage("typescript", typescript);
HighlightJS.registerLanguage("xml", xml);
const LANGUAGE_ALIASES = {
  js: { label: "js", highlightLanguage: "javascript" },
  javascript: { label: "js", highlightLanguage: "javascript" },
  jsx: { label: "jsx", highlightLanguage: "javascript" },
  ts: { label: "ts", highlightLanguage: "typescript" },
  typescript: { label: "ts", highlightLanguage: "typescript" },
  tsx: { label: "tsx", highlightLanguage: "typescript" },
  json: { label: "json", highlightLanguage: "json" },
  sql: { label: "sql", highlightLanguage: "sql" },
  bash: { label: "bash", highlightLanguage: "bash" },
  sh: { label: "bash", highlightLanguage: "bash" },
  shell: { label: "bash", highlightLanguage: "bash" },
  zsh: { label: "bash", highlightLanguage: "bash" },
  html: { label: "html", highlightLanguage: "xml" },
  xml: { label: "html", highlightLanguage: "xml" },
  css: { label: "css", highlightLanguage: "css" },
  md: { label: "md", highlightLanguage: "markdown" },
  markdown: { label: "md", highlightLanguage: "markdown" }
};
const TONE_CLASSES = {
  default: {
    root: "text-slate-700",
    heading: "text-slate-900",
    paragraph: "leading-relaxed",
    inlineCode: "break-all rounded bg-slate-100 px-1 py-0.5 text-sm text-slate-900",
    tableShell: "border border-slate-200",
    tableHead: "bg-slate-100 text-slate-600",
    tableRow: "border-t border-slate-200",
    tableCell: "text-slate-700",
    codeShell: "bg-slate-950/90 text-slate-100",
    codeLabel: "border-b border-slate-800 bg-slate-900/80 text-slate-300"
  },
  inverse: {
    root: "text-white/90",
    heading: "text-white",
    paragraph: "leading-relaxed",
    inlineCode: "break-all rounded bg-white/15 px-1 py-0.5 text-sm text-blue-50",
    tableShell: "border border-white/20",
    tableHead: "bg-white/10 text-white/80",
    tableRow: "border-t border-white/15",
    tableCell: "text-white/90",
    codeShell: "bg-slate-950/90 text-slate-100",
    codeLabel: "border-b border-slate-800 bg-slate-900/80 text-slate-300"
  }
};
const normalizeCodeLanguage = (rawLanguage) => {
  const normalized = rawLanguage.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return LANGUAGE_ALIASES[normalized] ?? null;
};
const highlightCodeBlock = (text, language) => {
  if (!language) {
    return null;
  }
  const config = LANGUAGE_ALIASES[language];
  if (!config) {
    return null;
  }
  try {
    return HighlightJS.highlight(text, {
      language: config.highlightLanguage,
      ignoreIllegals: true
    }).value;
  } catch {
    return null;
  }
};
const normalizeReadableMath = (content) => content.replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (_match, expression) => {
  const readable = expression.replace(/\\text\{([^{}]*)\}/g, "$1").replace(/\\mathbf\{([^{}]*)\}/g, "**$1**").replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1 ÷ $2").replace(/\\left|\\right/g, "").replace(/\\times/g, "×").replace(/\\(?:approx|simeq)/g, "≈").replace(/\\%/g, "%").replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
  return `

${readable}

`;
}).replace(/\$([^$\n]+)\$/g, (_match, expression) => expression.replace(/\\text\{([^{}]*)\}/g, "$1").replace(/\\mathbf\{([^{}]*)\}/g, "**$1**").replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1 ÷ $2").replace(/\\left|\\right/g, "").replace(/\\times/g, "×").replace(/\\(?:approx|simeq)/g, "≈").replace(/\\%/g, "%").replace(/[{}]/g, "").replace(/\s+/g, " ").trim());
const parseMarkdown = (markdownText) => {
  var _a;
  const lines = markdownText.split(/\r?\n/);
  const blocks = [];
  let paragraphBuffer = [];
  let listBuffer = null;
  let codeBuffer = null;
  let codeLanguage;
  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      blocks.push({ type: "paragraph", text: paragraphBuffer.join(" ").trim() });
      paragraphBuffer = [];
    }
  };
  const flushList = () => {
    if (listBuffer && listBuffer.items.length > 0) {
      blocks.push({ type: "list", ordered: listBuffer.ordered, items: listBuffer.items });
    }
    listBuffer = null;
  };
  const flushCode = () => {
    if (codeBuffer !== null) {
      blocks.push({ type: "code", text: codeBuffer.join("\n"), language: codeLanguage });
      codeBuffer = null;
      codeLanguage = void 0;
    }
  };
  const isTableLine = (line) => line.includes("|");
  const isTableSeparator = (line) => /^\|?(\s*:?-+:?\s*\|)+/.test(line.trim());
  const parseTableRow = (line) => {
    const trimmed = line.trim();
    const content = trimmed.startsWith("|") && trimmed.endsWith("|") ? trimmed.substring(1, trimmed.length - 1) : trimmed;
    return content.split("|").map((cell) => cell.trim());
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (codeBuffer !== null) {
      if (trimmed.startsWith("```")) {
        flushCode();
      } else {
        codeBuffer.push(line);
      }
      continue;
    }
    if (trimmed.startsWith("```")) {
      flushParagraph();
      flushList();
      codeBuffer = [];
      codeLanguage = (_a = normalizeCodeLanguage(trimmed.slice(3))) == null ? void 0 : _a.label;
      continue;
    }
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2].trim()
      });
      continue;
    }
    const nextLine = lines[index + 1];
    if (isTableLine(line) && nextLine && isTableSeparator(nextLine)) {
      flushParagraph();
      flushList();
      const headers = parseTableRow(line);
      const rows = [];
      let tableIndex = index + 2;
      while (tableIndex < lines.length && isTableLine(lines[tableIndex])) {
        const rowCells = parseTableRow(lines[tableIndex]);
        if (rowCells.length === headers.length) {
          rows.push(rowCells);
        }
        tableIndex += 1;
      }
      if (headers.length > 0 && headers.every((header) => header.length > 0)) {
        blocks.push({ type: "table", headers, rows });
        index = tableIndex - 1;
        continue;
      }
    }
    const unorderedMatch = line.match(/^[-*]\s+(.*)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (!listBuffer || listBuffer.ordered) {
        flushList();
        listBuffer = { ordered: false, items: [] };
      }
      listBuffer.items.push(unorderedMatch[1]);
      continue;
    }
    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      if (!listBuffer || !listBuffer.ordered) {
        flushList();
        listBuffer = { ordered: true, items: [] };
      }
      listBuffer.items.push(orderedMatch[1]);
      continue;
    }
    paragraphBuffer.push(line);
  }
  flushParagraph();
  flushList();
  flushCode();
  return blocks;
};
const renderInline = (text, keyPrefix, tone) => {
  const nodes = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match;
  let tokenIndex = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${tokenIndex}`;
    if (token.startsWith("**")) {
      nodes.push(/* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: token.slice(2, -2) }, key));
    } else if (token.startsWith("*")) {
      nodes.push(/* @__PURE__ */ jsxRuntimeExports.jsx("em", { children: token.slice(1, -1) }, key));
    } else if (token.startsWith("`")) {
      nodes.push(
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: TONE_CLASSES[tone].inlineCode, children: token.slice(1, -1) }, key)
      );
    }
    tokenIndex += 1;
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
};
const MarkdownRendererComponent = ({
  content = "",
  compact = false,
  tone = "default"
}) => {
  const language = useAppStore((state) => state.settings.language);
  const resolvedTone = tone;
  const trimmed = normalizeReadableMath(content).trim();
  const blocks = reactExports.useMemo(() => trimmed ? parseMarkdown(trimmed) : [], [trimmed]);
  const toneClasses = TONE_CLASSES[resolvedTone];
  if (!trimmed) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: resolvedTone === "inverse" ? "text-white/70" : "text-slate-500", children: getTranslation("markdown_insights_pending", language) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `${compact ? "space-y-2" : "space-y-4"} min-w-0 ${toneClasses.root}`, children: blocks.map((block, index) => {
    if (block.type === "heading") {
      const Tag = block.level === 1 ? "h3" : block.level === 2 ? "h4" : "h5";
      const sizeClass = block.level === 1 ? "text-md font-bold" : block.level === 2 ? "text-base font-semibold" : "text-sm font-semibold";
      return /* @__PURE__ */ jsxRuntimeExports.jsx(Tag, { className: `${sizeClass} ${toneClasses.heading}`, children: renderInline(block.text, `heading-${index}`, resolvedTone) }, `heading-${index}`);
    }
    if (block.type === "list") {
      const ListTag = block.ordered ? "ol" : "ul";
      const listClass = block.ordered ? "list-decimal" : "list-disc";
      return /* @__PURE__ */ jsxRuntimeExports.jsx(ListTag, { className: `${listClass} space-y-1 pl-6`, children: block.items.map((item, itemIndex) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: renderInline(item, `list-${index}-${itemIndex}`, resolvedTone) }, `list-${index}-${itemIndex}`)) }, `list-${index}`);
    }
    if (block.type === "table") {
      const fitsCompactPanel = compact && block.headers.length <= 4;
      return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `max-w-full overflow-x-auto rounded-md ${toneClasses.tableShell}`, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: `${fitsCompactPanel ? "w-full table-fixed" : "min-w-max"} text-left ${compact ? "text-xs" : "text-sm"}`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: toneClasses.tableHead, children: /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: block.headers.map((header, headerIndex) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "th",
          {
            className: `${fitsCompactPanel && headerIndex === 0 ? "w-[46%]" : ""} break-words p-2 align-top font-semibold`,
            children: renderInline(header, `th-${index}-${headerIndex}`, resolvedTone)
          },
          headerIndex
        )) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { className: resolvedTone === "inverse" ? "bg-transparent" : "bg-white", children: block.rows.map((row, rowIndex) => /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { className: toneClasses.tableRow, children: row.map((cell, cellIndex) => /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: `break-words p-2 align-top ${toneClasses.tableCell}`, children: renderInline(cell, `td-${index}-${rowIndex}-${cellIndex}`, resolvedTone) }, cellIndex)) }, rowIndex)) })
      ] }) }, `table-${index}`);
    }
    if (block.type === "code") {
      const highlighted = highlightCodeBlock(block.text, block.language);
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `overflow-hidden rounded-card ${toneClasses.codeShell}`, children: [
        block.language && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] ${toneClasses.codeLabel}`, children: block.language }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "max-w-full overflow-x-auto p-4 text-sm text-slate-100", children: highlighted ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          "code",
          {
            className: `hljs block min-w-max !bg-transparent !p-0 language-${block.language}`,
            dangerouslySetInnerHTML: { __html: highlighted }
          }
        ) : /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "block min-w-max", children: block.text }) })
      ] }, `code-${index}`);
    }
    return /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `break-words ${toneClasses.paragraph}`, children: renderInline(block.text, `paragraph-${index}`, resolvedTone) }, `paragraph-${index}`);
  }) });
};
const MarkdownRenderer = We.memo(MarkdownRendererComponent);
export {
  MarkdownRenderer as M
};
