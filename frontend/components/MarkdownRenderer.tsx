import React, { useMemo } from 'react';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import 'highlight.js/styles/github-dark.css';
import { useAppStore } from '../store/useAppStore';
import { getTranslation } from '../utils/localization';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);

type MarkdownBlock =
    | { type: 'heading'; level: 1 | 2 | 3; text: string }
    | { type: 'paragraph'; text: string }
    | { type: 'list'; ordered: boolean; items: string[] }
    | { type: 'code'; text: string; language?: SupportedCodeLanguage }
    | { type: 'table'; headers: string[]; rows: string[][] };

type Tone = 'default' | 'inverse';
type SupportedCodeLanguage = 'js' | 'jsx' | 'ts' | 'tsx' | 'json' | 'sql' | 'bash' | 'html' | 'css' | 'md';

type HighlightLanguageConfig = {
    label: SupportedCodeLanguage;
    highlightLanguage: string;
};

const LANGUAGE_ALIASES: Record<string, HighlightLanguageConfig> = {
    js: { label: 'js', highlightLanguage: 'javascript' },
    javascript: { label: 'js', highlightLanguage: 'javascript' },
    jsx: { label: 'jsx', highlightLanguage: 'javascript' },
    ts: { label: 'ts', highlightLanguage: 'typescript' },
    typescript: { label: 'ts', highlightLanguage: 'typescript' },
    tsx: { label: 'tsx', highlightLanguage: 'typescript' },
    json: { label: 'json', highlightLanguage: 'json' },
    sql: { label: 'sql', highlightLanguage: 'sql' },
    bash: { label: 'bash', highlightLanguage: 'bash' },
    sh: { label: 'bash', highlightLanguage: 'bash' },
    shell: { label: 'bash', highlightLanguage: 'bash' },
    zsh: { label: 'bash', highlightLanguage: 'bash' },
    html: { label: 'html', highlightLanguage: 'xml' },
    xml: { label: 'html', highlightLanguage: 'xml' },
    css: { label: 'css', highlightLanguage: 'css' },
    md: { label: 'md', highlightLanguage: 'markdown' },
    markdown: { label: 'md', highlightLanguage: 'markdown' },
};

const TONE_CLASSES: Record<Tone, {
    root: string;
    heading: string;
    paragraph: string;
    inlineCode: string;
    tableShell: string;
    tableHead: string;
    tableRow: string;
    tableCell: string;
    codeShell: string;
    codeLabel: string;
}> = {
    default: {
        root: 'text-slate-700',
        heading: 'text-slate-900',
        paragraph: 'leading-relaxed',
        inlineCode: 'break-all rounded bg-slate-100 px-1 py-0.5 text-sm text-slate-900',
        tableShell: 'border border-slate-200',
        tableHead: 'bg-slate-100 text-slate-600',
        tableRow: 'border-t border-slate-200',
        tableCell: 'text-slate-700',
        codeShell: 'bg-slate-950/90 text-slate-100',
        codeLabel: 'border-b border-slate-800 bg-slate-900/80 text-slate-300',
    },
    inverse: {
        root: 'text-white/90',
        heading: 'text-white',
        paragraph: 'leading-relaxed',
        inlineCode: 'break-all rounded bg-white/15 px-1 py-0.5 text-sm text-blue-50',
        tableShell: 'border border-white/20',
        tableHead: 'bg-white/10 text-white/80',
        tableRow: 'border-t border-white/15',
        tableCell: 'text-white/90',
        codeShell: 'bg-slate-950/90 text-slate-100',
        codeLabel: 'border-b border-slate-800 bg-slate-900/80 text-slate-300',
    },
};

const normalizeCodeLanguage = (rawLanguage: string): HighlightLanguageConfig | null => {
    const normalized = rawLanguage.trim().toLowerCase();
    if (!normalized) {
        return null;
    }
    return LANGUAGE_ALIASES[normalized] ?? null;
};

const highlightCodeBlock = (text: string, language?: SupportedCodeLanguage) => {
    if (!language) {
        return null;
    }

    const config = LANGUAGE_ALIASES[language];
    if (!config) {
        return null;
    }

    try {
        return hljs.highlight(text, {
            language: config.highlightLanguage,
            ignoreIllegals: true,
        }).value;
    } catch {
        return null;
    }
};

const normalizeReadableMath = (content: string): string => content
    .replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (_match, expression: string) => {
        const readable = expression
            .replace(/\\text\{([^{}]*)\}/g, '$1')
            .replace(/\\mathbf\{([^{}]*)\}/g, '**$1**')
            .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1 ÷ $2')
            .replace(/\\left|\\right/g, '')
            .replace(/\\times/g, '×')
            .replace(/\\(?:approx|simeq)/g, '≈')
            .replace(/\\%/g, '%')
            .replace(/[{}]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        return `\n\n${readable}\n\n`;
    })
    .replace(/\$([^$\n]+)\$/g, (_match, expression: string) => expression
        .replace(/\\text\{([^{}]*)\}/g, '$1')
        .replace(/\\mathbf\{([^{}]*)\}/g, '**$1**')
        .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1 ÷ $2')
        .replace(/\\left|\\right/g, '')
        .replace(/\\times/g, '×')
        .replace(/\\(?:approx|simeq)/g, '≈')
        .replace(/\\%/g, '%')
        .replace(/[{}]/g, '')
        .replace(/\s+/g, ' ')
        .trim());

const parseMarkdown = (markdownText: string): MarkdownBlock[] => {
    const lines = markdownText.split(/\r?\n/);
    const blocks: MarkdownBlock[] = [];

    let paragraphBuffer: string[] = [];
    let listBuffer: { ordered: boolean; items: string[] } | null = null;
    let codeBuffer: string[] | null = null;
    let codeLanguage: SupportedCodeLanguage | undefined;

    const flushParagraph = () => {
        if (paragraphBuffer.length > 0) {
            blocks.push({ type: 'paragraph', text: paragraphBuffer.join(' ').trim() });
            paragraphBuffer = [];
        }
    };

    const flushList = () => {
        if (listBuffer && listBuffer.items.length > 0) {
            blocks.push({ type: 'list', ordered: listBuffer.ordered, items: listBuffer.items });
        }
        listBuffer = null;
    };

    const flushCode = () => {
        if (codeBuffer !== null) {
            blocks.push({ type: 'code', text: codeBuffer.join('\n'), language: codeLanguage });
            codeBuffer = null;
            codeLanguage = undefined;
        }
    };

    const isTableLine = (line: string) => line.includes('|');
    const isTableSeparator = (line: string) => /^\|?(\s*:?-+:?\s*\|)+/.test(line.trim());
    const parseTableRow = (line: string) => {
        const trimmed = line.trim();
        const content = trimmed.startsWith('|') && trimmed.endsWith('|')
            ? trimmed.substring(1, trimmed.length - 1)
            : trimmed;
        return content.split('|').map(cell => cell.trim());
    };

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const trimmed = line.trim();

        if (codeBuffer !== null) {
            if (trimmed.startsWith('```')) {
                flushCode();
            } else {
                codeBuffer.push(line);
            }
            continue;
        }

        if (trimmed.startsWith('```')) {
            flushParagraph();
            flushList();
            codeBuffer = [];
            codeLanguage = normalizeCodeLanguage(trimmed.slice(3))?.label;
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
                type: 'heading',
                level: headingMatch[1].length as 1 | 2 | 3,
                text: headingMatch[2].trim(),
            });
            continue;
        }

        const nextLine = lines[index + 1];
        if (isTableLine(line) && nextLine && isTableSeparator(nextLine)) {
            flushParagraph();
            flushList();

            const headers = parseTableRow(line);
            const rows: string[][] = [];
            let tableIndex = index + 2;

            while (tableIndex < lines.length && isTableLine(lines[tableIndex])) {
                const rowCells = parseTableRow(lines[tableIndex]);
                if (rowCells.length === headers.length) {
                    rows.push(rowCells);
                }
                tableIndex += 1;
            }

            if (headers.length > 0 && headers.every(header => header.length > 0)) {
                blocks.push({ type: 'table', headers, rows });
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

const renderInline = (text: string, keyPrefix: string, tone: Tone): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let tokenIndex = 0;

    while ((match = pattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
            nodes.push(text.slice(lastIndex, match.index));
        }

        const token = match[0];
        const key = `${keyPrefix}-${tokenIndex}`;

        if (token.startsWith('**')) {
            nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
        } else if (token.startsWith('*')) {
            nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
        } else if (token.startsWith('`')) {
            nodes.push(
                <code key={key} className={TONE_CLASSES[tone].inlineCode}>
                    {token.slice(1, -1)}
                </code>,
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

interface MarkdownRendererProps {
    content?: string;
    compact?: boolean;
    tone?: Tone;
}

const MarkdownRendererComponent: React.FC<MarkdownRendererProps> = ({
    content = '',
    compact = false,
    tone = 'default' as Tone,
}) => {
    const language = useAppStore(state => state.settings.language);
    const resolvedTone: Tone = tone;
    const trimmed = normalizeReadableMath(content).trim();
    const blocks = useMemo(() => (trimmed ? parseMarkdown(trimmed) : []), [trimmed]);
    const toneClasses = TONE_CLASSES[resolvedTone];

    if (!trimmed) {
        return (
            <p className={resolvedTone === 'inverse' ? 'text-white/70' : 'text-slate-500'}>
                {getTranslation('markdown_insights_pending', language)}
            </p>
        );
    }

    return (
        <div className={`${compact ? 'space-y-2' : 'space-y-4'} min-w-0 ${toneClasses.root}`}>
            {blocks.map((block, index) => {
                if (block.type === 'heading') {
                    const Tag = block.level === 1 ? 'h3' : block.level === 2 ? 'h4' : 'h5';
                    const sizeClass = block.level === 1 ? 'text-md font-bold' : block.level === 2 ? 'text-base font-semibold' : 'text-sm font-semibold';
                    return (
                        <Tag key={`heading-${index}`} className={`${sizeClass} ${toneClasses.heading}`}>
                            {renderInline(block.text, `heading-${index}`, resolvedTone)}
                        </Tag>
                    );
                }

                if (block.type === 'list') {
                    const ListTag = block.ordered ? 'ol' : 'ul';
                    const listClass = block.ordered ? 'list-decimal' : 'list-disc';
                    return (
                        <ListTag key={`list-${index}`} className={`${listClass} space-y-1 pl-6`}>
                            {block.items.map((item, itemIndex) => (
                                <li key={`list-${index}-${itemIndex}`}>{renderInline(item, `list-${index}-${itemIndex}`, resolvedTone)}</li>
                            ))}
                        </ListTag>
                    );
                }

                if (block.type === 'table') {
                    const fitsCompactPanel = compact && block.headers.length <= 4;
                    return (
                        <div key={`table-${index}`} className={`max-w-full overflow-x-auto rounded-md ${toneClasses.tableShell}`}>
                            <table className={`${fitsCompactPanel ? 'w-full table-fixed' : 'min-w-max'} text-left ${compact ? 'text-xs' : 'text-sm'}`}>
                                <thead className={toneClasses.tableHead}>
                                    <tr>
                                        {block.headers.map((header, headerIndex) => (
                                            <th
                                                key={headerIndex}
                                                className={`${fitsCompactPanel && headerIndex === 0 ? 'w-[46%]' : ''} break-words p-2 align-top font-semibold`}
                                            >
                                                {renderInline(header, `th-${index}-${headerIndex}`, resolvedTone)}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className={resolvedTone === 'inverse' ? 'bg-transparent' : 'bg-white'}>
                                    {block.rows.map((row, rowIndex) => (
                                        <tr key={rowIndex} className={toneClasses.tableRow}>
                                            {row.map((cell, cellIndex) => (
                                                <td key={cellIndex} className={`break-words p-2 align-top ${toneClasses.tableCell}`}>
                                                    {renderInline(cell, `td-${index}-${rowIndex}-${cellIndex}`, resolvedTone)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    );
                }

                if (block.type === 'code') {
                    const highlighted = highlightCodeBlock(block.text, block.language);
                    return (
                        <div key={`code-${index}`} className={`overflow-hidden rounded-card ${toneClasses.codeShell}`}>
                            {block.language && (
                                <div className={`px-4 py-2 text-[11px] font-medium uppercase tracking-[0.18em] ${toneClasses.codeLabel}`}>
                                    {block.language}
                                </div>
                            )}
                            <pre className="max-w-full overflow-x-auto p-4 text-sm text-slate-100">
                                {highlighted ? (
                                    <code
                                        className={`hljs block min-w-max !bg-transparent !p-0 language-${block.language}`}
                                        dangerouslySetInnerHTML={{ __html: highlighted }}
                                    />
                                ) : (
                                    <code className="block min-w-max">{block.text}</code>
                                )}
                            </pre>
                        </div>
                    );
                }

                return (
                    <p key={`paragraph-${index}`} className={`break-words ${toneClasses.paragraph}`}>
                        {renderInline(block.text, `paragraph-${index}`, resolvedTone)}
                    </p>
                );
            })}
        </div>
    );
};

export const MarkdownRenderer = React.memo(MarkdownRendererComponent);
