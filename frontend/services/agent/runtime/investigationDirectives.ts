import type {
    AnalysisSteeringPairingSignal,
    ColumnProfile,
    RuntimeSemanticUnderstanding,
} from '../../../types';
import {
    buildAnalysisColumnRoleMap,
} from '../analysisColumnRoles';
import type {
    DataInvestigationFindings,
    DuplicateLabelPair,
} from './investigationTypes';
import { createEmptyRuntimeDirectives } from './investigationTypes';

const CODE_LIKE_PATTERN = /^(code|key|id|number|no|num|index|serial)$/i;
const LABEL_LIKE_PATTERN = /^(label|name|title|description|desc|category|group|type|class)$/i;

export const normalizeColumnFamily = (value: string) => value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[_/.-]+/g, ' ')
    .replace(/\bl\d+\b/g, ' ')
    .replace(/\b(code|key|id|identifier|number|num|no|serial|label|name|title|description|desc|category|group|type|class)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const tokenizeSemanticTerms = (value: string) =>
    value
        .toLowerCase()
        .replace(/[_/.-]+/g, ' ')
        .split(/\s+/)
        .map(token => token.trim())
        .filter(token => token.length >= 2);

export const buildPairingSignals = (
    categoricalCols: ColumnProfile[],
    semanticUnderstanding: RuntimeSemanticUnderstanding,
): AnalysisSteeringPairingSignal[] => {
    // --- Phase 1: AI-driven classification (primary signal) ---
    // Use semantic understanding to identify code vs label columns.
    // AI-classified businessGrains and helperDimensions are the authoritative
    // signal; regex patterns are only used as fallback when AI doesn't classify.
    const aiGrains = new Set(semanticUnderstanding.businessGrains ?? []);
    const aiHelpers = new Set(semanticUnderstanding.helperDimensions ?? []);
    const aiBlocked = new Set(semanticUnderstanding.blockedDimensions ?? []);

    // A column is a "code" if AI explicitly classified it as helper/blocked,
    // OR if AI didn't classify it at all and the regex pattern matches.
    const isAiClassifiedCode = (col: ColumnProfile): boolean =>
        aiHelpers.has(col.name) || aiBlocked.has(col.name);
    const isAiClassifiedLabel = (col: ColumnProfile): boolean =>
        aiGrains.has(col.name);

    // --- Phase 2: Regex fallback (only for columns AI didn't classify) ---
    const isRegexCode = (col: ColumnProfile): boolean =>
        !isAiClassifiedLabel(col)
        && !isAiClassifiedCode(col)
        && (CODE_LIKE_PATTERN.test(col.name) || /(code|key|id)$/i.test(col.name));
    const isRegexLabel = (col: ColumnProfile): boolean =>
        !isAiClassifiedLabel(col)
        && !isAiClassifiedCode(col)
        && (LABEL_LIKE_PATTERN.test(col.name) || /label|name|title|description|desc/i.test(col.name));

    const labelCols = categoricalCols.filter(col =>
        isAiClassifiedLabel(col) || isRegexLabel(col),
    );
    const codeCols = categoricalCols.filter(col =>
        isAiClassifiedCode(col) || isRegexCode(col),
    );
    if (labelCols.length === 0 || codeCols.length === 0) {
        return [];
    }

    const semanticTerms = new Set(
        [
            ...(semanticUnderstanding.businessGrains ?? []),
            ...(semanticUnderstanding.headerSemantics?.businessTerminology ?? []),
        ].flatMap(tokenizeSemanticTerms),
    );
    const signals: AnalysisSteeringPairingSignal[] = [];

    codeCols.forEach(codeCol => {
        const codeFamily = normalizeColumnFamily(codeCol.name);
        const codeTokens = new Set(tokenizeSemanticTerms(codeFamily || codeCol.name));
        if (codeTokens.size === 0) {
            return;
        }

        // AI-classified pairings get the strongest confidence; regex-only
        // pairings are downgraded to soft_deprioritize to avoid hard-blocking
        // columns that the AI considered business-relevant.
        const codeIsAiClassified = isAiClassifiedCode(codeCol);

        const sharedFamilyMatches = labelCols.filter(labelCol => {
            const labelFamily = normalizeColumnFamily(labelCol.name);
            return Boolean(codeFamily && labelFamily && codeFamily === labelFamily);
        });
        if (sharedFamilyMatches.length === 1) {
            signals.push({
                codeColumn: codeCol.name,
                labelColumn: sharedFamilyMatches[0].name,
                pairingConfidence: codeIsAiClassified ? 'high' : 'medium',
                pairingSource: codeIsAiClassified ? 'shared_family' : 'shared_family_regex_fallback',
                action: codeIsAiClassified ? 'block_code' : 'soft_deprioritize_code',
            });
            return;
        }

        const semanticMatches = labelCols.filter(labelCol => {
            const labelTokens = new Set(tokenizeSemanticTerms(normalizeColumnFamily(labelCol.name) || labelCol.name));
            const overlap = [...codeTokens].filter(token => labelTokens.has(token));
            return overlap.length > 0 && overlap.some(token => semanticTerms.has(token));
        });
        if (semanticMatches.length === 1) {
            signals.push({
                codeColumn: codeCol.name,
                labelColumn: semanticMatches[0].name,
                pairingConfidence: 'medium',
                pairingSource: codeIsAiClassified ? 'semantic_context' : 'semantic_context_regex_fallback',
                action: 'soft_deprioritize_code',
            });
        }
    });

    return signals;
};

export const buildRuntimeDirectives = (
    columns: ColumnProfile[],
    leafDescriptions: string[],
    parentDescriptions: string[],
    duplicateLabels: DuplicateLabelPair[],
    semanticUnderstanding: RuntimeSemanticUnderstanding,
    descriptionColumnName: string | null = null,
    options?: { replicatedMetricColumns?: string[] },
): DataInvestigationFindings['runtimeDirectives'] => {
    const columnRoles = buildAnalysisColumnRoleMap(columns, semanticUnderstanding, options);
    const preferredDimensions = columns
        .filter(col => ['categorical', 'date', 'time'].includes(col.type))
        .filter(col => columnRoles[col.name] === 'business_dimension')
        .map(col => col.name);
    // Only hard-block helper_dimension roles.  Columns with uncertain roles
    // (e.g. repeated_bundle_member, unknown) become soft-deprioritize candidates
    // rather than hard-blocked — this prevents killing viable business dimensions
    // that were tentatively misclassified.
    const blockedDimensions = columns
        .filter(col => ['categorical', 'date', 'time'].includes(col.type))
        .filter(col => columnRoles[col.name] === 'helper_dimension')
        .map(col => col.name);
    const softBlockedDimensions = columns
        .filter(col => ['categorical', 'date', 'time'].includes(col.type))
        .filter(col => columnRoles[col.name] !== 'business_dimension')
        .filter(col => columnRoles[col.name] !== 'structural_metadata')
        .filter(col => columnRoles[col.name] !== 'helper_dimension')
        .map(col => col.name);
    const preferredMetrics = columns
        .filter(col => ['numerical', 'currency', 'percentage'].includes(col.type))
        .filter(col => columnRoles[col.name] === 'business_metric')
        .map(col => col.name);
    const blockedMetrics = columns
        .filter(col => ['numerical', 'currency', 'percentage'].includes(col.type))
        .filter(col => columnRoles[col.name] !== 'business_metric')
        .filter(col => columnRoles[col.name] !== 'structural_metadata')
        .map(col => col.name);
    const categoricalCols = columns.filter(col =>
        col.type === 'categorical'
        && !blockedDimensions.includes(col.name),
    );

    const preferGroupBy: string[] = [];
    const blockGroupBy: string[] = [...blockedDimensions];
    const softDeprioritizeGroupBy: string[] = [...softBlockedDimensions];
    const pairingSignals = buildPairingSignals(categoricalCols, semanticUnderstanding);

    pairingSignals.forEach(signal => {
        if (!preferGroupBy.includes(signal.labelColumn)) {
            preferGroupBy.push(signal.labelColumn);
        }
        if (signal.action === 'block_code') {
            if (!blockGroupBy.includes(signal.codeColumn)) {
                blockGroupBy.push(signal.codeColumn);
            }
            return;
        }
        if (!softDeprioritizeGroupBy.includes(signal.codeColumn)) {
            softDeprioritizeGroupBy.push(signal.codeColumn);
        }
    });

    // If no label columns found, use non-blocked categorical columns
    if (preferGroupBy.length === 0) {
        columns
            .filter(col => ['categorical', 'date', 'time'].includes(col.type))
            .filter(col => columnRoles[col.name] === 'business_dimension')
            .filter(col => !blockGroupBy.includes(col.name) && !softDeprioritizeGroupBy.includes(col.name))
            .sort((a, b) => (a.uniqueValues ?? 999) - (b.uniqueValues ?? 999))
            .slice(0, 3)
            .forEach(col => preferGroupBy.push(col.name));
    }

    // Grain rescue: if ALL dimensions would be blocked and no preferred
    // dimensions exist, rescue the best candidate from blockGroupBy so the
    // pipeline can still generate SQL-first cards.
    if (preferGroupBy.length === 0 && blockGroupBy.length > 0) {
        const rescueCandidates = columns
            .filter(col => ['categorical', 'date', 'time'].includes(col.type))
            .filter(col => blockGroupBy.includes(col.name))
            .filter(col => (col.uniqueValues ?? 0) > 1)
            .filter(col => (col.missingPercentage ?? 0) < 50)
            .sort((a, b) => (a.uniqueValues ?? 999) - (b.uniqueValues ?? 999));
        if (rescueCandidates.length > 0) {
            const rescued = rescueCandidates[0].name;
            const idx = blockGroupBy.indexOf(rescued);
            if (idx !== -1) blockGroupBy.splice(idx, 1);
            preferGroupBy.push(rescued);
        }
    }

    // Recommend TopN when leaf descriptions are numerous
    const recommendedTopN = leafDescriptions.length > 15 ? 10
        : leafDescriptions.length > 8 ? 8
        : null;

    // Descriptions to exclude: all parents + second item of each duplicate pair
    const excludeFromAggregation = [
        ...parentDescriptions,
        ...duplicateLabels.map(p => p.descriptionB),
    ];

    const hierarchyColumn = excludeFromAggregation.length > 0 ? (descriptionColumnName ?? null) : null;

    return {
        ...createEmptyRuntimeDirectives(),
        preferGroupBy,
        blockGroupBy,
        softDeprioritizeGroupBy,
        columnRoles,
        preferredDimensions: preferGroupBy.length > 0 ? preferGroupBy : preferredDimensions,
        blockedDimensions,
        preferredMetrics,
        blockedMetrics,
        recommendedTopN,
        excludeFromAggregation,
        hierarchyColumn,
        pairingSignals,
        duplicateSignatureHints: [
            ...preferGroupBy.map(column => `dimension:${column}`),
            ...preferredMetrics.map(column => `metric:${column}`),
        ],
    };
};
