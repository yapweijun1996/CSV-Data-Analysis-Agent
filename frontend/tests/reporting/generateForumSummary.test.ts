// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalystMemo, ReportEvidenceBundle, Settings } from '../../types';
import { generateForumSummary } from '../../services/reporting/generateForumSummary';

const {
    createProviderModelMock,
    generateTextMock,
    isProviderConfiguredMock,
    jsonSchemaMock,
    outputObjectMock,
} = vi.hoisted(() => ({
    createProviderModelMock: vi.fn(() => ({ model: { provider: 'google', modelId: 'gemini-3-flash-preview' } })),
    generateTextMock: vi.fn(),
    isProviderConfiguredMock: vi.fn(() => true),
    jsonSchemaMock: vi.fn((schema: unknown) => schema),
    outputObjectMock: vi.fn((options: unknown) => options),
}));

vi.mock('ai', () => ({
    generateText: generateTextMock,
    streamText: vi.fn((...args: unknown[]) => {
        const result = generateTextMock(...args);
        return {
            fullStream: (async function* () {})(),
            text: result.then((r: { text?: string }) => r.text ?? ''),
            finishReason: Promise.resolve('stop'),
            output: result.then((r: { output?: unknown }) => r.output),
        };
    }),
    Output: {
        object: outputObjectMock,
    },
    jsonSchema: jsonSchemaMock,
}));

vi.mock('../../services/ai/providerConfig', () => ({
    createProviderModel: createProviderModelMock,
    isProviderConfigured: isProviderConfiguredMock,
    validateProviderHealth: () => Promise.resolve({ status: 'healthy', checkedAt: new Date().toISOString() }),
    invalidateProviderHealthCache: () => {},
}));

const settings: Settings = {
    provider: 'google',
    geminiApiKey: 'key',
    openAIApiKey: '',
    simpleModel: 'gemini-3-flash-preview',
    complexModel: 'gemini-3-flash-preview',
    language: 'English',
    reportTemplate: 'management_review',
    autoConfirmGoal: true,
    runtimeAccessControl: {
        permissionMode: 'open',
        toolOverrides: {},
        workspaceRules: {
            deniedPathPrefixes: [],
        },
    },
};

const createBundle = (): ReportEvidenceBundle => ({
    generatedAt: '2026-03-14T09:00:00.000Z',
    sessionId: 'session-1',
    datasetId: 'dataset-1',
    currentView: 'analysis_dashboard',
    dataset: {
        fileName: 'sales.csv',
        reportTitle: 'Executive Revenue Report',
        rawRowCount: 12,
        cleanedRowCount: 10,
        metadataRowCount: 2,
        headerDepth: 1,
        summaryRowCount: 1,
        parserStrategy: 'scored_candidate',
        parserConfidence: 'high',
        intakeGateStatus: 'warning',
        preparationState: 'baseline_prepared',
        analysisState: 'ready',
        reportReadiness: 'ready',
        reportReadinessReason: 'Ready for bounded analyst synthesis with no material structural or workflow caveats detected.',
        readinessDrivers: [
            'Trusted analysis cards exist (2).',
            'Parser confidence is high.',
        ],
        readinessRisks: [],
        structuralSignals: {
            rowExpansionRatio: 0.8,
            hasMetadataRows: false,
            hasMultiRowHeader: false,
            usedFallbackContext: false,
        },
        trustedCardsCount: 2,
        reportGenerationGate: 'allowed',
        reportGenerationBlockers: [],
        canAnalyze: true,
        cardsCount: 2,
        caveats: [],
    },
    workflow: {
        topWarnings: ['One helper column remains unverified.'],
        issueMappings: [],
        verification: {
            emptyDatasetGuardPassed: true,
            datasetSafetyStatus: 'passed',
            cleaningConsistencyStatus: 'passed',
            overallStatus: 'passed',
            downstreamAnalysisBlocked: false,
            warnings: ['SQL precheck used a fallback path.'],
            sqlPrecheckStatus: 'passed',
            sqlPrecheckSummary: 'SQL precheck passed with one caution.',
            sqlPrecheckBlockingFindings: [],
            shapeFailureSignalKey: null,
            shapeFailureDetail: null,
            failedChecks: [],
            schemaSummary: 'Revenue casted to number.',
            shapeVerification: null,
        },
        diff: {
            rowCountBefore: 12,
            rowCountAfter: 10,
            rowCountDelta: -2,
            addedColumns: ['Margin'],
            removedColumns: [],
            changedColumns: [{ name: 'Revenue', before: 'string', after: 'number' }],
        },
    },
    summaries: {
        coreAnalysisSummary: { language: 'English', text: 'Revenue is concentrated in the East region.' },
        finalSummary: { language: 'English', text: 'East and West account for most of the observed revenue.' },
        contextualSummary: 'Prepared for quarterly revenue review.',
    },
    query: {
        hasActiveQuery: true,
        explanation: 'Focused on revenue rows after cleanup.',
        sqlPreview: 'select Region, sum(Revenue) from cleaned group by 1',
        engine: 'duckdb',
        totalMatchedRows: 10,
        returnedRows: 2,
        selectedColumns: ['Region', 'Revenue'],
    },
    cards: [
        {
            evidenceId: 'card.card-1',
            cardId: 'card-1',
            title: 'Revenue by Region',
            displayTitle: 'Revenue by Region',
            description: 'Compare total revenue by region.',
            artifactType: null,
            chartType: 'bar',
            groupByColumn: 'Region',
            valueColumn: 'Revenue',
            aggregation: 'sum',
            rowCount: 4,
            summary: { language: 'English', text: 'East region leads revenue.' },
            aggregatedDataSample: [{ Region: 'East', Revenue: 1200 }],
            reportChartRows: [{ Region: 'East', Revenue: 1200 }, { Region: 'West', Revenue: 900 }],
            semanticRole: 'business_dimension',
            helperExposureLevel: 'none',
            businessMeaningConfidence: 0.92,
            aggregationQualityFlags: [],
            isFallback: false,
        },
        {
            evidenceId: 'card.card-2',
            cardId: 'card-2',
            title: 'Margin by Region',
            displayTitle: 'Margin by Region',
            description: 'Compare total margin by region.',
            artifactType: null,
            chartType: 'line',
            groupByColumn: 'Region',
            valueColumn: 'Margin',
            aggregation: 'sum',
            rowCount: 4,
            summary: { language: 'English', text: 'Margin follows the same concentration pattern.' },
            aggregatedDataSample: [{ Region: 'East', Margin: 320 }],
            reportChartRows: [{ Region: 'East', Margin: 320 }, { Region: 'West', Margin: 210 }],
            semanticRole: 'business_dimension',
            helperExposureLevel: 'none',
            businessMeaningConfidence: 0.81,
            aggregationQualityFlags: [],
            isFallback: false,
        },
    ],
    allCards: [],
    includedCardIds: ['card-1', 'card-2'],
    excludedCardIds: [],
    excludedEvidence: [],
    evidenceCatalog: [
        { id: 'dataset.context', kind: 'dataset', label: 'Dataset Context', source: 'derived', detail: 'Executive Revenue Report | 12 raw row(s) -> 10 cleaned row(s)' },
        { id: 'dataset.readiness', kind: 'dataset', label: 'Dataset Readiness', source: 'derived', detail: 'ready | 2 card(s)' },
        { id: 'workflow.preparation', kind: 'workflow', label: 'Preparation Workflow', source: 'derived', detail: 'prepared_with_warnings | 1 issue mapping(s) | 2 card(s)' },
        { id: 'workflow.verification', kind: 'workflow', label: 'Verification Status', source: 'derived', detail: 'overall=warning | sql=warning | blocked=no' },
        { id: 'summary.core', kind: 'summary', label: 'Core Analysis Summary', source: 'state', detail: 'Revenue is concentrated in the East region.' },
        { id: 'summary.final', kind: 'summary', label: 'Final Summary', source: 'state', detail: 'East and West account for most of the observed revenue.' },
        { id: 'query.active', kind: 'query', label: 'Active Data Query', source: 'state', detail: 'duckdb query | 2/10 row(s)' },
        { id: 'card.card-1', kind: 'card', label: 'Revenue by Region', source: 'state', detail: 'chart | 4 row(s)' },
        { id: 'card.card-2', kind: 'card', label: 'Margin by Region', source: 'state', detail: 'chart | 4 row(s)' },
    ],
});

const createMemos = (): AnalystMemo[] => ([
    {
        role: 'data_quality',
        headline: 'Dataset is usable with caveats',
        summary: 'Preparation is stable but one helper column remains unverified.',
        findings: [
            {
                id: 'dq-1',
                claim: 'The cleaned dataset is analyzable.',
                importance: 'high',
                evidenceRefs: ['dataset.readiness', 'workflow.verification'],
                metricRefs: [],
                caveat: 'One helper column remains unverified.',
            },
        ],
        blockers: [],
        caveats: ['One helper column remains unverified.'],
        confidence: 'medium',
        recommendedNextChecks: ['Confirm whether the helper column affects exported report labels.'],
    },
    {
        role: 'business',
        headline: 'Commercial concentration is visible',
        summary: 'Revenue and margin are concentrated in the East region.',
        findings: [
            {
                id: 'biz-1',
                claim: 'East region leads revenue and margin.',
                importance: 'high',
                evidenceRefs: ['card.card-1', 'card.card-2', 'summary.core'],
                metricRefs: ['Revenue', 'Margin'],
            },
        ],
        blockers: [],
        caveats: [],
        confidence: 'high',
        recommendedNextChecks: ['Validate whether East concentration persists against the previous period.'],
    },
    {
        role: 'risk',
        headline: 'Conclusions should stay bounded',
        summary: 'Business concentration is visible, but verification warnings still limit certainty.',
        findings: [
            {
                id: 'risk-1',
                claim: 'Warnings reduce confidence in a fully definitive report.',
                importance: 'high',
                evidenceRefs: ['workflow.verification', 'dataset.readiness'],
                metricRefs: [],
                caveat: 'SQL precheck used a fallback path.',
            },
        ],
        blockers: ['Do not overstate the strength of the conclusions before warning review.'],
        caveats: ['SQL precheck used a fallback path.'],
        confidence: 'medium',
        recommendedNextChecks: ['Review the fallback SQL precheck warning before export.'],
    },
]);

describe('generateForumSummary', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        isProviderConfiguredMock.mockReturnValue(true);
    });

    it('returns a deterministic fallback summary when no provider is configured', async () => {
        isProviderConfiguredMock.mockReturnValue(false);

        const forum = await generateForumSummary(createMemos(), createBundle(), settings);

        expect(generateTextMock).not.toHaveBeenCalled();
        expect(forum.consensusFindings.length).toBeGreaterThan(0);
        expect(forum.recommendedActions).toContain('Forum summary fallback used: No model provider is configured.');
        expect(forum.overallConfidence).toBe('medium');
    });

    it('sanitizes AI output against memo roles and the evidence catalog', async () => {
        generateTextMock.mockResolvedValue({
            output: {
                consensusFindings: [
                    {
                        id: 'forum-1',
                        claim: 'East region concentration is the leading business signal.',
                        supportedByRoles: ['business', 'risk', 'unknown'],
                        evidenceRefs: ['card.card-1', 'unknown.ref'],
                        caveats: ['One helper column remains unverified.'],
                    },
                ],
                disagreements: [
                    {
                        id: 'dis-1',
                        topic: 'How definitive the report can be',
                        positions: [
                            {
                                role: 'business',
                                stance: 'The card set is sufficient for an executive draft.',
                                evidenceRefs: ['card.card-1', 'summary.final'],
                            },
                            {
                                role: 'risk',
                                stance: 'Warnings still require explicit caveat language.',
                                evidenceRefs: ['workflow.verification', 'missing.ref'],
                            },
                        ],
                        resolution: 'partially_resolved',
                    },
                ],
                overallConfidence: 'high',
                executiveSummary: 'Strong commercial signal exists, but warning-aware wording should remain.',
                recommendedActions: [
                    'Draft the report with explicit caveat language.',
                    'Review the fallback SQL precheck warning before export.',
                ],
            },
            text: '',
        });

        const forum = await generateForumSummary(createMemos(), createBundle(), settings);

        expect(forum.consensusFindings[0]).toEqual(expect.objectContaining({
            supportedByRoles: ['business', 'risk'],
            evidenceRefs: ['card.card-1'],
        }));
        expect(forum.disagreements[0]?.positions[1]).toEqual(expect.objectContaining({
            role: 'risk',
            evidenceRefs: ['workflow.verification'],
        }));
        expect(forum.overallConfidence).toBe('high');
    });

    it('parses markdown JSON responses and wires memos plus evidence into the prompt', async () => {
        generateTextMock.mockResolvedValue({
            output: undefined,
            text: `\`\`\`json
{"consensusFindings":[{"id":"forum-1","claim":"East region concentration is visible.","supportedByRoles":["business"],"evidenceRefs":["card.card-1","summary.core"],"caveats":[]}],"disagreements":[],"overallConfidence":"medium","executiveSummary":"The card set supports one leading regional concentration finding.","recommendedActions":["Validate whether East concentration persists against the previous period."]}
\`\`\``,
        });

        const forum = await generateForumSummary(createMemos(), createBundle(), settings);

        expect(forum.consensusFindings[0]?.evidenceRefs).toEqual(['card.card-1', 'summary.core']);

        const request = generateTextMock.mock.calls[0]?.[0] as { messages: Array<{ role: string; content: string }> };
        expect(request.messages[0]?.content).toContain('bounded forum aggregator');
        expect(request.messages[1]?.content).toContain('"role": "data_quality"');
        expect(request.messages[1]?.content).toContain('"role": "business"');
        expect(request.messages[1]?.content).toContain('"id": "workflow.verification"');
        expect(request.messages[1]?.content).toContain('"id": "card.card-1"');
    });

    it('falls back cleanly and does not mutate memos or bundle when generation throws', async () => {
        const bundle = createBundle();
        const memos = createMemos();
        const beforeBundle = JSON.stringify(bundle);
        const beforeMemos = JSON.stringify(memos);
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        generateTextMock.mockRejectedValue(new Error('Synthetic forum failure'));

        const forum = await generateForumSummary(memos, bundle, settings);

        consoleErrorSpy.mockRestore();
        expect(JSON.stringify(bundle)).toBe(beforeBundle);
        expect(JSON.stringify(memos)).toBe(beforeMemos);
        expect(forum.executiveSummary).toContain('deterministic fallback');
        expect(forum.recommendedActions).toContain('Forum summary fallback used: Synthetic forum failure');
    });
});
