/**
 * reshapeBeforeAnalysis.ts
 *
 * Deterministic pre-analysis reshape for wide-pivot datasets.
 *
 * When the investigation harness detects a wide pivot shape with period
 * column families (e.g. monthly columns "JAN 2010" ... "DEC 2010"), this
 * module builds and executes an unpivot_columns operation so that
 * downstream topic planning and card generation work with a long-format
 * table instead of a wide crosstab.
 *
 * After reshape succeeds the caller must refresh the full analysis context
 * (profiles, harness, steering) so that topic planning and card-type
 * decisions reflect the reshaped schema — this is the "redecide" part of
 * "reshape then redecide".
 *
 * Follows harness engineering: detect → structured directive → deterministic
 * action. No AI call is needed — the reshape is fully derived from harness
 * findings.
 */

import type { EvidenceHarnessContext, ColumnProfile, UnpivotColumnsOperation } from '../../../types';
import type { PeriodColumnFamily } from './periodColumnDetector';
import { isStructuralMetadataColumn } from '../structuralMetadata';
import { isUnnamedHelperColumn } from '../analysisColumnRoles';
import { handleAiAction } from '../actionHandler';
import { recordRuntimeEvent } from './runtimeHelpers';
import type { StoreApi } from './analysisSessionHelpers';

export interface ReshapeBeforeAnalysisResult {
    applied: boolean;
    reason: string;
    periodFamily: PeriodColumnFamily | null;
    sourceColumns: string[];
    keepColumns: string[];
}

const LOG_PREFIX = '[ReshapeBeforeAnalysis]';

/**
 * Determines whether the current dataset needs a pre-analysis reshape
 * and, if so, builds and executes the unpivot operation.
 *
 * Eligibility rules (all must be true):
 * 1. harnessContext.widePivotShape === true
 * 2. harnessContext.widePivotMode === 'reshape_required'
 * 3. At least one periodColumnFamily was detected
 * 4. The period family has >= 3 source columns
 */
export const reshapeWidePivotBeforeAnalysis = async (
    harnessContext: EvidenceHarnessContext | null,
    columnProfiles: ColumnProfile[],
    store: StoreApi,
    suggestedUnpivotPlan?: UnpivotColumnsOperation | null,
): Promise<ReshapeBeforeAnalysisResult> => {
    const skip = (reason: string): ReshapeBeforeAnalysisResult => ({
        applied: false,
        reason,
        periodFamily: null,
        sourceColumns: [],
        keepColumns: [],
    });

    if (!harnessContext) {
        return skip('No harness context available.');
    }
    if (!harnessContext.widePivotShape) {
        return skip('Dataset is not a wide pivot shape.');
    }
    if (harnessContext.widePivotMode !== 'reshape_required') {
        return skip(`Wide pivot mode is "${harnessContext.widePivotMode}", not "reshape_required".`);
    }

    const families = harnessContext.periodColumnFamilies ?? [];
    if (families.length === 0) {
        return skip('No period column families detected.');
    }

    // Use the largest family (most month columns) for the reshape.
    const family = [...families].sort((a, b) => b.columns.length - a.columns.length)[0];
    if (family.columns.length < 3) {
        return skip(`Largest period family has only ${family.columns.length} columns (need >= 3).`);
    }

    // Prefer the harness-generated unpivot plan when available: it properly
    // excludes TOTAL/summary columns and merges multi-year families.
    // Fall back to building from periodColumnFamilies when no plan exists.
    let sourceColumns: string[];
    let keepColumns: string[];
    let keyColumn: string;
    let valueColumn: string;

    if (suggestedUnpivotPlan && suggestedUnpivotPlan.sourceColumns.length >= 2) {
        sourceColumns = suggestedUnpivotPlan.sourceColumns;
        keepColumns = suggestedUnpivotPlan.keepColumns ?? [];
        keyColumn = suggestedUnpivotPlan.keyColumn;
        valueColumn = suggestedUnpivotPlan.valueColumn;
        console.log(`${LOG_PREFIX} Using harness suggestedUnpivotPlan (${sourceColumns.length} period cols, excludes TOTAL/summary).`);
    } else {
        // Fallback: collect all period columns across all families.
        const allPeriodColumns = new Set<string>();
        for (const f of families) {
            for (const col of f.columns) {
                allPeriodColumns.add(col);
            }
        }
        sourceColumns = [...allPeriodColumns];
        const allColumnNames = columnProfiles.map(c => c.name);
        keepColumns = allColumnNames.filter(name =>
            !allPeriodColumns.has(name)
            && !isStructuralMetadataColumn(name)
            && !isUnnamedHelperColumn(name),
        );
        keyColumn = 'Period';
        valueColumn = 'Value';
        console.log(`${LOG_PREFIX} No suggestedUnpivotPlan — building from periodColumnFamilies (${sourceColumns.length} cols).`);
    }

    if (keepColumns.length === 0) {
        return skip('All columns are period columns — nothing to keep as dimensions.');
    }

    const yearLabel = family.year ? ` ${family.year}` : '';
    const explanation = `Unpivot ${sourceColumns.length} period columns${yearLabel} into long format ("${keyColumn}" / "${valueColumn}") for downstream analysis.`;

    console.log(`${LOG_PREFIX} ${explanation}`);
    recordRuntimeEvent(store, {
        type: 'reshape_before_analysis',
        stage: 'executing',
        message: explanation,
        detail: {
            sourceColumns,
            keepColumns,
            keyColumn,
            valueColumn,
            familyCount: families.length,
            usedHarnessPlan: Boolean(suggestedUnpivotPlan),
        },
    });

    // Build label mappings so that each source column gets a human-readable
    // label in the output (stripping the year suffix if present, keeping the
    // month abbreviation).
    const labelMappings = sourceColumns.map(col => ({
        sourceColumn: col,
        label: col,
    }));

    try {
        const actionResult = await handleAiAction({
            type: 'tool_call',
            toolName: 'data.mutate',
            thought: `Reshape wide pivot table: unpivot ${sourceColumns.length} period columns into long format.`,
            args: {
                explanation,
                operations: [{
                    id: 'reshape_wide_pivot',
                    type: 'unpivot_columns',
                    reason: explanation,
                    sourceColumns,
                    keyColumn,
                    valueColumn,
                    keepColumns,
                    labelMappings,
                }],
            },
        }, store, {
            toolStage: 'analysis',
        });

        if (actionResult.status !== 'success') {
            const failReason = actionResult.message ?? 'Reshape action returned non-success status.';
            console.warn(`${LOG_PREFIX} Reshape failed: ${failReason}`);
            recordRuntimeEvent(store, {
                type: 'reshape_before_analysis_failed',
                stage: 'executing',
                message: `Pre-analysis reshape failed: ${failReason}`,
                detail: { actionResult },
            });
            return skip(`Reshape failed: ${failReason}`);
        }

        console.log(`${LOG_PREFIX} Reshape succeeded — dataset is now in long format.`);
        recordRuntimeEvent(store, {
            type: 'reshape_before_analysis_succeeded',
            stage: 'executing',
            message: `Pre-analysis reshape succeeded: ${sourceColumns.length} period columns → long format.`,
            detail: {
                sourceColumns,
                keepColumns,
                keyColumn,
                valueColumn,
            },
        });

        return {
            applied: true,
            reason: explanation,
            periodFamily: family,
            sourceColumns,
            keepColumns,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`${LOG_PREFIX} Reshape threw: ${errorMessage}`);
        recordRuntimeEvent(store, {
            type: 'reshape_before_analysis_failed',
            stage: 'executing',
            message: `Pre-analysis reshape threw an error: ${errorMessage}`,
            detail: { error: errorMessage },
        });
        return skip(`Reshape threw: ${errorMessage}`);
    }
};
