const PROVIDER_ERROR_PATTERN = /\b(?:api key|authentication|unauthorized|forbidden|quota|rate limit|overloaded|provider|model not found|network error|networkerror|failed to fetch|fetch failed|timed out|timeout|connection reset|econnreset)\b/i;

export const isInitialAnalysisProviderFailure = (error: unknown): boolean => {
    const candidate = error && typeof error === 'object' ? error as {
        status?: unknown;
        statusCode?: unknown;
        code?: unknown;
        message?: unknown;
    } : null;
    const status = candidate?.status ?? candidate?.statusCode;
    if (typeof status === 'number' && [400, 401, 403, 404, 408, 429, 500, 502, 503, 504].includes(status)) {
        return true;
    }
    const detail = [candidate?.code, candidate?.message, error instanceof Error ? error.message : error]
        .filter(value => typeof value === 'string')
        .join(' ');
    return /\b(?:400|401|403|404|408|429|500|502|503|504)\b/.test(detail)
        || PROVIDER_ERROR_PATTERN.test(detail);
};
