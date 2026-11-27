import React, { useEffect, useRef, useState } from 'react';
import { getTranslation } from '../../utils/localization';
import { MarkdownRenderer } from '../MarkdownRenderer';

interface ReasoningBlockProps {
    text: string;
    language: string;
    /** Open and follow the newest text while the model is still thinking. */
    live?: boolean;
}

/** Models emit step titles as a lone **Bold** line; promote them to headings so steps read as separate sections. */
const normalizeReasoning = (raw: string): string =>
    raw.replace(/\r\n/g, '\n').replace(/^\s*\*\*([^*\n]{2,120})\*\*\s*$/gm, '### $1');

/** Collapsible view of the model's reasoning. Streams open while thinking, collapsed on a finished reply. */
export const ReasoningBlock: React.FC<ReasoningBlockProps> = ({ text, language, live = false }) => {
    const [expanded, setExpanded] = useState(live);
    const bodyRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (live && expanded && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }, [text, live, expanded]);
    if (!text.trim()) return null;
    return (
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-600" data-testid="reasoning-block">
            <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                aria-expanded={expanded}
                className="flex min-h-[44px] w-full items-center gap-1.5 px-3 py-1.5 text-left font-medium text-slate-500 md:min-h-0"
            >
                <svg className={`h-3 w-3 shrink-0 text-slate-400 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
                </svg>
                <span className={live ? 'chat-thinking-text' : ''}>{getTranslation('chat_reasoning_label', language)}</span>
            </button>
            {expanded && (
                <div ref={bodyRef} className="max-h-[min(28rem,60vh)] overflow-y-auto border-t border-slate-200 px-3.5 py-3 text-[13px] leading-relaxed" data-testid="reasoning-body">
                    <MarkdownRenderer content={normalizeReasoning(text)} compact={true} />
                </div>
            )}
        </div>
    );
};
