/**
 * utils/localization.ts
 *
 * Central translation dictionary for all end-user-facing UI strings.
 *
 * ## When to use this file
 * - Any UI text string that needs multi-language support: labels, headers,
 *   button text, status messages, toasts with known content, progress text.
 * - Parameterized messages where you know the exact text to show
 *   (e.g. "Analysis complete — {count} cards generated").
 *
 * ## When NOT to use this file
 * - Catch blocks where you need a structured error response (message +
 *   suggestion + technicalDetail). Use `utils/userErrorMessage.ts` instead:
 *     ```ts
 *     const err = formatUserError(error, { surface: 'analysis', language });
 *     setState({ summary: { language, text: err.fullText } });
 *     ```
 * - `userErrorMessage.ts` is self-contained and does NOT import from here,
 *   so there is no circular dependency risk.
 *
 * ## Rule of thumb
 * | Situation | Use |
 * |-----------|-----|
 * | Known UI state (success, file too large, cleaning done) | localization.ts |
 * | Catch block — generic fallback for unknown failures | userErrorMessage.ts |
 */
import { Settings } from '../types';
import { translations, type Language, type TranslationEntry } from './localizationDictionary';
import { vietnameseTranslations } from './localizationVietnamese';


/**
 * English wording for {count} === 1. Only English inflects for number, so the other languages keep
 * their single wording. The plural wording stays in `translations`.
 */
const ENGLISH_SINGULAR_WORDING: Readonly<Record<string, string>> = {
    reliability_note_body: '- {count} fallback card was excluded from this narrative because its original topic plan failed.',
    summary_reliability_note_body: '{count} fallback card was excluded from this narrative because its original topic plan failed.',
    evidence_summary_note: 'The AI summary could not be generated, so these points are read directly from {count} evidence card.',
    cloud_ai_sensitive_detected_detail: 'The local scan found high-confidence signals in {count} field. Confirm this dataset separately before any sample is sent to the provider.',
    analysis_trace_propose_hypotheses_output_success: 'Proposed {count} hypothesis candidate.',
    ai_task_analysis_ready_trace: '; {count} analysis step recorded',
    ai_task_analysis_ready_rejections: '; {count} low-value or duplicate output was rejected',
    data_warnings_intake_reported: 'CSV structure check found {count} issue during import.',
    data_warnings_compact_summary: '{count} data quality note · The AI accounts for it and your file is not changed.',
    history_older_versions: '+{count} previous version',
    spreadsheet_preview_rows: 'Showing {count} preview row.',
    skill_outlier_complete: 'Completed outlier scan: {column} has {count} significant outlier at threshold |z| >= 2.5.',
    skill_pivot_complete: 'Generated pivot matrix: summarized by {rows} with {count} column group.',
    skill_cohort_complete: 'Completed {label} analysis: generated {count} cohort with periods 0 to {maxPeriods}.',
    boundary_confirm_header_depth_unit: '{count} layer',
    guided_repair_attempt_count: 'Ran {count} governed cleaning and verification attempt.',
    dq_note_mostly_empty: '{count} column is mostly empty and will be ignored unless needed.',
    dq_note_other: '{count} other data quality issue was found; the analysis takes it into account.',
};

export const getTranslationEntries = (): ReadonlyArray<readonly [string, Readonly<TranslationEntry>]> =>
    Object.entries(translations).map(([key, entry]) => [key, { ...entry }] as const);

export const getTranslation = (
    key: string,
    language: string = 'English',
    params?: Record<string, string | number>,
): string => {
    const lang = language as Language;
    // Mandarin, Japanese and Malay do not inflect for number; English does. A key listed in
    // ENGLISH_SINGULAR_WORDING reads in the singular when {count} is exactly 1, so the UI never
    // shows "1 cards" or "1 data quality notes" (nor the "card(s)" hedge).
    const rawCount = params?.count;
    const countValue = typeof rawCount === 'number' ? rawCount : Number(String(rawCount ?? '').replace(/,/g, ''));
    const singular = countValue === 1 && (lang === 'English' || !translations[key]?.[lang])
        ? ENGLISH_SINGULAR_WORDING[key]
        : undefined;
    const template = singular
        || translations[key]?.[lang]
        || (lang === 'Vietnamese' ? vietnameseTranslations[key] : undefined)
        || translations[key]?.['English']
        || key;
    if (!params) {
        return template;
    }

    return template.replace(/\{(\w+)\}/g, (_match, token) => {
        const value = params[token];
        return value === undefined ? `{${token}}` : String(value);
    });
};

/**
 * Reason codes that the structure review can emit: resolver blocking reasons,
 * shape-verification signal keys, and pipeline outcome fallbacks. Each has a
 * `structure_review_reason_<code>` entry so end users never see the raw code.
 */
export const STRUCTURE_REVIEW_REASON_CODES = [
    'boundary_incomplete',
    'header_shape_drift',
    'stacked_sections_set_aside',
    'not_delimited_text',
    'runtime_boundary_ambiguous',
    'runtime_boundary_rejected',
    'repeated_header_leakage',
    'repeated_header_leakage_rate',
    'low_structure_confidence',
    'structure_proposal_verification_failed',
    'complex_report_requires_confirmation',
    'empty_dataset_guard',
    'raw_inspection_completed',
    'dominant_block_resolved',
    'mixed_report_block_resolution',
    'label_layer_retention_complete',
    'multi_header_layer_retention_rate',
    'wide_reshape_contract_complete',
    'summary_like_series_key_leakage',
    'summary_series_exclusion_rate',
    'suspicious_collapse_score',
    'hierarchy_depth_retention_rate',
    'noise_leakage_rate',
    'numeric_parse_rate',
    'detail_series_coverage_rate',
    'descriptor_preservation_rate',
    'header_band_resolved',
    'fact_key_uniqueness_rate',
    'needs_structure_review',
    'structure_outcome_unavailable',
    // Pipeline outcome reason codes outside the structure resolver.
    'canonicalization_missing',
    'shape_verification_failed',
    'cleaning_failed',
    'blocked_by_intake',
    'parse_errors',
    'intake_structure_uncertain',
    'intake_diagnostics_missing',
    'sql_precheck_pending',
] as const;

export const getStructureReviewReasonText = (code: string, language: string = 'English'): string => {
    const key = `structure_review_reason_${code.trim()}`;
    return translations[key]
        ? getTranslation(key, language)
        : getTranslation('structure_review_reason_unknown', language);
};

// Cleaning and verification codes that are not structure-review reasons but can still end up in error text.
const OTHER_INTERNAL_CODES = [
    'semantic_intent_failed',
    'deterministic_recovery_failed',
    'deterministic_shaping_failed',
    'numeric_reconciliation_failed',
    'llm_budget_exhausted',
    'sandbox_verification_failed',
] as const;
const INTERNAL_CODE_SET = new Set<string>([...STRUCTURE_REVIEW_REASON_CODES, ...OTHER_INTERNAL_CODES]);

/**
 * Safety net for error text that is assembled from technical parts before it
 * reaches a progress message or chat bubble: verification detail fragments are
 * dropped, known check codes become their plain explanation and a leading
 * `code:` prefix is removed. Unknown snake_case words (column names) are kept.
 */
export const replaceInternalCodesWithPlainText = (text: string, language: string = 'English'): string => {
    const plainOf = (code: string) => INTERNAL_CODE_SET.has(code)
        ? (translations[`structure_review_reason_${code}`] ? getStructureReviewReasonText(code, language) : getTranslation('internal_code_generic', language))
        : null;
    return text
        .replace(/;?\s*expected_label_layers=\d+;\s*actual_label_layers=\d+/g, '')
        .replace(/\bsignal=([a-z0-9_]+);?/g, (match, code: string) => plainOf(code) ?? match)
        .replace(/^\s*[a-z]+(?:_[a-z]+)+:\s*/, prefix => INTERNAL_CODE_SET.has(prefix.replace(/:\s*$/, '').trim()) ? '' : prefix)
        .replace(/\b[a-z]+(?:_[a-z]+)+\b/g, code => plainOf(code) ?? code)
        .replace(/\s{2,}/g, ' ')
        .trim();
};

type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * Plain-language text for a blocked pipeline outcome. `PipelineOutcome.message`
 * is an English technical string, so user-facing surfaces use this instead and
 * keep `reasonCode` for a technical-details disclosure. Returns null when the
 * outcome does not block analysis.
 */
export const describePipelineOutcomeBlock = (
    outcome: { status: string; reasonCode: string } | null | undefined,
    translate: Translate,
): string | null => {
    if (!outcome) return null;
    const reasonKey = `structure_review_reason_${(outcome.reasonCode ?? '').trim()}`;
    const reason = translations[reasonKey] ? translate(reasonKey) : translate('structure_review_reason_unknown');
    switch (outcome.status) {
        case 'needs_structure_review':
            return `${translate('structure_review_required_message')} ${reason}`;
        case 'blocked_by_intake':
        case 'blocked_by_shape_verification':
        case 'blocked_by_sql_precheck':
        case 'cleaning_failed':
            return translate('pipeline_outcome_blocked_message', { reason });
        default:
            return null;
    }
};

export const getPipelineOutcomeUserText = (
    outcome: { status: string; reasonCode: string } | null | undefined,
    language: string = 'English',
): string | null => describePipelineOutcomeBlock(outcome, (key, params) => getTranslation(key, language, params));
