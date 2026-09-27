import type {
    AiExtractedReportContext,
    CsvData,
    CsvRow,
    ReportContextConfidence,
    ReportContextResolution,
    ReportContextVerification,
    ResolvedReportContext,
} from '../../types';
import { detectReportShape } from './reportShapeDetector';
import { WORKSPACE_REPORT_CONTEXT_JSON } from './workspaceFileUtils';

const normalizeText = (value: unknown) => String(value ?? '').trim();
const normalizeComparableText = (value: unknown) =>
    normalizeText(value)
        .toLowerCase()
        .replace(/[_/|.-]+/g, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();

// Domain patterns demoted to fallback — AI extraction via verifyAiExtractedReportContext()
// is the primary path. These patterns are fallback for createFallbackReportContext().

// Genre vocabulary fallback for isEntityOnlyLine negative filter.
const REPORT_TITLE_PATTERN = /\b(report|statement|summary|listing|detail|details|analysis)\b/i;
// Financial domain fallback — AI extraction is primary for title selection.
const GENERIC_FINANCIAL_TITLE_PATTERN = /\b(income statement|statement of|profit\s*(?:&|and)\s*loss|balance sheet|cash flow|trial balance|project profit)\b/i;
// Domain keyword fallback — structural checks (colon, date, field-type suffix) are primary.
const PARAMETER_KEYWORD_PATTERN = /\b(as of|period|date|reporting|department|filter|scope|currency|division|entity|region|branch)\b/i;
// ERP field label fallback — structural checks handle most cases.
const PARAMETER_FIELD_LABEL_PATTERN = /^(sales person name|supplier name|print date|customer name|vendor name|project name|department name|currency|reporting date)$/i;
// Legal entity suffixes — internationally standardized, retained.
const ENTITY_SUFFIX_PATTERN = /\b(limited|ltd|inc|llc|corp|corporation|company|co|pte|plc|group)\b/i;

// Structural: common field-type suffixes at end of parameter labels.
// Replaces PARAMETER_LABEL_ENDING_PATTERN regex — more precise (last-token only).
const FIELD_TYPE_SUFFIXES = new Set(['name', 'date', 'period', 'code', 'number', 'currency', 'scope', 'filter']);

const hasFieldTypeSuffix = (line: string): boolean => {
    const tokens = line.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const lastToken = tokens[tokens.length - 1];
    return lastToken ? FIELD_TYPE_SUFFIXES.has(lastToken) : false;
};

const rowValues = (row: CsvRow | string[] | null | undefined): string[] => {
    if (!row) return [];
    if (Array.isArray(row)) {
        return row.map(normalizeText).filter(Boolean);
    }
    return Object.values(row).map(normalizeText).filter(Boolean);
};

const rowToText = (row: CsvRow | string[] | null | undefined): string =>
    rowValues(row).join(' | ').trim();

const isUnnamedColumn = (value: string) => /^_unnamed_column_/i.test(value);

const isNumericSchemaToken = (value: string) => /^\d{3,}$/.test(value);

const isCodeStyleSchemaToken = (value: string) =>
    /^[A-Z0-9_]+$/.test(value)
    && value === value.toUpperCase()
    && value.length >= 2;

const normalizeLineList = (lines: Array<string | null | undefined>, limit: number): string[] => {
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const line of lines) {
        const value = normalizeText(line);
        if (!value) continue;
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        normalized.push(value);
        if (normalized.length >= limit) break;
    }
    return normalized;
};

const normalizeOptionalLineList = (value: unknown, limit: number): string[] =>
    normalizeLineList(Array.isArray(value) ? value : [], limit);

const getMetadataLines = (data: CsvData) =>
    normalizeLineList((data.metadataRows ?? []).map(rowToText), 12);

const getSummaryLines = (data: CsvData) =>
    normalizeLineList((data.summaryRows ?? []).map(rowToText), 12);

const getHeaderLayerLines = (data: CsvData) =>
    (data.headerLayers ?? [])
        .map(row => row.map(normalizeText).filter(Boolean))
        .filter(values => values.length > 0);

const getBodyPreviewLines = (data: CsvData, limit = 4) =>
    normalizeLineList(
        data.data
            .slice(0, limit)
            .map(row => rowValues(row))
            .filter(values => values.length > 0 && values.length <= 2)
            .map(values => values.join(' | ')),
        limit,
    );

const getSchemaHeaders = (data: CsvData) =>
    Object.keys(data.data[0] ?? {})
        .map(normalizeText)
        .filter(value => value && !isUnnamedColumn(value));

const mergeLineLists = (primary: string[], secondary: string[], limit: number): string[] => {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const line of [...primary, ...secondary]) {
        const value = normalizeText(line);
        if (!value) continue;
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(value);
        if (merged.length >= limit) break;
    }
    return merged;
};

const extractEmbeddedReportTitle = (line: string): string | null => {
    const normalizedLine = normalizeText(line);
    if (!normalizedLine || !(/[:=]/.test(normalizedLine) || /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(normalizedLine) || /\breporting\b/i.test(normalizedLine))) {
        return null;
    }

    const parameterMatch = normalizedLine.match(PARAMETER_KEYWORD_PATTERN);
    const boundaryIndex = parameterMatch?.index ?? normalizedLine.length;
    const candidate = normalizeText(normalizedLine.slice(0, boundaryIndex));
    return candidate && isUsableReportTitle(candidate) ? candidate : null;
};

const isEntityOnlyLine = (line: string): boolean => {
    const normalizedLine = normalizeText(line);
    if (!normalizedLine || /[:=]/.test(normalizedLine) || /\d/.test(normalizedLine)) {
        return false;
    }

    const normalizedComparable = normalizeComparableText(normalizedLine);
    const tokens = normalizedComparable.split(' ').filter(Boolean);
    if (tokens.length < 2 || tokens.length > 8) {
        return false;
    }
    // Structural: field-type suffix at end of line → parameter label, not entity.
    // Domain fallback: parameter keywords anywhere in line.
    if (hasFieldTypeSuffix(normalizedLine) || PARAMETER_KEYWORD_PATTERN.test(normalizedLine)) {
        return false;
    }
    if (REPORT_TITLE_PATTERN.test(normalizedLine)) {
        return false;
    }

    return ENTITY_SUFFIX_PATTERN.test(normalizedLine)
        || tokens.every(token => token.length > 1 && /^[a-z0-9]+$/i.test(token));
};

const isStructuredParameterLine = (line: string): boolean => {
    const normalizedLine = normalizeText(line);
    if (!normalizedLine || isEntityOnlyLine(normalizedLine)) {
        return false;
    }
    // Structural tier 1: delimiter-based detection (colon or equals).
    if (/[:=]/.test(normalizedLine)) return true;
    // Structural tier 2: embedded date format.
    if (/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(normalizedLine)) return true;
    // Structural tier 3: field-type suffix at end of line.
    if (hasFieldTypeSuffix(normalizedLine)) return true;
    // Domain fallback: parameter keywords or ERP field labels.
    return PARAMETER_KEYWORD_PATTERN.test(normalizedLine)
        || PARAMETER_FIELD_LABEL_PATTERN.test(normalizedLine);
};

const isGenericFinancialReportTitle = (title: string | null | undefined): boolean =>
    GENERIC_FINANCIAL_TITLE_PATTERN.test(normalizeText(title));

const stripEmbeddedTitlePrefix = (
    line: string,
    reportTitle: string | null | undefined,
): string => {
    const normalizedLine = normalizeText(line);
    const embeddedTitle = extractEmbeddedReportTitle(normalizedLine);
    const normalizedReportTitle = normalizeText(reportTitle ?? '');
    if (embeddedTitle && normalizedReportTitle) {
        const embeddedKey = normalizeComparableText(embeddedTitle);
        const reportTitleKey = normalizeComparableText(normalizedReportTitle);
        if (embeddedKey && reportTitleKey && embeddedKey !== reportTitleKey) {
            return normalizedLine;
        }
    }
    const chosenTitle = embeddedTitle ?? normalizedReportTitle;
    if (!chosenTitle) {
        return normalizedLine;
    }

    const titleKey = normalizeComparableText(chosenTitle);
    const lineKey = normalizeComparableText(normalizedLine);
    if (!titleKey || !lineKey.startsWith(titleKey)) {
        return normalizedLine;
    }

    const remainder = normalizedLine.slice(chosenTitle.length).trim();
    return remainder || normalizedLine;
};

const normalizeParameterLineList = (
    lines: Array<string | null | undefined>,
    reportTitle: string | null | undefined,
    limit: number,
): string[] => {
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const line of lines) {
        const value = stripEmbeddedTitlePrefix(normalizeText(line), reportTitle);
        if (!value || !isStructuredParameterLine(value)) {
            continue;
        }
        const key = normalizeComparableText(value);
        if (!key || seen.has(key)) {
            continue;
        }
        seen.add(key);
        normalized.push(value);
        if (normalized.length >= limit) break;
    }
    return normalized;
};

export const isUsableReportTitle = (value: string | null | undefined): boolean => {
    const normalized = normalizeText(value);
    if (!normalized) {
        return false;
    }

    const tokens = normalized.split(/\s+/).filter(Boolean);
    if (tokens.length < 6) {
        return true;
    }

    const numericTokenCount = tokens.filter(isNumericSchemaToken).length;
    const codeStyleTokenCount = tokens.filter(isCodeStyleSchemaToken).length;
    const suspiciousTokenCount = numericTokenCount + codeStyleTokenCount;

    if (normalized.length > 80) {
        return false;
    }

    if (numericTokenCount >= 4) {
        return false;
    }

    return suspiciousTokenCount / tokens.length < 0.6;
};

const isLikelyParameterLine = (line: string): boolean => isStructuredParameterLine(line);

const resolveConfidence = (value: unknown): ReportContextConfidence => {
    if (value === 'high' || value === 'medium' || value === 'low') {
        return value;
    }
    return 'low';
};

const inferFallbackReportTitle = (data: CsvData): string | null => {
    const metadataLines = getMetadataLines(data);
    const leadingEntityLine = metadataLines.find(isEntityOnlyLine) ?? null;
    const embeddedTitle = metadataLines
        .map(extractEmbeddedReportTitle)
        .find((value): value is string => Boolean(value));
    if (embeddedTitle) {
        if (leadingEntityLine && isGenericFinancialReportTitle(embeddedTitle)) {
            return leadingEntityLine;
        }
        return embeddedTitle;
    }
    const titleFromMetadata = metadataLines.find(line => !isLikelyParameterLine(line) && line.length >= 6)
        ?? metadataLines.find(line => line.length >= 6);
    if (titleFromMetadata) {
        return titleFromMetadata;
    }

    const headers = getSchemaHeaders(data);
    if (headers.length > 0) {
        const schemaTitle = headers.join(' ').trim();
        if (isUsableReportTitle(schemaTitle)) {
            return schemaTitle || null;
        }
    }

    const bodyPreviewLines = getBodyPreviewLines(data);
    return bodyPreviewLines.find(line => !isLikelyParameterLine(line) && line.length >= 6)
        ?? bodyPreviewLines.find(line => line.length >= 6)
        ?? null;
};

const inferFallbackParameterLines = (data: CsvData, reportTitle: string | null): string[] =>
    normalizeParameterLineList(
        getMetadataLines(data).filter(line => {
            if (line === reportTitle) {
                return false;
            }

            if (!isLikelyParameterLine(line)) {
                return false;
            }

            const normalizedLine = normalizeComparableText(line);
            const schemaHeaderLine = normalizeComparableText(getSchemaHeaders(data).join(' '));
            if (schemaHeaderLine && normalizedLine === schemaHeaderLine) {
                return false;
            }

            return true;
        }),
        reportTitle,
        5,
    );

const inferFallbackFooterLines = (data: CsvData): string[] =>
    normalizeLineList(getSummaryLines(data), 5);

const inferShapeAlignedHeaderLine = (data: CsvData): string[] | null => {
    const profile = detectReportShape(data);
    const primaryCandidate = profile.candidates[0];
    if (!primaryCandidate) {
        return null;
    }

    const line = normalizeLineList([
        ...primaryCandidate.descriptorColumns,
        ...primaryCandidate.detailSeriesColumns,
        ...primaryCandidate.summarySeriesColumns,
    ], 20);

    return line.length >= 4 ? line : null;
};

const inferCandidateHeaderLine = (data: CsvData): { line: string[] | null; source: 'shape' | 'schema' | 'header_layer' | 'body_preview' | 'none' } => {
    const shapeAlignedHeader = inferShapeAlignedHeaderLine(data);
    if (shapeAlignedHeader) {
        return { line: shapeAlignedHeader, source: 'shape' };
    }

    const schemaHeaders = getSchemaHeaders(data);
    if (schemaHeaders.length >= 4) {
        return { line: schemaHeaders.slice(0, 20), source: 'schema' };
    }

    const explicitHeaderLayer = getHeaderLayerLines(data)[data.headerLayers?.length ? data.headerLayers.length - 1 : 0];
    if (explicitHeaderLayer && explicitHeaderLayer.length >= 4) {
        return { line: explicitHeaderLayer.slice(0, 20), source: 'header_layer' };
    }

    const candidates = data.data.slice(0, 8);
    for (const row of candidates) {
        const values = rowValues(row);
        if (values.length >= 4) {
            return { line: values.slice(0, 20), source: 'body_preview' };
        }
    }
    return { line: null, source: 'none' };
};

export const createFallbackReportContext = (data: CsvData): ResolvedReportContext => {
    const reportTitle = inferFallbackReportTitle(data);
    const parameterLines = inferFallbackParameterLines(data, reportTitle);
    const footerLines = inferFallbackFooterLines(data);
    const candidateHeaderHint = inferCandidateHeaderLine(data);
    const candidateHeaderLine = candidateHeaderHint.line;
    const notes: string[] = [];

    if (parameterLines.length > 0) {
        notes.push('Parameter lines were preserved outside cleaned.csv for downstream AI context.');
    }
    if (footerLines.length > 0) {
        notes.push('Footer or remark lines were preserved outside cleaned.csv for auditability.');
    }
    if (candidateHeaderLine) {
        notes.push(
            candidateHeaderHint.source === 'shape'
                ? 'Candidate tabular header was aligned to the detected report-shape schema.'
                : candidateHeaderHint.source === 'schema'
                    ? 'Candidate tabular header was recovered from the prepared schema headers.'
                    : data.headerLayers?.length
                        ? 'Header layers were preserved outside cleaned.csv and used to recover report semantics.'
                        : 'Candidate tabular header captured heuristically from early rows.',
        );
    }

    return {
        sourceFile: data.fileName ?? null,
        reportTitle,
        reportDescription: null,
        parameterLines,
        footerLines,
        candidateHeaderLine,
        notes,
        source: 'fallback',
        confidence: null,
    };
};

export const normalizeResolvedReportContext = (
    context: Partial<ResolvedReportContext> | null | undefined,
): ResolvedReportContext | null => {
    if (!context || typeof context !== 'object') {
        return null;
    }

    const reportTitle = normalizeText(context.reportTitle ?? '') || null;
    const reportDescription = normalizeText(context.reportDescription ?? '') || null;
    const sourceFile = normalizeText(context.sourceFile ?? '') || null;
    const candidateHeaderLine = normalizeOptionalLineList(context.candidateHeaderLine, 20);
    const notes = normalizeOptionalLineList(context.notes, 12);

    return {
        sourceFile,
        reportTitle,
        reportDescription,
        parameterLines: normalizeParameterLineList(
            Array.isArray(context.parameterLines) ? context.parameterLines : [],
            reportTitle,
            5,
        ),
        footerLines: normalizeOptionalLineList(context.footerLines, 5),
        candidateHeaderLine: candidateHeaderLine.length > 0 ? candidateHeaderLine : null,
        notes,
        source: context.source === 'ai' ? 'ai' : 'fallback',
        confidence: context.confidence === 'high' || context.confidence === 'medium' || context.confidence === 'low'
            ? context.confidence
            : null,
    };
};

export const sanitizeAiExtractedReportContext = (
    candidate: Partial<AiExtractedReportContext> | null | undefined,
): AiExtractedReportContext | null => {
    if (!candidate || typeof candidate !== 'object') {
        return null;
    }

    const reportTitle = normalizeText(candidate.reportTitle ?? '');
    const candidateHeaderLine = Array.isArray(candidate.candidateHeaderLine)
        ? normalizeLineList(candidate.candidateHeaderLine.map(value => normalizeText(value)), 20)
        : [];

    return {
        reportTitle: reportTitle || null,
        reportDescription: normalizeText(candidate.reportDescription ?? ''),
        parameterLines: normalizeParameterLineList(
            Array.isArray(candidate.parameterLines) ? candidate.parameterLines : [],
            reportTitle || null,
            5,
        ),
        footerLines: normalizeLineList(Array.isArray(candidate.footerLines) ? candidate.footerLines : [], 5),
        candidateHeaderLine: candidateHeaderLine.length > 0 ? candidateHeaderLine : null,
        confidence: resolveConfidence(candidate.confidence),
        reasoning: normalizeText(candidate.reasoning ?? ''),
    };
};

export const mergeAiExtractedReportContextWithFallback = (
    aiExtracted: AiExtractedReportContext,
    fallback: ResolvedReportContext,
): AiExtractedReportContext => ({
    ...aiExtracted,
    parameterLines: normalizeParameterLineList(
        [...fallback.parameterLines, ...aiExtracted.parameterLines],
        aiExtracted.reportTitle ?? fallback.reportTitle,
        5,
    ),
});

const buildTitlePool = (data: CsvData, fallback: ResolvedReportContext) => {
    return [
        ...getMetadataLines(data),
        ...getBodyPreviewLines(data),
        ...getHeaderLayerLines(data).map(line => line.join(' | ')),
        ...(fallback.reportTitle ? [fallback.reportTitle] : []),
    ];
};

const buildHeaderCandidatePool = (data: CsvData, fallback: ResolvedReportContext) => {
    const pool = new Set<string>();
    getHeaderLayerLines(data).flat().forEach(value => pool.add(value.toLowerCase()));
    getSchemaHeaders(data).forEach(value => pool.add(value.toLowerCase()));
    fallback.candidateHeaderLine?.forEach(value => pool.add(value.toLowerCase()));
    return pool;
};

export const verifyAiExtractedReportContext = (
    aiExtracted: AiExtractedReportContext | null,
    rawData: CsvData,
): {
    effective: ResolvedReportContext;
    verification: ReportContextVerification;
    fallback: ResolvedReportContext;
} => {
    const fallback = createFallbackReportContext(rawData);
    const sanitizedAiExtracted = sanitizeAiExtractedReportContext(aiExtracted);

    if (!sanitizedAiExtracted) {
        return {
            effective: fallback,
            fallback,
            verification: {
                passed: false,
                usedFallback: true,
                reason: 'ai_extraction_unavailable',
                aiConfidence: null,
                issues: ['AI report-context extraction did not return a usable result.'],
            },
        };
    }

    const issues: string[] = [];
    const metadataLines = getMetadataLines(rawData);
    const summaryLines = getSummaryLines(rawData);
    const titlePool = buildTitlePool(rawData, fallback);
    const headerCandidatePool = buildHeaderCandidatePool(rawData, fallback);

    const titleSharesKeyTokens = (title: string, candidates: string[]): boolean => {
        const titleTokens = normalizeComparableText(title).split(/\s+/).filter(t => t.length > 2);
        if (titleTokens.length === 0) return false;
        const poolTokens = new Set<string>();
        for (const c of candidates) {
            for (const t of normalizeComparableText(c).split(/\s+/)) {
                if (t.length > 2) poolTokens.add(t);
            }
        }
        let hits = 0;
        for (const t of titleTokens) { if (poolTokens.has(t)) hits++; }
        return hits / titleTokens.length >= 0.4;
    };

    const lineMatchesCandidate = (line: string, candidates: string[]) => {
        const normalizedLine = normalizeComparableText(line);
        if (!normalizedLine) {
            return false;
        }
        return candidates.some(candidate => {
            const normalizedCandidate = normalizeComparableText(candidate);
            return normalizedCandidate === normalizedLine
                || normalizedCandidate.includes(normalizedLine)
                || normalizedLine.includes(normalizedCandidate);
        });
    };

    if (sanitizedAiExtracted.reportTitle && !titleSharesKeyTokens(sanitizedAiExtracted.reportTitle, titlePool)) {
        issues.push('AI report title tokens did not sufficiently overlap with CSV evidence.');
    }

    sanitizedAiExtracted.parameterLines.forEach(line => {
        if (!isStructuredParameterLine(line)) {
            issues.push(`AI parameter line "${line}" did not look like a report parameter line.`);
            return;
        }
        if (!lineMatchesCandidate(line, metadataLines)) {
            issues.push(`AI parameter line "${line}" did not match preserved metadata rows.`);
        }
    });

    sanitizedAiExtracted.footerLines.forEach(line => {
        if (!lineMatchesCandidate(line, summaryLines)) {
            issues.push(`AI footer line "${line}" did not match preserved summary rows.`);
        }
    });

    sanitizedAiExtracted.candidateHeaderLine?.forEach(value => {
        if (!headerCandidatePool.has(value.toLowerCase())) {
            issues.push(`AI header candidate "${value}" did not match known header evidence.`);
        }
    });

    const usedFallback = sanitizedAiExtracted.confidence === 'low' || issues.length > 0;
    const verification: ReportContextVerification = {
        passed: !usedFallback,
        usedFallback,
        reason: sanitizedAiExtracted.confidence === 'low'
            ? 'low_confidence'
            : issues[0] ?? null,
        aiConfidence: sanitizedAiExtracted.confidence,
        issues,
    };

    if (usedFallback) {
        return {
            effective: {
                ...fallback,
                notes: [
                    ...fallback.notes,
                    sanitizedAiExtracted.confidence === 'low'
                        ? 'AI extracted a low-confidence report header guess; validated fallback is used downstream.'
                        : 'AI extracted report context failed validation; validated fallback is used downstream.',
                ],
                confidence: sanitizedAiExtracted.confidence,
            },
            fallback,
            verification,
        };
    }

    return {
        effective: {
            sourceFile: rawData.fileName ?? null,
            reportTitle: sanitizedAiExtracted.reportTitle,
            reportDescription: sanitizedAiExtracted.reportDescription || null,
            parameterLines: sanitizedAiExtracted.parameterLines,
            footerLines: sanitizedAiExtracted.footerLines,
            candidateHeaderLine: sanitizedAiExtracted.candidateHeaderLine,
            notes: [
                'Report header and parameters were extracted by AI and passed deterministic validation.',
                sanitizedAiExtracted.reasoning ? `AI reasoning: ${sanitizedAiExtracted.reasoning}` : '',
            ].filter(Boolean),
            source: 'ai',
            confidence: sanitizedAiExtracted.confidence,
        },
        fallback,
        verification,
    };
};

export const buildReportContextResolution = (
    rawData: CsvData,
    aiExtracted: AiExtractedReportContext | null,
): ReportContextResolution => {
    const verified = verifyAiExtractedReportContext(aiExtracted, rawData);
    return {
        aiExtracted,
        fallback: verified.fallback,
        effective: verified.effective,
        verification: verified.verification,
        generatedAt: new Date().toISOString(),
    };
};

export const resolveReportContextData = (
    rawData: CsvData | null | undefined,
    cleanedData?: CsvData | null,
): CsvData | null => {
    if (rawData) return rawData;
    return cleanedData ?? null;
};

export const resolveEffectiveReportContext = (
    resolution: ReportContextResolution | null | undefined,
    rawData: CsvData | null | undefined,
    cleanedData?: CsvData | null,
): ResolvedReportContext | null => {
    if (resolution?.effective) {
        return normalizeResolvedReportContext(resolution.effective);
    }

    const data = resolveReportContextData(rawData, cleanedData);
    return data ? createFallbackReportContext(data) : null;
};

export const formatReportContextForPrompt = (
    context: ResolvedReportContext | ReportContextResolution | null | undefined,
): string => {
    const resolved: ResolvedReportContext | null = !context
        ? null
        : 'effective' in context
            ? normalizeResolvedReportContext(context.effective)
            : 'reportTitle' in context
                ? normalizeResolvedReportContext(context)
                : null;

    if (!resolved) {
        return 'No report title or parameter context was detected.';
    }

    return [
        `Report title: ${resolved.reportTitle || 'Unknown report'}`,
        resolved.reportDescription ? `Description: ${resolved.reportDescription}` : '',
        `Parameters:\n${resolved.parameterLines.length > 0 ? resolved.parameterLines.join('\n') : 'No parameter lines detected.'}`,
        `Footer / notes:\n${resolved.footerLines.length > 0 ? resolved.footerLines.join('\n') : 'No footer lines detected.'}`,
        `Header hint: ${resolved.candidateHeaderLine?.join(' | ') || 'No candidate header line detected.'}`,
    ].filter(Boolean).join('\n');
};

export const buildReportContextWorkspaceFiles = (resolution: ReportContextResolution): Record<string, string> => ({
    [WORKSPACE_REPORT_CONTEXT_JSON]: JSON.stringify(resolution, null, 2),
});
