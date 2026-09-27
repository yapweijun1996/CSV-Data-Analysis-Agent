import React, { useCallback, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { getTranslation } from '../../utils/localization';

/** Tiny copy-to-clipboard button — appears on hover, shows checkmark after copy. */
export const CopyButton: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => {
    const [copied, setCopied] = useState(false);
    const language = useAppStore(state => state.settings.language);
    const label = getTranslation(copied ? 'chat_copied' : 'chat_copy', language);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Fallback for non-secure contexts
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }
    }, [text]);

    return (
        <button
            type="button"
            onClick={handleCopy}
            title={label}
            aria-label={label}
            className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-1 opacity-100 transition-opacity md:min-h-0 md:min-w-0 md:opacity-0 md:group-hover/bubble:opacity-100 ${className}`}
        >
            {copied ? (
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M3.5 8.5l3 3 6-7" />
                </svg>
            ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="5" y="5" width="8" height="8" rx="1.5" />
                    <path d="M3 11V3.5A1.5 1.5 0 014.5 2H11" />
                </svg>
            )}
        </button>
    );
};
