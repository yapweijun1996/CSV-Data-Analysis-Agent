import * as Papa from 'papaparse';
import type {
    CsvIntakeConfidence,
    CsvIntakeDetectionResult,
    CsvIntakeWarning,
    CsvIntakeWarningCode,
} from '../../types';

type RawCsvRow = string[];

type DialectCandidate = {
    delimiter: string;
    quoteChar: string;
};

type CandidateScore = DialectCandidate & {
    score: number;
    errorCount: number;
    rowCount: number;
    nonEmptyRowCount: number;
    dominantWidth: number;
    dominantWidthCount: number;
    delimiterHits: number;
    unbalancedQuote: boolean;
    widthConsistency: number;
    usableCoverage: number;
    headerPlausibility: number;
    quotedStability: number;
};

type CsvDetectionParseResult = {
    rawRows: RawCsvRow[];
    detection: CsvIntakeDetectionResult;
};

const SAMPLE_BYTE_LIMIT = 128 * 1024;
const SAMPLE_NON_EMPTY_LINE_LIMIT = 200;
const DELIMITER_CANDIDATES = [',', ';', '\t', '|', ':'] as const;
const QUOTE_CHAR_CANDIDATES = ['"', '\'', ''] as const;
const MIN_SCORED_CANDIDATE_SCORE = 0.42;
const WORD_CHAR_PATTERN = /[A-Za-z0-9]/;

const coerceRowToArray = (row: unknown): string[] => {
    if (Array.isArray(row)) {
        return row.map(value => (value === undefined || value === null ? '' : String(value)));
    }
    if (row && typeof row === 'object') {
        return Object.values(row).map(value => (value === undefined || value === null ? '' : String(value)));
    }
    return [];
};

const parseCsvText = (
    text: string,
    config: {
        delimiter?: string;
        quoteChar?: string;
    } = {},
): Papa.ParseResult<unknown> => Papa.parse<unknown>(text, {
    header: false,
    skipEmptyLines: false,
    delimiter: config.delimiter,
    quoteChar: config.quoteChar,
});

const isRowNonEmpty = (row: RawCsvRow) => row.some(cell => String(cell ?? '').trim().length > 0);

const countNonEmptyLines = (text: string) =>
    text.split(/\r\n|\n|\r/).filter(line => line.trim().length > 0).length;

const buildDetectionSample = (text: string) => {
    const truncated = text.slice(0, SAMPLE_BYTE_LIMIT);
    const lines = truncated.split(/\r\n|\n|\r/);
    const collected: string[] = [];
    let nonEmptyLines = 0;

    for (const line of lines) {
        collected.push(line);
        if (line.trim().length > 0) {
            nonEmptyLines += 1;
        }
        if (nonEmptyLines >= SAMPLE_NON_EMPTY_LINE_LIMIT) {
            break;
        }
    }

    return collected.join('\n');
};

const pushWarning = (
    warnings: CsvIntakeWarning[],
    code: CsvIntakeWarningCode,
    message: string,
) => {
    if (!warnings.some(existing => existing.code === code && existing.message === message)) {
        warnings.push({ code, message });
    }
};

const mergeWarnings = (...warningGroups: Array<CsvIntakeWarning[] | undefined>): CsvIntakeWarning[] => {
    const warnings: CsvIntakeWarning[] = [];
    warningGroups.forEach(group => {
        (group ?? []).forEach(warning => pushWarning(warnings, warning.code, warning.message));
    });
    return warnings;
};

const isApostropheWithinWord = (text: string, index: number) => {
    const previous = text[index - 1] ?? '';
    const next = text[index + 1] ?? '';
    return WORD_CHAR_PATTERN.test(previous) && WORD_CHAR_PATTERN.test(next);
};

const isStructuralQuoteChar = (text: string, index: number, quoteChar: string) => {
    if (quoteChar !== '\'') return true;
    // Apostrophe within a word (e.g., "don't") — not structural
    if (isApostropheWithinWord(text, index)) return false;
    // Apostrophe followed by a dash/hyphen is a zero-value placeholder (e.g., '-) — not structural
    const next = text[index + 1] ?? '';
    if (next === '-' || next === '\u2013' || next === '\u2014') return false;
    return true;
};

const countDelimiterHits = (text: string, delimiter: string, quoteChar: string) => {
    if (!delimiter) return 0;

    let count = 0;
    let inQuote = false;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (quoteChar && char === quoteChar) {
            if (!isStructuralQuoteChar(text, index, quoteChar)) {
                continue;
            }
            if (inQuote && text[index + 1] === quoteChar) {
                index += 1;
                continue;
            }
            inQuote = !inQuote;
            continue;
        }
        if (!inQuote && char === delimiter) {
            count += 1;
        }
    }
    return count;
};

const hasUnbalancedQuote = (text: string, quoteChar: string) => {
    if (!quoteChar) return false;

    let inQuote = false;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (inQuote && (char === '\n' || char === '\r')) {
            return true;
        }
        if (char !== quoteChar) {
            continue;
        }
        if (!isStructuralQuoteChar(text, index, quoteChar)) {
            continue;
        }
        if (inQuote && text[index + 1] === quoteChar) {
            index += 1;
            continue;
        }
        inQuote = !inQuote;
    }
    return inQuote;
};

const toWidthSummary = (rows: RawCsvRow[]) => {
    const widthCounts = new Map<number, number>();
    rows.forEach(row => {
        widthCounts.set(row.length, (widthCounts.get(row.length) ?? 0) + 1);
    });

    let dominantWidth = 0;
    let dominantWidthCount = 0;
    widthCounts.forEach((count, width) => {
        if (count > dominantWidthCount) {
            dominantWidth = width;
            dominantWidthCount = count;
        }
    });

    return { dominantWidth, dominantWidthCount };
};

const NUMERIC_LIKE_PATTERN = /^[\s$€£¥+-]?\d[\d,\s]*(?:\.\d+)?%?$/;

const isNumericLike = (value: string) => {
    const normalized = value.trim();
    return normalized.length > 0 && NUMERIC_LIKE_PATTERN.test(normalized);
};

const buildHeaderPlausibility = (rows: RawCsvRow[]) => {
    const nonEmptyRows = rows.filter(isRowNonEmpty);
    if (nonEmptyRows.length === 0) return 0;
    if (nonEmptyRows.length === 1) return nonEmptyRows[0].length > 1 ? 0.55 : 0.35;

    const header = nonEmptyRows[0].map(cell => String(cell ?? '').trim()).filter(Boolean);
    const next = nonEmptyRows[1].map(cell => String(cell ?? '').trim()).filter(Boolean);
    if (header.length === 0) return 0.1;

    const headerNumericRatio = header.filter(isNumericLike).length / header.length;
    const nextNumericRatio = next.length > 0 ? next.filter(isNumericLike).length / next.length : 0;
    let score = 0.25;

    if (header.length > 1) score += 0.15;
    if (headerNumericRatio <= 0.35) score += 0.25;
    if (nextNumericRatio >= headerNumericRatio) score += 0.2;
    if (header.length === next.length) score += 0.15;

    return Math.min(1, score);
};

const scoreCandidate = (sample: string, candidate: DialectCandidate): CandidateScore => {
    const parsed = parseCsvText(sample, {
        delimiter: candidate.delimiter,
        quoteChar: candidate.quoteChar,
    });
    const rows = parsed.data.map(coerceRowToArray);
    const nonEmptyRows = rows.filter(isRowNonEmpty);
    const { dominantWidth, dominantWidthCount } = toWidthSummary(nonEmptyRows);
    const sampleNonEmptyLineCount = Math.max(countNonEmptyLines(sample), 1);
    const widthConsistency = nonEmptyRows.length > 0 ? dominantWidthCount / nonEmptyRows.length : 0;
    const usableCoverage = Math.min(1, nonEmptyRows.length / sampleNonEmptyLineCount);
    const headerPlausibility = buildHeaderPlausibility(nonEmptyRows);
    const unbalancedQuote = hasUnbalancedQuote(sample, candidate.quoteChar);
    const delimiterHits = countDelimiterHits(sample, candidate.delimiter, candidate.quoteChar);
    const quotedStability = candidate.quoteChar
        ? sample.includes(candidate.quoteChar)
            ? (unbalancedQuote ? 0.15 : 1)
            : 0.8
        : 1;
    const delimiterStrength = delimiterHits === 0
        ? (dominantWidth > 1 ? 0.2 : 0.35)
        : Math.min(1, delimiterHits / sampleNonEmptyLineCount);
    const errorPenalty = Math.min(parsed.errors.length * 0.15, 0.45);
    const unbalancedPenalty = unbalancedQuote ? 0.25 : 0;

    let score = (
        widthConsistency * 0.42
        + usableCoverage * 0.18
        + quotedStability * 0.14
        + headerPlausibility * 0.12
        + delimiterStrength * 0.14
    ) - errorPenalty - unbalancedPenalty;

    // Hard floor: a single-column parse is almost never the correct CSV
    // interpretation. Cap the score so multi-column candidates win, or the
    // system falls through to PapaParse auto-detection.
    if (dominantWidth <= 1) {
        score = Math.min(score, delimiterHits === 0 ? 0.18 : 0.25);
    }

    return {
        ...candidate,
        score: Number(score.toFixed(4)),
        errorCount: parsed.errors.length,
        rowCount: rows.length,
        nonEmptyRowCount: nonEmptyRows.length,
        dominantWidth,
        dominantWidthCount,
        delimiterHits,
        unbalancedQuote,
        widthConsistency,
        usableCoverage,
        headerPlausibility,
        quotedStability,
    };
};

const buildConfidence = (best: CandidateScore, runnerUp: CandidateScore | null): CsvIntakeConfidence => {
    const gap = best.score - (runnerUp?.score ?? 0);
    if (best.score >= 0.78 && gap >= 0.12 && !best.unbalancedQuote && best.errorCount === 0) {
        return 'high';
    }
    if (best.score >= 0.52 && gap >= 0.05 && !best.unbalancedQuote) {
        return 'medium';
    }
    return 'low';
};

const buildBaseWarnings = (
    sample: string,
    best: CandidateScore,
    runnerUp: CandidateScore | null,
    confidence: CsvIntakeConfidence,
): CsvIntakeWarning[] => {
    const warnings: CsvIntakeWarning[] = [];
    const malformedQuotedSample = ['"', '\''].some(quoteChar => hasUnbalancedQuote(sample, quoteChar));
    if (best.errorCount > 0) {
        pushWarning(warnings, 'parse_errors', `Parser reported ${best.errorCount} issue${best.errorCount === 1 ? '' : 's'} while evaluating the selected CSV dialect.`);
    }
    if (best.unbalancedQuote || malformedQuotedSample) {
        pushWarning(warnings, 'malformed_quote', 'Quoted fields appear malformed or unbalanced, so CSV parsing may require fallback behavior.');
    }
    const delimiterHits = DELIMITER_CANDIDATES
        .map(delimiter => ({ delimiter, hits: countDelimiterHits(sample, delimiter, best.quoteChar) }))
        .sort((left, right) => right.hits - left.hits);
    const strongestAlternate = delimiterHits.find(entry => entry.delimiter !== best.delimiter && entry.hits > 0) ?? null;
    if (confidence !== 'high') {
        pushWarning(warnings, 'low_confidence', 'CSV dialect detection confidence is limited, so the imported structure should be reviewed in diagnostics.');
    }
    if (
        strongestAlternate
        && strongestAlternate.hits >= Math.max(1, best.delimiterHits * 0.35)
    ) {
        pushWarning(warnings, 'mixed_delimiter', `The file looks mixed between "${best.delimiter}" and "${strongestAlternate.delimiter}" delimiters, so the selected parser may be approximate.`);
    } else if (
        runnerUp
        && runnerUp.delimiter !== best.delimiter
        && runnerUp.score >= best.score - 0.08
        && runnerUp.delimiterHits > 0
    ) {
        pushWarning(warnings, 'mixed_delimiter', `The file looks mixed between "${best.delimiter}" and "${runnerUp.delimiter}" delimiters, so the selected parser may be approximate.`);
    }
    return warnings;
};

const scoreCandidates = (sample: string) =>
    DELIMITER_CANDIDATES.flatMap(delimiter => QUOTE_CHAR_CANDIDATES.map(quoteChar => scoreCandidate(sample, { delimiter, quoteChar })))
        .sort((left, right) => right.score - left.score);

const getAlternateDelimiterCandidate = (candidates: CandidateScore[], best: CandidateScore) =>
    candidates.find(candidate => candidate.delimiter !== best.delimiter) ?? null;

const createDetection = (
    strategy: CsvIntakeDetectionResult['strategy'],
    candidate: CandidateScore | null,
    runnerUp: CandidateScore | null,
    confidence: CsvIntakeConfidence,
    warnings: CsvIntakeWarning[],
    sampledNonEmptyLines: number,
    parserErrorCount?: number,
): CsvIntakeDetectionResult => ({
    strategy,
    confidence,
    delimiter: candidate?.delimiter ?? null,
    quoteChar: candidate?.quoteChar || null,
    warnings,
    candidateCount: DELIMITER_CANDIDATES.length * QUOTE_CHAR_CANDIDATES.length,
    parserErrorCount: parserErrorCount ?? candidate?.errorCount ?? 0,
    sampledNonEmptyLines,
    topScore: candidate?.score ?? null,
    runnerUpScore: runnerUp?.score ?? null,
});

const parseCandidateRows = (text: string, candidate: CandidateScore) => {
    const parsed = parseCsvText(text, {
        delimiter: candidate.delimiter,
        quoteChar: candidate.quoteChar,
    });

    return {
        rawRows: parsed.data.map(coerceRowToArray),
        errorCount: parsed.errors.length,
    };
};

const parseAutoFallbackRows = (text: string) => {
    const parsed = parseCsvText(text);
    const autoDelimiter = typeof parsed.meta.delimiter === 'string' && parsed.meta.delimiter.length > 0
        ? parsed.meta.delimiter
        : null;

    return {
        rawRows: parsed.data.map(coerceRowToArray),
        errorCount: parsed.errors.length,
        delimiter: autoDelimiter,
    };
};

const buildRawLineFallbackRows = (text: string, delimiter: string | null): RawCsvRow[] => {
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    return lines
        .filter((line, index) => !(index === lines.length - 1 && line === ''))
        .map(line => (delimiter && line.includes(delimiter) ? line.split(delimiter) : [line]));
};

const buildFallbackCandidate = (delimiter: string | null, quoteChar: string | null): CandidateScore | null => {
    if (!delimiter) {
        return null;
    }
    return {
        delimiter,
        quoteChar: quoteChar ?? '',
        score: 0,
        errorCount: 0,
        rowCount: 0,
        nonEmptyRowCount: 0,
        dominantWidth: 0,
        dominantWidthCount: 0,
        delimiterHits: 0,
        unbalancedQuote: false,
        widthConsistency: 0,
        usableCoverage: 0,
        headerPlausibility: 0,
        quotedStability: 0,
    };
};

export const detectCsvDialect = (sample: string): CsvIntakeDetectionResult => {
    const sampleText = buildDetectionSample(sample);
    const sampledNonEmptyLines = countNonEmptyLines(sampleText);
    const candidates = scoreCandidates(sampleText);
    const best = candidates[0];
    const runnerUp = getAlternateDelimiterCandidate(candidates, best);
    const confidence = buildConfidence(best, runnerUp);
    const warnings = buildBaseWarnings(sampleText, best, runnerUp, confidence);
    const adjustedConfidence: CsvIntakeConfidence = warnings.some(warning => warning.code === 'malformed_quote')
        ? 'low'
        : confidence;
    if (adjustedConfidence !== 'high') {
        pushWarning(warnings, 'low_confidence', 'CSV dialect detection confidence is limited, so the imported structure should be reviewed in diagnostics.');
    }
    return createDetection('scored_candidate', best, runnerUp, adjustedConfidence, warnings, sampledNonEmptyLines);
};

export const parseCsvTextWithDetection = (text: string): CsvDetectionParseResult => {
    const sample = buildDetectionSample(text);
    const sampledNonEmptyLines = countNonEmptyLines(sample);
    const scoredCandidates = scoreCandidates(sample);
    const best = scoredCandidates[0];
    const runnerUp = getAlternateDelimiterCandidate(scoredCandidates, best);
    const confidence = buildConfidence(best, runnerUp);
    const scoredWarnings = buildBaseWarnings(sample, best, runnerUp, confidence);
    const effectiveBaseConfidence: CsvIntakeConfidence = scoredWarnings.some(warning => warning.code === 'malformed_quote')
        ? 'low'
        : confidence;

    if (best.score >= MIN_SCORED_CANDIDATE_SCORE) {
        const candidateParse = parseCandidateRows(text, best);
        const candidateWarnings = [...scoredWarnings];
        if (candidateParse.errorCount > 0) {
            pushWarning(candidateWarnings, 'parse_errors', `The selected CSV dialect produced ${candidateParse.errorCount} parser issue${candidateParse.errorCount === 1 ? '' : 's'} during full parsing.`);
        }
        const finalConfidence: CsvIntakeConfidence = candidateParse.errorCount > 0 && effectiveBaseConfidence === 'high'
            ? 'medium'
            : candidateParse.errorCount > 0
                ? 'low'
                : effectiveBaseConfidence;
        if (finalConfidence !== 'high') {
            pushWarning(candidateWarnings, 'low_confidence', 'CSV dialect detection confidence is limited, so the imported structure should be reviewed in diagnostics.');
        }

        if (candidateParse.rawRows.length > 0) {
            return {
                rawRows: candidateParse.rawRows,
                detection: createDetection(
                    'scored_candidate',
                    best,
                    runnerUp ?? null,
                    finalConfidence,
                    candidateWarnings,
                    sampledNonEmptyLines,
                    candidateParse.errorCount,
                ),
            };
        }
    }

    const autoParse = parseAutoFallbackRows(text);
    const autoWarnings = [...scoredWarnings];
    pushWarning(autoWarnings, 'low_confidence', 'CSV parsing fell back to PapaParse auto-detection because scored dialect selection was inconclusive.');
    if (autoParse.errorCount > 0) {
        pushWarning(autoWarnings, 'parse_errors', `PapaParse auto-detection reported ${autoParse.errorCount} parser issue${autoParse.errorCount === 1 ? '' : 's'}.`);
    }

    if (autoParse.rawRows.length > 0) {
        const autoCandidate = buildFallbackCandidate(autoParse.delimiter ?? best.delimiter, null);
        const autoConfidence: CsvIntakeConfidence = autoParse.errorCount === 0 && autoParse.delimiter ? 'medium' : 'low';
        return {
            rawRows: autoParse.rawRows,
            detection: createDetection(
                'papaparse_auto_fallback',
                autoCandidate,
                runnerUp ?? null,
                autoConfidence,
                autoWarnings,
                sampledNonEmptyLines,
                autoParse.errorCount,
            ),
        };
    }

    const fallbackDelimiter = autoParse.delimiter ?? best.delimiter ?? ',';
    const rawLineRows = buildRawLineFallbackRows(text, fallbackDelimiter);
    const rawLineWarnings = mergeWarnings(
        scoredWarnings,
        autoWarnings,
        [{
            code: 'low_confidence',
            message: 'CSV parsing fell back to raw line splitting, so quoted fields may not be preserved exactly.',
        }],
    );
    const rawLineCandidate = buildFallbackCandidate(fallbackDelimiter, null);

    return {
        rawRows: rawLineRows,
        detection: createDetection(
            'raw_line_fallback',
            rawLineCandidate,
            runnerUp ?? null,
            'low',
            rawLineWarnings,
            sampledNonEmptyLines,
            autoParse.errorCount,
        ),
    };
};
