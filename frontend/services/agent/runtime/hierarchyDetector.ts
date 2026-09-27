import type { Settings } from '../../../types';
import type {
    DescriptionTotal,
    HierarchyGroup,
    DuplicateLabelPair,
    MetricRelationship,
} from './investigationTypes';

// --- Constants ---

const HIERARCHY_TOLERANCE = 0.02;       // 2% tolerance for parent ≈ SUM(children)
const DUPLICATE_TOLERANCE = 0.01;       // 1% tolerance for duplicate label detection
const MAX_CANDIDATE_PARENTS = 15;
const MIN_CHILDREN_FOR_HIERARCHY = 2;
const MIN_COVERAGE_RATIO = 0.95;
const RELATIONSHIP_TOLERANCE = 0.05;    // 5% tolerance for A - B ≈ C
const MAX_DERIVED_TOPIC_SUGGESTIONS = 3;
const HIERARCHY_VALIDATION_TIMEOUT_MS = 5_000;

/** Keywords that strongly indicate a genuine subtotal/parent row. */
const SUBTOTAL_KEYWORDS = /\b(total|subtotal|sub-total|sum|grand|net|gross|all|combined|overall|合计|小计|总计)\b/i;

const LOG_PREFIX_HIERARCHY = '[HierarchyDetector]';

// --- Phase 1: Hierarchy Detection ---

export const detectHierarchyGroups = (totals: DescriptionTotal[]): HierarchyGroup[] => {
    const groups: HierarchyGroup[] = [];
    const usedAsChild = new Set<string>();

    // Sort by absolute value descending — largest items are candidate parents
    const sorted = [...totals].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

    for (let i = 0; i < Math.min(sorted.length, MAX_CANDIDATE_PARENTS); i++) {
        const candidate = sorted[i];
        if (usedAsChild.has(candidate.description)) continue;

        // Find potential children: same sign, smaller magnitude, not already used
        const potentialChildren = sorted.filter(item =>
            item.description !== candidate.description
            && !usedAsChild.has(item.description)
            && Math.sign(item.total) === Math.sign(candidate.total)
            && Math.abs(item.total) < Math.abs(candidate.total),
        );

        // Greedy: accumulate children that sum closest to parent
        const children: DescriptionTotal[] = [];
        let runningSum = 0;

        // Sort potential children by total descending to greedily pick largest first
        const sortedChildren = [...potentialChildren].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

        for (const child of sortedChildren) {
            const newSum = runningSum + child.total;
            // Only add if it doesn't overshoot the parent by more than tolerance
            if (Math.abs(newSum) <= Math.abs(candidate.total) * (1 + HIERARCHY_TOLERANCE)) {
                children.push(child);
                runningSum = newSum;
            }
            // Stop if we've matched closely enough
            if (Math.abs(runningSum - candidate.total) / Math.abs(candidate.total) < HIERARCHY_TOLERANCE) {
                break;
            }
        }

        const coverageRatio = Math.abs(candidate.total) > 0
            ? Math.abs(runningSum) / Math.abs(candidate.total)
            : 0;

        if (children.length >= MIN_CHILDREN_FOR_HIERARCHY && coverageRatio >= MIN_COVERAGE_RATIO) {
            groups.push({
                parent: candidate.description,
                parentTotal: candidate.total,
                children: children.map(c => ({ description: c.description, total: c.total })),
                coverageRatio,
            });
            children.forEach(c => usedAsChild.add(c.description));
        }
    }

    return groups;
};

// --- Phase 1b: AI Validation of Hierarchy Candidates ---

export interface HierarchyValidationResult {
    confirmed: HierarchyGroup[];
    rejected: HierarchyGroup[];
    usedFallback: boolean;
}

/**
 * Conservative keyword-based fallback: only confirm hierarchy groups
 * whose parent description contains known subtotal keywords.
 * This is strictly safer than the current numeric-only approach.
 */
const validateWithKeywordFallback = (candidates: HierarchyGroup[]): HierarchyValidationResult => {
    const confirmed: HierarchyGroup[] = [];
    const rejected: HierarchyGroup[] = [];
    for (const group of candidates) {
        if (SUBTOTAL_KEYWORDS.test(group.parent)) {
            confirmed.push(group);
        } else {
            rejected.push(group);
        }
    }
    return { confirmed, rejected, usedFallback: true };
};

/**
 * AI-first validation of hierarchy candidates. The deterministic detector
 * generates candidates; this function confirms or rejects each one using
 * semantic understanding (column name, value labels, context).
 *
 * Fallback: when AI is unavailable or times out, uses keyword matching
 * (only confirms parents containing "Total", "合计", etc.).
 */
export const validateHierarchyCandidatesWithAI = async (
    candidates: HierarchyGroup[],
    columnName: string,
    sampleValues: DescriptionTotal[],
    settings: Settings | null | undefined,
): Promise<HierarchyValidationResult> => {
    if (candidates.length === 0) {
        return { confirmed: [], rejected: [], usedFallback: false };
    }

    // Lazy-load AI dependencies to avoid breaking module loading in test environments.
    let isProviderConfigured: (s: Settings) => boolean;
    try {
        const providerConfig = await import('../../ai/providerConfig');
        isProviderConfigured = providerConfig.isProviderConfigured;
    } catch {
        // AI module unavailable — use keyword fallback
        return validateWithKeywordFallback(candidates);
    }

    // No AI available → keyword fallback (safer than confirming everything)
    if (!settings || !isProviderConfigured(settings)) {
        console.log(`${LOG_PREFIX_HIERARCHY} No AI available, using keyword fallback for ${candidates.length} candidate(s).`);
        return validateWithKeywordFallback(candidates);
    }

    try {
        const { generateText } = await import('ai');
        const { createProviderModel } = await import('../../ai/providerConfig');
        const { withTransientRetry } = await import('../../ai/transientRetry');
        const { model, modelId } = createProviderModel(settings, settings.simpleModel);

        const candidateDescriptions = candidates.map((group, i) => {
            const childList = group.children.map(c => `  "${c.description}" (${c.total})`).join('\n');
            return `Group ${i + 1}:\n  Parent: "${group.parent}" (total: ${group.parentTotal})\n  Children:\n${childList}\n  Coverage: ${(group.coverageRatio * 100).toFixed(1)}%`;
        }).join('\n\n');

        const allValues = sampleValues.slice(0, 20).map(v => `"${v.description}"`).join(', ');

        const systemPrompt = [
            'You are a data structure analyst. You are given candidate parent-child hierarchy groups detected in a column of a CSV dataset.',
            'Your job is to confirm or reject each group based on whether the parent value is genuinely a subtotal/aggregate row.',
            '',
            'Rules:',
            '- CONFIRMED: parent is clearly a summary/subtotal label (e.g., "Total Operating Expenses" summarizing "Salaries", "Rent", "Utilities")',
            '- REJECTED: peer-level items with coincidental numeric relationship (e.g., product names, colors, materials, person names)',
            '- Column name is important context: "Description" with financial terms = likely hierarchy; "COLOUR"/"Product"/"Category" = likely false positive',
            '- When in doubt, REJECT — false negatives are safer than false positives',
            '',
            'Respond with one line per group: "Group N: CONFIRMED" or "Group N: REJECTED"',
        ].join('\n');

        const userPrompt = `Column: "${columnName}"\nAll values in this column: ${allValues}\n\nCandidate hierarchy groups:\n${candidateDescriptions}`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new Error('hierarchy_validation_timeout')), HIERARCHY_VALIDATION_TIMEOUT_MS);
        let result: Awaited<ReturnType<typeof generateText>>;
        try {
            result = await withTransientRetry(
                (fb) => generateText({
                    model: fb ?? model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    abortSignal: controller.signal,
                }),
                { settings, primaryModelId: modelId, label: 'hierarchyDetector', abortSignal: controller.signal },
            );
            clearTimeout(timer);
        } catch (err) {
            clearTimeout(timer);
            throw err;
        }

        // Parse AI response — look for "Group N: CONFIRMED" or "Group N: REJECTED"
        const confirmed: HierarchyGroup[] = [];
        const rejected: HierarchyGroup[] = [];
        const responseText = result.text.toLowerCase();

        for (let i = 0; i < candidates.length; i++) {
            const groupPattern = new RegExp(`group\\s*${i + 1}\\s*:\\s*(confirmed|rejected)`, 'i');
            const match = responseText.match(groupPattern);
            if (match && match[1].toLowerCase() === 'confirmed') {
                confirmed.push(candidates[i]);
            } else {
                // Default to rejected if unparseable (bias toward safety)
                rejected.push(candidates[i]);
            }
        }

        console.log(
            `${LOG_PREFIX_HIERARCHY} AI validated ${candidates.length} candidate(s): `
            + `${confirmed.length} confirmed, ${rejected.length} rejected.`,
        );
        return { confirmed, rejected, usedFallback: false };
    } catch (error) {
        console.warn(`${LOG_PREFIX_HIERARCHY} AI validation failed, using keyword fallback:`, error);
        return validateWithKeywordFallback(candidates);
    }
};

// --- Phase 2: Duplicate Label Detection ---

export const detectDuplicateLabels = (
    totals: DescriptionTotal[],
    hierarchyParents: Set<string>,
): DuplicateLabelPair[] => {
    const pairs: DuplicateLabelPair[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < totals.length; i++) {
        for (let j = i + 1; j < totals.length; j++) {
            const a = totals[i];
            const b = totals[j];
            const maxAbs = Math.max(Math.abs(a.total), Math.abs(b.total));
            if (maxAbs === 0) continue;

            const diff = Math.abs(a.total - b.total) / maxAbs;
            if (diff < DUPLICATE_TOLERANCE) {
                const key = [a.description, b.description].sort().join('||');
                if (seen.has(key)) continue;
                // Skip if one is a parent and the other is its child
                if (hierarchyParents.has(a.description) || hierarchyParents.has(b.description)) continue;
                seen.add(key);
                pairs.push({
                    descriptionA: a.description,
                    descriptionB: b.description,
                    total: a.total,
                    relativeDifference: diff,
                });
            }
        }
    }

    return pairs;
};

// --- Phase 2b: Metric Relationship Detection ---
// Detects A - B ≈ C patterns (e.g. Revenue - Cost ≈ Gross Profit).
// These are peer-to-peer relationships, distinct from parent-child hierarchies.

export const detectMetricRelationships = (
    totals: DescriptionTotal[],
): MetricRelationship[] => {
    const relationships: MetricRelationship[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < totals.length; i++) {
        for (let j = i + 1; j < totals.length; j++) {
            const a = totals[i];
            const b = totals[j];
            const diff = a.total - b.total;
            if (Math.abs(diff) < 1) continue;

            for (let k = 0; k < totals.length; k++) {
                if (k === i || k === j) continue;
                const c = totals[k];
                const maxAbs = Math.max(Math.abs(diff), Math.abs(c.total));
                if (maxAbs === 0) continue;
                const deviation = Math.abs(diff - c.total) / maxAbs;
                if (deviation < RELATIONSHIP_TOLERANCE) {
                    const key = [a.description, b.description, c.description].sort().join('||');
                    if (seen.has(key)) continue;
                    seen.add(key);
                    relationships.push({
                        left: a.description,
                        right: b.description,
                        result: c.description,
                        leftTotal: a.total,
                        rightTotal: b.total,
                        resultTotal: c.total,
                        matchRatio: 1 - deviation,
                    });
                }
            }
        }
    }

    return relationships
        .sort((a, b) => b.matchRatio - a.matchRatio)
        .slice(0, 5);
};

// --- Derived Topic Suggestions from Metric Relationships ---

export const buildDerivedTopicSuggestions = (
    relationships: MetricRelationship[],
    semanticCategories: Record<string, string>,
): string[] => {
    if (relationships.length === 0) return [];

    const suggestions: string[] = [];
    for (const rel of relationships) {
        if (suggestions.length >= MAX_DERIVED_TOPIC_SUGGESTIONS) break;

        const leftCat = semanticCategories[rel.left] ?? 'operating';
        const rightCat = semanticCategories[rel.right] ?? 'operating';
        const resultCat = semanticCategories[rel.result] ?? 'operating';

        // Revenue − Cost ≈ Profit → margin/profit-focused topic
        if (
            (leftCat === 'revenue' && rightCat === 'cost')
            || resultCat === 'profit'
        ) {
            suggestions.push(
                `${rel.result} breakdown (${rel.left} minus ${rel.right})`,
            );
        } else {
            // Generic component comparison
            suggestions.push(
                `${rel.result} as component of ${rel.left} and ${rel.right}`,
            );
        }
    }
    return suggestions;
};
