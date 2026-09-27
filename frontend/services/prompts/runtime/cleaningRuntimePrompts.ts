type CleaningRuntimePromptParams = {
    phase: string;
    providerPhaseInstruction: string;
    cleanPath: string;
    rawPath: string;
    reportContextPath: string;
    intakeIrPath: string;
    runtimeAssessmentPath: string;
    operationContractSummary: string;
    requiresRawFirstInspect: boolean;
    shouldWarnDuringCleaning: boolean;
    shouldBlockAutomaticAnalysis: boolean;
    wideCrosstabReason: string | null;
    phaseContextPreview: string;
    reportContextPreview: string;
    rawPreview: string;
    cleanedPreview: string;
    recentActions: string;
    selfCorrectionFeedback: string | null;
};

export const buildCleaningRuntimePrompts = ({
    phase,
    providerPhaseInstruction,
    cleanPath,
    rawPath,
    reportContextPath,
    intakeIrPath,
    runtimeAssessmentPath,
    operationContractSummary,
    requiresRawFirstInspect,
    shouldWarnDuringCleaning,
    shouldBlockAutomaticAnalysis,
    wideCrosstabReason,
    phaseContextPreview,
    reportContextPreview,
    rawPreview,
    cleanedPreview,
    recentActions,
    selfCorrectionFeedback,
}: CleaningRuntimePromptParams): { systemPrompt: string; userPrompt: string } => {
    const systemPrompt = `You are the autonomous CSV cleaning runtime.
Work inside a strict state machine: inspect, edit, verify.
Never mutate ${rawPath}. Only edit ${cleanPath}.
Return native tool calls only.
${providerPhaseInstruction}`;

    const userPrompt = [
        '**phase contract**',
        `- currentPhase: ${phase}`,
        `- writableFile: ${cleanPath}`,
        `- readOnlySource: ${rawPath}`,
        `- reportContextSidecar: ${reportContextPath}`,
        `- intakeIrSidecar: ${intakeIrPath}`,
        `- runtimeAssessmentSidecar: ${runtimeAssessmentPath}`,
        '- preserve business rows',
        '- remove title, subtitle, metadata, summary, footer, or junk rows only when proven non-tabular',
        '- preserve report title, parameters, and footer remarks in sidecar context, not in cleaned.csv',
        '- keep the final result query-friendly for DuckDB analysis',
        '- use only small deterministic operations; never do ad-hoc text-level CSV rewriting',
        wideCrosstabReason
            ? '- if the dataset is still pivot/crosstab shaped, finish with a long query-friendly table'
            : '',
        requiresRawFirstInspect
            ? `- inspect order is mandatory: read ${rawPath} first, then compare ${cleanPath}`
            : '',
        shouldWarnDuringCleaning
            ? '- intake diagnostics are not fully trusted; verify structure before deciding any edit'
            : '',
        shouldBlockAutomaticAnalysis
            ? '- this dataset would block automatic analysis until structure is re-verified'
            : '',
        phase === 'edit'
            ? '- every operation must include id, type, reason, and the type-specific fields'
            : '',
        phase === 'edit'
            ? '- preferred edit order: remove framing noise, drop blank rows, promote the true header, then reshape only if still wide'
            : '',
        phase === 'edit'
            ? `- operation contracts:\n${operationContractSummary}`
            : '',
        '',
        '**phase context**',
        phaseContextPreview,
        '',
        '**report_context.json preview**',
        reportContextPreview || '(not available)',
        '',
        '**raw.csv preview**',
        rawPreview || '(empty)',
        '',
        '**cleaned.csv preview**',
        cleanedPreview || '(empty)',
        '',
        '**recent workspace actions**',
        recentActions || 'No prior workspace actions.',
        '',
        selfCorrectionFeedback ? `**runtime correction**\n${selfCorrectionFeedback}` : '',
        '**output rule**',
        'Return native tool/function calls only. Do not wrap tools in ad-hoc JSON envelopes.',
    ].filter(Boolean).join('\n');

    return { systemPrompt, userPrompt };
};

