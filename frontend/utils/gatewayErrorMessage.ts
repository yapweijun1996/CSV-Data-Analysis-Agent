/**
 * utils/gatewayErrorMessage.ts
 *
 * Turns raw shared-gateway (Demo) failures into plain-language messages with a
 * next step, keeping the gateway's `error.code` visible so a user can report it.
 *
 * Provider SDKs surface these as one string such as
 * `OpenAI API error (400): {"message":"...","code":"DEMO_FIELD_DISABLED"}`, so
 * recognition is text based. Unrecognised errors return null and callers keep
 * their existing wording; nothing here changes control flow.
 */

export type GatewayErrorKind =
    | 'session'
    | 'concurrency'
    | 'ip_rate_limit'
    | 'quota'
    | 'unavailable'
    | 'upstream'
    | 'rejected'
    | 'stale_build';

export interface GatewayErrorInfo {
    kind: GatewayErrorKind;
    code?: string;
}

type LangMap = Record<string, string>;
interface KindCopy { message: LangMap; suggestion: LangMap }

const COPY: Record<GatewayErrorKind, KindCopy> = {
    session: {
        message: {
            English: 'The shared AI session expired.',
            Mandarin: '共享 AI 的连接已过期。',
            Malay: 'Sesi AI dikongsi telah tamat tempoh.',
            Japanese: '共有 AI のセッションが期限切れになりました。',
        },
        suggestion: {
            English: 'Retry the analysis; a new session is opened automatically.',
            Mandarin: '请重试分析，系统会自动建立新连接。',
            Malay: 'Cuba analisis semula; sesi baharu dibuka secara automatik.',
            Japanese: '分析を再実行してください。新しいセッションが自動で開始されます。',
        },
    },
    concurrency: {
        message: {
            English: 'Too many AI requests were running at once.',
            Mandarin: '同时进行的 AI 请求过多。',
            Malay: 'Terlalu banyak permintaan AI berjalan serentak.',
            Japanese: '同時に実行されている AI リクエストが多すぎます。',
        },
        suggestion: {
            English: 'Wait a few seconds and retry.',
            Mandarin: '请等几秒后重试。',
            Malay: 'Tunggu beberapa saat dan cuba semula.',
            Japanese: '数秒待ってから再試行してください。',
        },
    },
    ip_rate_limit: {
        message: {
            English: 'Your network sent too many requests to the shared AI service.',
            Mandarin: '你的网络向共享 AI 服务发送的请求过多。',
            Malay: 'Rangkaian anda menghantar terlalu banyak permintaan kepada perkhidmatan AI dikongsi.',
            Japanese: 'お使いのネットワークから共有 AI サービスへのリクエストが多すぎます。',
        },
        suggestion: {
            English: 'Wait about a minute, then retry.',
            Mandarin: '请等待约一分钟后重试。',
            Malay: 'Tunggu kira-kira seminit, kemudian cuba semula.',
            Japanese: '1 分ほど待ってから再試行してください。',
        },
    },
    quota: {
        message: {
            English: "Today's shared AI quota is used up.",
            Mandarin: '今天的共享 AI 额度已用完。',
            Malay: 'Kuota AI dikongsi hari ini telah habis.',
            Japanese: '本日の共有 AI の利用枠を使い切りました。',
        },
        suggestion: {
            English: 'Try again tomorrow, or add your own API key in Settings.',
            Mandarin: '请明天再试，或在 Settings 中填入你自己的 API key。',
            Malay: 'Cuba lagi esok, atau tambah kunci API anda sendiri dalam Settings.',
            Japanese: '明日もう一度お試しいただくか、Settings で自分の API キーを設定してください。',
        },
    },
    unavailable: {
        message: {
            English: 'The shared AI service is not available for this site right now.',
            Mandarin: '共享 AI 服务目前不适用于此网站。',
            Malay: 'Perkhidmatan AI dikongsi tidak tersedia untuk laman ini buat masa ini.',
            Japanese: '現在、このサイトでは共有 AI サービスを利用できません。',
        },
        suggestion: {
            English: 'Try again later, or add your own API key in Settings.',
            Mandarin: '请稍后再试，或在 Settings 中填入你自己的 API key。',
            Malay: 'Cuba lagi kemudian, atau tambah kunci API anda sendiri dalam Settings.',
            Japanese: '後でもう一度お試しいただくか、Settings で自分の API キーを設定してください。',
        },
    },
    upstream: {
        message: {
            English: 'The AI provider behind the shared service had a problem.',
            Mandarin: '共享服务背后的 AI 提供方出现了问题。',
            Malay: 'Penyedia AI di sebalik perkhidmatan dikongsi menghadapi masalah.',
            Japanese: '共有サービスの背後にある AI プロバイダーで問題が発生しました。',
        },
        suggestion: {
            English: 'Retry in a moment. Your imported data is still available.',
            Mandarin: '请稍后重试。已导入的数据仍可使用。',
            Malay: 'Cuba semula sebentar lagi. Data yang diimport masih tersedia.',
            Japanese: 'しばらくしてから再試行してください。取り込んだデータは保持されています。',
        },
    },
    rejected: {
        message: {
            English: 'The shared AI service rejected this request.',
            Mandarin: '共享 AI 服务拒绝了这次请求。',
            Malay: 'Perkhidmatan AI dikongsi menolak permintaan ini.',
            Japanese: '共有 AI サービスがこのリクエストを拒否しました。',
        },
        suggestion: {
            English: 'Retry once. If it repeats, report the code below or use your own API key in Settings.',
            Mandarin: '请重试一次。如果反复出现，请把下方代码反馈给我们，或在 Settings 中使用你自己的 API key。',
            Malay: 'Cuba sekali lagi. Jika berulang, laporkan kod di bawah atau gunakan kunci API anda sendiri dalam Settings.',
            Japanese: '一度再試行してください。繰り返す場合は下のコードを報告するか、Settings で自分の API キーを使用してください。',
        },
    },
    stale_build: {
        message: {
            English: 'The AI service rejected this app version’s access key.',
            Mandarin: '本应用版本使用的访问密钥已被 AI 服务拒绝。',
            Malay: 'Perkhidmatan AI menolak kunci akses versi aplikasi ini.',
            Japanese: 'AI サービスがこのアプリのバージョンのアクセスキーを拒否しました。',
        },
        suggestion: {
            English: 'Reload the page (or use the version button in the header) to get the latest version.',
            Mandarin: '请刷新页面（或点击页眉的版本按钮）以获取最新版本。',
            Malay: 'Muat semula halaman (atau gunakan butang versi di pengepala) untuk mendapatkan versi terkini.',
            Japanese: 'ページを再読み込みする（またはヘッダーのバージョンボタンを使う）と最新版になります。',
        },
    },
};

const pick = (map: LangMap, language: string): string => map[language] ?? map.English;

const REJECTED_CODES = new Set([
    'DEMO_FIELD_DISABLED', 'DEMO_INPUT_INVALID', 'DEMO_INPUT_TOO_LARGE', 'DEMO_TOOLS_INVALID',
    'DEMO_SCHEMA_UNSUPPORTED', 'DEMO_FORMAT_DISABLED', 'DEMO_MODEL_NOT_ALLOWED',
]);

const extractStatus = (raw: string): number | undefined => {
    const match = /\((\d{3})\)/.exec(raw) ?? /\bstatus(?: code)?[:= ]+(\d{3})\b/i.exec(raw);
    return match ? Number(match[1]) : undefined;
};

/** Classifies a raw provider error, or returns null when it is not a gateway failure. */
export const classifyGatewayError = (raw: string): GatewayErrorInfo | null => {
    const code = /\b(DEMO_[A-Z_]+)\b/.exec(raw)?.[1];
    const text = raw.toLowerCase();
    const status = extractStatus(raw);

    if (code === 'DEMO_SESSION_CONCURRENCY_LIMIT') return { kind: 'concurrency', code };
    if (code === 'DEMO_SESSION_REQUEST_LIMIT' || code === 'DEMO_SESSION_EXPIRED'
        || text.includes('demo session token required') || text.includes('demo session request limit')) {
        return { kind: 'session', code };
    }
    if (text.includes('demo ip rate limit')) return { kind: 'ip_rate_limit', code };
    if (text.includes('daily budget exhausted') || text.includes('daily token limit') || code === 'DEMO_ALL_ROUTES_EXHAUSTED') {
        return { kind: 'quota', code };
    }
    if (code === 'DEMO_PROJECT_NOT_CONFIGURED' || code === 'DEMO_ORIGIN_NOT_REGISTERED' || code === 'DEMO_ROUTER_DISABLED'
        || text.includes('public demo is disabled') || text.includes('demo origin is not registered')) {
        return { kind: 'unavailable', code };
    }
    if (code?.startsWith('DEMO_UPSTREAM')) return { kind: 'upstream', code };
    if (code && REJECTED_CODES.has(code)) return { kind: 'rejected', code };
    if (code) return { kind: status !== undefined && status >= 500 ? 'upstream' : 'rejected', code };
    // The retired private /v1 key answers this exact text; only an old cached build can still hit it.
    if (status === 401 && text.includes('invalid api key')) return { kind: 'stale_build' };
    return null;
};

export interface FriendlyGatewayError {
    message: string;
    suggestion: string;
    code?: string;
    /** Single string for surfaces that render one text line. */
    fullText: string;
}

export const describeGatewayError = (raw: string, language: string): FriendlyGatewayError | null => {
    const info = classifyGatewayError(raw);
    if (!info) return null;
    const copy = COPY[info.kind];
    const message = pick(copy.message, language);
    const suggestion = pick(copy.suggestion, language);
    return {
        message,
        suggestion,
        code: info.code,
        fullText: `${message} ${suggestion}${info.code ? ` (${info.code})` : ''}`,
    };
};

/** Friendly text for recognised gateway errors, otherwise the caller's original text. */
export const presentGatewayError = (raw: string, language: string): string =>
    describeGatewayError(raw, language)?.fullText ?? raw;
