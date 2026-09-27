/**
 * utils/userErrorMessage.ts
 *
 * Produces consistent, user-facing error messages for every surface in the app.
 *
 * Design goals:
 *  1. Every message is in Mandarin (or the current app language).
 *  2. Every message says what happened in plain language.
 *  3. Every message suggests what the user can do next.
 *  4. The raw technical detail is returned separately so the caller can
 *     render it in a collapsible section without mixing it into the message.
 *
 * This helper is intentionally self-contained — it does not import from localization.ts.
 * Generic catch-block fallbacks should not be scattered across the localization dictionary;
 * keeping them here makes it easy to improve copy per surface without editing a 2000-line file.
 *
 * ## Decision guide — userErrorMessage.ts vs localization.ts
 * - **Use this file** when you are inside a catch block and need a safe, user-visible
 *   error response with a structured message + suggestion + raw technical detail.
 *   The caller picks the `surface` ('chat' | 'analysis' | 'file_upload' | 'report' | 'general').
 * - **Use localization.ts** for known UI states: button labels, status text, progress
 *   messages, toasts with specific content (e.g. "file too large", "analysis complete").
 *
 * If you need to improve the fallback copy for a specific surface, change the
 * entry in SURFACE_COPY below.
 */

export type ErrorSurface =
    | 'chat'
    | 'analysis'
    | 'file_upload'
    | 'report'
    | 'general';

export interface UserErrorMessage {
    /** What happened — user-friendly, translated. */
    message: string;
    /** What to do next — translated action hint. */
    suggestion: string;
    /**
     * Raw technical detail for debugging.
     * Not translated. Intended for a collapsible "查看详情" section.
     * Always populated (never undefined) so callers can always offer it.
     */
    technicalDetail: string;
    /**
     * Convenience: `message + ' ' + suggestion` in a single string.
     * Suitable for surfaces that render a single text bubble (e.g. chat messages).
     */
    fullText: string;
}

type LangMap = Record<string, string>;

interface SurfaceCopy {
    message: LangMap;
    suggestion: LangMap;
}

const SURFACE_COPY: Record<ErrorSurface, SurfaceCopy> = {
    chat: {
        message: {
            English: 'I encountered an unexpected error while processing your request.',
            Mandarin: '处理您的请求时遇到了意外错误。',
            Japanese: 'リクエストの処理中に予期しないエラーが発生しました。',
        },
        suggestion: {
            English: 'Please try again or rephrase your question.',
            Mandarin: '请稍后再试，或换一种方式提问。',
            Japanese: 'もう一度試すか、別の言い方でご質問ください。',
        },
    },
    analysis: {
        message: {
            English: 'An unexpected error occurred during analysis.',
            Mandarin: '分析过程中遇到了意外错误。',
            Japanese: '分析中に予期しないエラーが発生しました。',
        },
        suggestion: {
            English: 'Your data is safe. You can try re-running the analysis.',
            Mandarin: '您的数据仍然安全，可以尝试重新运行分析。',
            Japanese: 'データは安全です。再度分析を実行できます。',
        },
    },
    file_upload: {
        message: {
            English: 'There was an error processing your file.',
            Mandarin: '文件处理时遇到了错误。',
            Japanese: 'ファイルの処理中にエラーが発生しました。',
        },
        suggestion: {
            English: 'Please check the file format and try uploading again.',
            Mandarin: '请检查文件格式并重新上传。',
            Japanese: 'ファイル形式を確認して、再度アップロードしてください。',
        },
    },
    report: {
        message: {
            English: 'An error occurred while generating the report.',
            Mandarin: '生成报告时遇到了错误。',
            Japanese: 'レポートの生成中にエラーが発生しました。',
        },
        suggestion: {
            English: 'Your analysis cards are still available. Try regenerating the report.',
            Mandarin: '分析卡片仍然可用，请尝试重新生成报告。',
            Japanese: '分析カードは引き続き利用可能です。レポートを再生成してみてください。',
        },
    },
    general: {
        message: {
            English: 'The system encountered an unexpected error.',
            Mandarin: '系统遇到了一个意外错误。',
            Japanese: 'システムで予期しないエラーが発生しました。',
        },
        suggestion: {
            English: 'Your data is safe. You can dismiss this notice and continue, or start a new session.',
            Mandarin: '您的数据仍然安全，可关闭此提示继续使用，或点击"重新开始"清空当前会话。',
            Japanese: 'データは安全です。このメッセージを閉じて続行するか、新しいセッションを開始してください。',
        },
    },
};

/**
 * Extracts a human-readable technical summary from any thrown value.
 * Always returns a non-empty string — never throws.
 */
export function extractTechnicalDetail(error: unknown): string {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}`;
    }
    if (typeof error === 'string') {
        return error.trim() || 'Unknown error';
    }
    if (error === null || error === undefined) {
        return 'Unknown error';
    }
    try {
        const stringified = String(error).trim();
        return stringified || 'Unknown error';
    } catch {
        return 'Unknown error';
    }
}

/**
 * Returns a structured user-facing error message for the given surface and
 * language. The result always contains:
 *  - `message`  — what went wrong (Mandarin/translated)
 *  - `suggestion` — what to do next (Mandarin/translated)
 *  - `technicalDetail` — raw error text for a collapsible debug section
 *  - `fullText` — message + suggestion combined (for text-only surfaces)
 */
export function formatUserError(
    error: unknown,
    context?: {
        surface?: ErrorSurface;
        language?: string;
    },
): UserErrorMessage {
    const surface: ErrorSurface = context?.surface ?? 'general';
    const language = context?.language ?? 'English';

    const copy = SURFACE_COPY[surface];
    const message = copy.message[language] ?? copy.message['English'];
    const suggestion = copy.suggestion[language] ?? copy.suggestion['English'];
    const technicalDetail = extractTechnicalDetail(error);

    return {
        message,
        suggestion,
        technicalDetail,
        fullText: `${message} ${suggestion}`,
    };
}
