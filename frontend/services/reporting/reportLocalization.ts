import type { Settings } from '../../types';

export const getShellText = (language: Settings['language'] | undefined) => {
    if (language === 'Mandarin') {
        return {
            viewer: '分析报告查看器',
            exportPdf: '导出 PDF',
            close: '关闭',
            preparedBy: '由 AI 分析生成',
            reportId: '报告 ID',
            readiness: '可交付性',
            confidence: '置信度',
            generated: '生成时间',
            documentMap: '文档导航',
            contents: '目录',
            managementSummary: '管理摘要',
            overallPosition: '总体结论',
            topBusinessImplication: '主要业务含义',
            mainCaution: '主要注意事项',
            deliveryReadiness: '交付就绪度',
            whyThisRating: '为何是这个评级',
            support: '支持信号',
            risks: '风险信号',
            structuralRiskSignals: '结构性风险信号',
            boardSnapshot: '管理层快照',
            kpiSnapshot: 'KPI 快照',
            decisionEvidence: '决策证据',
            keyFindings: '关键发现',
            decisionGuardrails: '风险与限制',
            recommendedActions: '建议动作',
            whatToDoNext: '下一步',
            traceability: '可追溯性',
            whatItShows: '图表说明',
            whyItMatters: '业务意义',
            caveat: '注意事项',
            openQuestions: '未决分歧',
            appendixHighlights: '附录亮点',
            evidenceCatalog: '证据目录',
            excludedEvidence: '已排除证据',
            warningBannerTitle: '此报告可生成，但必须带风险提示使用。',
            warningBannerPrefix: '生成原因',
            excludedCount: '已排除证据数',
            keyFinding: '关键发现',
            dataTable: '数据表',
            chart: '图表',
            evidenceReferences: '证据引用数',
            topExcludedItem: '主要排除项',
            preparationVerification: '准备与校验',
            workflowStatus: '工作流状态',
            datasetShape: '数据形态',
            generationBlockers: '生成阻塞项',
            primaryVisualSupport: '该数值来自当前选用图表中的主要指标。',
            supportingDetailAvailable: '更具体的说明已在下方关键发现中呈现。',
            emptyFindings: '当前证据不足以生成具体发现。请添加更多分析卡片或运行更多查询以丰富证据。',
            emptyRisks: '未发现明确的风险或限制条件。',
            emptyActions: '当前没有建议的后续操作。',
        };
    }

    return {
        viewer: 'Analyst Report Viewer',
        exportPdf: 'Export PDF',
        close: 'Close',
        preparedBy: 'Prepared by AI Analysis',
        reportId: 'Report ID',
        readiness: 'Readiness',
        confidence: 'Confidence',
        generated: 'Generated',
        documentMap: 'Document Map',
        contents: 'Contents',
        managementSummary: 'Management Summary',
        overallPosition: 'Overall Position',
        topBusinessImplication: 'Top Business Implication',
        mainCaution: 'Main Caution',
        deliveryReadiness: 'Delivery Readiness',
        whyThisRating: 'Why this rating',
        support: 'Support',
        risks: 'Risks',
        structuralRiskSignals: 'Structural risk signals',
        boardSnapshot: 'Board Snapshot',
        kpiSnapshot: 'KPI Snapshot',
        decisionEvidence: 'Decision Evidence',
        keyFindings: 'Key Findings',
        decisionGuardrails: 'Decision Guardrails',
        recommendedActions: 'Recommended Actions',
        whatToDoNext: 'What To Do Next',
        traceability: 'Traceability',
        whatItShows: 'What it shows',
        whyItMatters: 'Why it matters',
        caveat: 'Caveat',
        openQuestions: 'Open Questions',
        appendixHighlights: 'Appendix Highlights',
        evidenceCatalog: 'Evidence Catalog',
        excludedEvidence: 'Excluded Evidence',
        warningBannerTitle: 'This report is deliverable only with explicit caveats.',
        warningBannerPrefix: 'Generation reason',
        excludedCount: 'Excluded evidence',
        keyFinding: 'Key Finding',
        dataTable: 'Data table',
        chart: 'Chart',
        evidenceReferences: 'Evidence references',
        topExcludedItem: 'Top excluded item',
        preparationVerification: 'Preparation & Verification',
        workflowStatus: 'Workflow status',
        datasetShape: 'Dataset shape',
        generationBlockers: 'Generation blockers',
        primaryVisualSupport: 'Primary value highlighted by the selected visual.',
        supportingDetailAvailable: 'Supporting detail is summarized in the finding cards below.',
        emptyFindings: 'Not enough evidence to produce specific findings. Add more analysis cards or run additional queries to strengthen the evidence base.',
        emptyRisks: 'No explicit risks or caveats were identified.',
        emptyActions: 'No recommended follow-up actions at this time.',
    };
};

export type ShellText = ReturnType<typeof getShellText>;

export const REASON_CODE_LABELS: Record<string, string> = {
    narrative_ineligible: 'Not suitable for narrative reporting',
    helper_exposure: 'Contains helper/system columns',
    low_business_confidence: 'Low business meaning confidence',
    aggregation_quality_warning: 'Aggregation quality concern',
    fallback_plan: 'Generated from fallback plan',
};

export const humanizeReasonCode = (code: string): string =>
    REASON_CODE_LABELS[code] ?? titleCase(code.replace(/_/g, ' '));

const titleCase = (value: string): string =>
    value
        .split(/[_\s]+/)
        .filter(Boolean)
        .map(token => token.charAt(0).toUpperCase() + token.slice(1))
        .join(' ');
