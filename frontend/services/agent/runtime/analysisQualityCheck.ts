import type { Settings } from '../../../types';
import type { DataInvestigationFindings } from './dataInvestigationHarness';
import type { StoreApi } from './analysisSessionHelpers';
import { callSmallAiStep } from '../planning/planGenerator';
import { handleAiAction } from '../actionHandler';
import { robustlyParseJsonObject } from '../../../utils/jsonParser';
import { recordRuntimeEvent } from './runtimeHelpers';

export const buildQualityIssueSummary = (findings: DataInvestigationFindings): string[] => {
    const issues: string[] = [];
    for (const p of findings.missingDataPatterns) {
        const pct = Math.round((p.nullRate + p.blankRate) * 100);
        if (pct >= 3) {
            issues.push(`Column "${p.column}" has ${pct}% null/blank values`);
        }
    }
    // Duplicate label aliases are excluded from quality check because the only
    // allowed repair action is fill_missing (fills NULL/empty cells). Fixing
    // aliases requires replace_values which is not permitted here — reporting
    // them causes the AI to propose an ineffective fill_missing that loops.
    return issues;
};

export const resolveQualityRepairColumn = (columnName: string, availableColumns: string[]) => {
    const normalized = columnName.trim().toLowerCase();
    if (!normalized) {
        return null;
    }
    return availableColumns.find(column => column.trim().toLowerCase() === normalized) ?? null;
};

export const runPostInvestigationQualityCheck = async (
    findings: DataInvestigationFindings,
    store: StoreApi,
    settings: Settings,
): Promise<{ applied: boolean; fixCount: number }> => {
    const issues = buildQualityIssueSummary(findings);
    if (issues.length === 0) return { applied: false, fixCount: 0 };

    try {
        const availableColumns = store.getState().columnProfiles.map(column => column.name);
        const response = await callSmallAiStep(
            settings,
            'You are a data quality analyst. Return JSON only. Choose at most one conservative pre-analysis repair.',
            `Quality issues found before analysis:\n${issues.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n` +
            `Available columns: ${availableColumns.join(', ')}\n` +
            `Allowed action: exactly one fill_missing with strategy="constant".\n` +
            `Return ONE JSON object only:\n` +
            `{"decision":"apply","column":"Exact Column Name","replacementValue":"value","reason":"short reason"}\n` +
            `or {"decision":"skip","reason":"why no safe repair applies"}`,
        );
        if (response.trim().length === 0) {
            return { applied: false, fixCount: 0 };
        }

        const parsed = robustlyParseJsonObject(response) as {
            decision?: string;
            column?: string;
            replacementValue?: unknown;
            reason?: string;
        };
        if (parsed.decision !== 'apply') {
            return { applied: false, fixCount: 0 };
        }

        const resolvedColumn = resolveQualityRepairColumn(String(parsed.column ?? ''), availableColumns);
        const replacementValue = parsed.replacementValue;
        if (!resolvedColumn || replacementValue === undefined || replacementValue === null) {
            recordRuntimeEvent(store, {
                type: 'quality_repair_contract_rejected',
                stage: 'executing',
                message: 'Quality repair proposal was rejected before execution because it did not map to a valid fill_missing action.',
                detail: {
                    parsed,
                    availableColumns,
                },
            });
            return { applied: false, fixCount: 0 };
        }

        const actionResult = await handleAiAction({
            type: 'tool_call',
            toolName: 'data.mutate',
            thought: `Apply one conservative pre-analysis quality repair to "${resolvedColumn}".`,
            args: {
                explanation: parsed.reason?.trim() || `Fill missing values in ${resolvedColumn} before analysis.`,
                operations: [{
                    type: 'fill_missing',
                    column: resolvedColumn,
                    strategy: 'constant',
                    value: replacementValue,
                }],
            },
        }, store, {
            toolStage: 'analysis',
            dataMutatePolicy: 'quality_repair_fill_missing_only',
        });

        if (actionResult.status !== 'success') {
            recordRuntimeEvent(store, {
                type: 'quality_repair_contract_rejected',
                stage: 'executing',
                message: actionResult.message || 'Quality repair proposal was blocked by the constrained data.mutate contract.',
                detail: {
                    parsed,
                    toolResult: actionResult,
                },
            });
            return { applied: false, fixCount: 0 };
        }

        return { applied: true, fixCount: 1 };
    } catch (error) {
        console.warn('[QualityCheck] Quality check failed, proceeding without fixes:', error);
        return { applied: false, fixCount: 0 };
    }
};
