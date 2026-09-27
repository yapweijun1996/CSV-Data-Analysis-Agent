/**
 * Historical learning hints for topic processing.
 *
 * Extracts preferences (avoid/prefer groupBy dimensions) from
 * agent memory runs to guide the planner away from known-bad
 * groupings and toward proven-good ones.
 */

import type { AgentMemoryRun } from '../../../types';

/**
 * Analyze exploration history to build groupBy preferences.
 * Returns avoid/prefer lists sorted by frequency (most common first, max 8).
 */
export const buildLearningHintsFromHistory = (
    runs: AgentMemoryRun[],
    blockedDimensions?: string[],
) => {
    if (!runs || runs.length === 0) return undefined;
    const blocked = new Set(blockedDimensions ?? []);
    const avoidMap = new Map<string, number>();
    const preferMap = new Map<string, number>();
    runs.forEach(run => {
        run.findings.explorations.forEach(exploration => {
            if (!exploration.groupBy || exploration.groupBy.length === 0) return;
            const key = exploration.groupBy[0];
            if (!key) return;
            // Skip columns that are now blocked — historical preferences for
            // blocked columns would conflict with current semantic classification.
            if (blocked.has(key)) return;
            if (exploration.verdict === 'flat_metric' || exploration.verdict === 'no_data') {
                avoidMap.set(key, (avoidMap.get(key) ?? 0) + 1);
            } else if (exploration.cardCreated || exploration.verdict === 'useful') {
                preferMap.set(key, (preferMap.get(key) ?? 0) + 1);
            }
        });
    });

    const toSortedList = (map: Map<string, number>) =>
        Array.from(map.entries())
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([name]) => name)
            .slice(0, 8);

    const avoidGroupBys = toSortedList(avoidMap);
    const preferGroupBys = toSortedList(preferMap);
    return avoidGroupBys.length > 0 || preferGroupBys.length > 0
        ? { avoidGroupBys, preferGroupBys }
        : undefined;
};
