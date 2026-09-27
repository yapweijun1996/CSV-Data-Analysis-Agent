import React, { useCallback, useEffect, useRef, useState } from 'react';
import { generateText } from 'ai';
import { IconClose } from '../../icons/IconClose';
import { getTranslation } from '../../utils/localization';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import { createProviderModel, isProviderConfigured } from '../../services/ai/providerConfig';
import type { CardTrustReasonCode, CardTrustStatus, Settings } from '../../types';

type Verdict = CardTrustStatus;

export interface VerdictExplanationCache {
    text: string;
    verdict: string;
    reasonCodesKey: string;
}

// Lightweight inline markdown renderer — handles **bold**, *italic*, bullet lists, and paragraphs.
const SimpleMarkdown: React.FC<{ text: string }> = ({ text }) => {
    const blocks = text.split(/\n{2,}/);
    return (
        <div className="space-y-2">
            {blocks.map((block, bi) => {
                const trimmed = block.trim();
                if (!trimmed) return null;

                // Detect bullet list block (lines starting with * or -)
                const lines = trimmed.split('\n');
                const isList = lines.every(l => /^\s*[*\-•]\s+/.test(l) || !l.trim());
                if (isList) {
                    return (
                        <ul key={bi} className="list-disc space-y-1 pl-5">
                            {lines.filter(l => l.trim()).map((line, li) => (
                                <li key={li}>{renderInline(line.replace(/^\s*[*\-•]\s+/, ''))}</li>
                            ))}
                        </ul>
                    );
                }

                // Detect numbered list (lines starting with 1. 2. etc.)
                const isNumberedList = lines.every(l => /^\s*\d+[.)]\s+/.test(l) || !l.trim());
                if (isNumberedList) {
                    return (
                        <ol key={bi} className="list-decimal space-y-1 pl-5">
                            {lines.filter(l => l.trim()).map((line, li) => (
                                <li key={li}>{renderInline(line.replace(/^\s*\d+[.)]\s+/, ''))}</li>
                            ))}
                        </ol>
                    );
                }

                // Regular paragraph
                return <p key={bi}>{renderInline(trimmed.replace(/\n/g, ' '))}</p>;
            })}
        </div>
    );
};

// Render inline markdown: **bold** and *italic*
const renderInline = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    // Match **bold** or *italic* (not greedy)
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }
        if (match[2]) {
            // **bold**
            parts.push(<strong key={match.index}>{match[2]}</strong>);
        } else if (match[3]) {
            // *italic*
            parts.push(<em key={match.index}>{match[3]}</em>);
        }
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts;
};

interface VerdictExplainerModalProps {
    verdict: Verdict;
    reasonCodes: CardTrustReasonCode[];
    detail: string;
    cardTitle: string;
    language: string;
    settings: Settings;
    cachedExplanation?: VerdictExplanationCache | null;
    onExplanationReady?: (cache: VerdictExplanationCache) => void;
    onClose: () => void;
}

const VERDICT_LABELS: Record<Verdict, { icon: string; colorClass: string }> = {
    verified: { icon: '✓', colorClass: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    caveated: { icon: '⚠', colorClass: 'bg-amber-100 text-amber-700 border-amber-200' },
    unverified: { icon: '?', colorClass: 'bg-slate-100 text-slate-700 border-slate-200' },
    stale: { icon: '!', colorClass: 'bg-red-100 text-red-700 border-red-200' },
    weak: { icon: '✗', colorClass: 'bg-red-100 text-red-700 border-red-200' },
};

const AI_EXPLAIN_TIMEOUT_MS = 20_000;
const LOG_PREFIX = '[VerdictExplainer]';

const buildExplainPrompt = (
    verdict: Verdict,
    reasonCodes: CardTrustReasonCode[],
    detail: string,
    cardTitle: string,
    language: string,
): string => {
    const langInstruction = getTranslation('ai_prompt_reply_language', language);

    return [
        `You are a data analysis quality advisor. A user is looking at an analysis card titled "${cardTitle}".`,
        `The system evaluated this card and assigned verdict: "${verdict}".`,
        `Reason codes: ${reasonCodes.length > 0 ? reasonCodes.join(', ') : 'none'}.`,
        `Technical detail: ${detail || 'none'}.`,
        '',
        'Explain to the user in simple, non-technical language:',
        '1. What does this verdict mean for them?',
        '2. For each reason code, explain what it means and why it matters.',
        '3. What should the user do — can they still trust this card, or should they verify further?',
        '',
        'Keep the explanation concise (3-6 sentences). Use bullet points for multiple reasons.',
        langInstruction,
    ].join('\n');
};

export const VerdictExplainerModal: React.FC<VerdictExplainerModalProps> = ({
    verdict,
    reasonCodes,
    detail,
    cardTitle,
    language,
    settings,
    cachedExplanation,
    onExplanationReady,
    onClose,
}) => {
    const [aiExplanation, setAiExplanation] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const reasonCodesKey = JSON.stringify(reasonCodes);

    const fetchAiExplanation = useCallback(async () => {
        // Use cache if available and inputs match
        if (cachedExplanation
            && cachedExplanation.verdict === verdict
            && cachedExplanation.reasonCodesKey === reasonCodesKey) {
            setAiExplanation(cachedExplanation.text);
            return;
        }

        if (!isProviderConfigured(settings)) {
            setError(getTranslation('verdict_explainer_no_provider', language));
            return;
        }

        setIsLoading(true);
        setError(null);

        const abortController = new AbortController();
        abortRef.current = abortController;
        const timer = setTimeout(() => abortController.abort(), AI_EXPLAIN_TIMEOUT_MS);

        try {
            const { model } = createProviderModel(settings, settings.simpleModel);
            const prompt = buildExplainPrompt(verdict, reasonCodes, detail, cardTitle, language);

            const result = await generateText({
                model,
                messages: [
                    { role: 'user', content: prompt },
                ],
                abortSignal: abortController.signal,
            });

            const text = result.text?.trim();
            if (text) {
                setAiExplanation(text);
                onExplanationReady?.({ text, verdict, reasonCodesKey });
                console.log(`${LOG_PREFIX} Explanation generated for "${cardTitle}" (${text.length} chars).`);
            } else {
                setError(getTranslation('verdict_explainer_empty_response', language));
            }
        } catch (err) {
            // Suppress errors when aborted (unmount or timeout after close)
            if (abortController.signal.aborted) return;
            console.warn(`${LOG_PREFIX} Failed for "${cardTitle}":`, err instanceof Error ? err.message : err);
            setError(getTranslation('verdict_explainer_error', language));
        } finally {
            clearTimeout(timer);
            setIsLoading(false);
        }
    }, [settings, verdict, reasonCodes, reasonCodesKey, detail, cardTitle, language, cachedExplanation, onExplanationReady]);

    useEffect(() => {
        fetchAiExplanation();
    }, [fetchAiExplanation]);

    // Abort in-flight request on unmount
    useEffect(() => {
        return () => { abortRef.current?.abort(); };
    }, []);

    const dialogRef = useDialogAccessibility<HTMLDivElement>(true, onClose);

    const handleOverlayClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
    }, [onClose]);

    const verdictStyle = VERDICT_LABELS[verdict];
    const verdictLabel = getTranslation(`card_trust_${verdict}`, language);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={handleOverlayClick}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="verdict-explainer-dialog-title"
                tabIndex={-1}
                className="mx-4 flex w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl"
                style={{ maxHeight: '80vh' }}
            >
                {/* Header — fixed */}
                <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
                    <div className="flex items-center gap-3">
                        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${verdictStyle.colorClass}`}>
                            {verdictStyle.icon}
                        </span>
                        <div>
                            <h2 id="verdict-explainer-dialog-title" className="text-base font-bold text-slate-800">
                                {getTranslation('verdict_explainer_title', language)}
                            </h2>
                            <p className="text-xs text-slate-500">{cardTitle}</p>
                        </div>
                    </div>
                    <button
                        data-dialog-initial-focus
                        type="button"
                        onClick={onClose}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-1.5 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                        aria-label="Close"
                    >
                        <IconClose className="h-5 w-5" />
                    </button>
                </div>

                {/* Body — scrollable */}
                <div className="min-h-0 flex-1 overflow-y-auto space-y-4 px-5 py-4">
                    {/* Verdict badge */}
                    <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold ${verdictStyle.colorClass}`}>
                        <span>{verdictStyle.icon}</span>
                        <span>{verdictLabel}</span>
                    </div>

                    {/* Reason code pills */}
                    {reasonCodes.length > 0 && (
                        <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                                {getTranslation('verdict_explainer_reasons_label', language)}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {reasonCodes.map(code => (
                                    <span
                                        key={code}
                                        className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200"
                                        title={getTranslation(`verdict_reason_${code}`, language)}
                                    >
                                        {getTranslation(`verdict_reason_${code}`, language)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* AI explanation */}
                    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                        <div className="mb-2 flex items-center gap-2">
                            <span className="text-sm">🤖</span>
                            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                                {getTranslation('verdict_explainer_ai_label', language)}
                            </p>
                        </div>
                        {isLoading && (
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                <svg className="h-4 w-4 animate-spin text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                <span>{getTranslation('verdict_explainer_loading', language)}</span>
                            </div>
                        )}
                        {error && !isLoading && (
                            <div className="space-y-2">
                                <p className="text-sm text-red-600">{error}</p>
                                <button
                                    type="button"
                                    onClick={fetchAiExplanation}
                                    className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                                >
                                    {getTranslation('verdict_explainer_retry', language)}
                                </button>
                            </div>
                        )}
                        {aiExplanation && !isLoading && (
                            <div className="text-sm leading-relaxed text-slate-700">
                                <SimpleMarkdown text={aiExplanation} />
                            </div>
                        )}
                    </div>

                    {/* Technical detail (collapsed) */}
                    {detail && (
                        <details className="group">
                            <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-slate-600">
                                {getTranslation('verdict_explainer_technical_detail', language)}
                            </summary>
                            <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-3 text-[11px] text-slate-500">
                                {detail}
                            </pre>
                        </details>
                    )}
                </div>

                {/* Footer — fixed */}
                <div className="shrink-0 border-t border-slate-200 px-5 py-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
                    >
                        {getTranslation('verdict_explainer_close', language)}
                    </button>
                </div>
            </div>
        </div>
    );
};
