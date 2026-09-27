
import React, { useMemo } from 'react';

// Lightweight markdown renderer to avoid large dependencies while still
// supporting headings, lists and basic inline formatting for AI responses.
type MarkdownBlock =
    | { type: 'heading'; level: 1 | 2 | 3; text: string }
    | { type: 'paragraph'; text: string }
    | { type: 'list'; ordered: boolean; items: string[] }
    | { type: 'code'; text: string };

const parseMarkdown = (markdown: string): MarkdownBlock[] => {
    const lines = markdown.split(/\r?\n/);
    const blocks: MarkdownBlock[] = [];

    let paragraphBuffer: string[] = [];
    let listBuffer: { ordered: boolean; items: string[] } | null = null;
    let codeBuffer: string[] | null = null;

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
            blocks.push({ type: 'code', text: codeBuffer.join('\n') });
            codeBuffer = null;
        }
    };

    for (const line of lines) {
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

const renderInline = (text: string, keyPrefix: string): React.ReactNode[] => {
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
                <code key={key} className="bg-slate-100 rounded px-1 py-0.5 text-sm">
                    {token.slice(1, -1)}
                </code>
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
}

const MarkdownRendererComponent: React.FC<MarkdownRendererProps> = ({ content = '', compact = false }) => {
    const trimmed = content.trim();
    const blocks = useMemo(() => (trimmed ? parseMarkdown(trimmed) : []), [trimmed]);

    if (!trimmed) {
        return <p className="text-slate-500">Overall insights will appear here once ready.</p>;
    }

    return (
        <div className={`${compact ? 'space-y-2' : 'space-y-4'} text-slate-700`}>
            {blocks.map((block, index) => {
                if (block.type === 'heading') {
                    const Tag = block.level === 1 ? 'h3' : block.level === 2 ? 'h4' : 'h5';
                    return (
                        <Tag key={`heading-${index}`} className="font-semibold text-slate-900">
                            {renderInline(block.text, `heading-${index}`)}
                        </Tag>
                    );
                }

                if (block.type === 'list') {
                    const ListTag = block.ordered ? 'ol' : 'ul';
                    const listClass = block.ordered ? 'list-decimal' : 'list-disc';
                    return (
                        <ListTag key={`list-${index}`} className={`${listClass} space-y-1 pl-6`}>
                            {block.items.map((item, itemIndex) => (
                                <li key={`list-${index}-${itemIndex}`}>{renderInline(item, `list-${index}-${itemIndex}`)}</li>
                            ))}
                        </ListTag>
                    );
                }

                if (block.type === 'code') {
                    return (
                        <pre
                            key={`code-${index}`}
                            className="bg-slate-950/90 text-slate-100 rounded-card p-4 text-sm overflow-x-auto"
                        >
                            <code>{block.text}</code>
                        </pre>
                    );
                }

                return (
                    <p key={`paragraph-${index}`} className="leading-relaxed">
                        {renderInline(block.text, `paragraph-${index}`)}
                    </p>
                );
            })}
        </div>
    );
};

export const MarkdownRenderer = React.memo(MarkdownRendererComponent);
