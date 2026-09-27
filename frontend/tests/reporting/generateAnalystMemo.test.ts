// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReportEvidenceBundle, Settings } from '../../types';
import { analystRoles } from '../../services/reporting/analystRoles';
import { generateAnalystMemo } from '../../services/reporting/generateAnalystMemo';

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

describe('generateAnalystMemo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        isProviderConfiguredMock.mockReturnValue(true);
    });

    it('locks the MVP roster to exactly three analyst roles', () => {
        expect(analystRoles).toEqual(['data_quality', 'business', 'risk']);
    });

    it('returns a deterministic fallback memo when no provider is configured', async () => {
        isProviderConfiguredMock.mockReturnValue(false);

        const memo = await generateAnalystMemo('data_quality', createBundle(), settings);

        expect(generateTextMock).not.toHaveBeenCalled();
        expect(memo.role).toBe('data_quality');
        expect(memo.headline).toContain('bounded fallback memo');
        expect(memo.blockers).toContain('Memo generation fallback used: No model provider is configured.');
        expect(memo.findings[0]?.evidenceRefs).toEqual([
            'dataset.context',
            'dataset.readiness',
            'workflow.preparation',
            'workflow.verification',
        ]);
    });

    it('sanitizes AI output against the evidence catalog and preserves the requested role', async () => {
        generateTextMock.mockResolvedValue({
            output: {
                role: 'business',
                headline: 'Commercial signal is strong',
                summary: 'Revenue concentration is visible in the trusted card set.',
                findings: [
                    {
                        id: 'finding-1',
                        claim: 'East leads revenue.',
                        importance: 'high',
                        evidenceRefs: ['card.card-1', 'unknown.ref'],
                        metricRefs: ['Revenue', 'Revenue'],
                    },
                    {
                        id: '',
                        claim: 'Warnings still limit final confidence.',
                        importance: 'medium',
                        evidenceRefs: [],
                        metricRefs: [],
                        caveat: 'Verification still shows warnings.',
                    },
                ],
                blockers: ['Need finance sign-off.'],
                caveats: ['One helper column remains unverified.'],
                confidence: 'high',
                recommendedNextChecks: ['Review the East region variance against prior period.'],
            },
            text: '',
        });

        const memo = await generateAnalystMemo('risk', createBundle(), settings);

        expect(memo.role).toBe('risk');
        expect(memo.findings).toHaveLength(2);
        expect(memo.findings[0]).toEqual(expect.objectContaining({
            id: 'finding-1',
            evidenceRefs: ['card.card-1'],
            metricRefs: ['Revenue'],
        }));
        expect(memo.findings[1]?.id).toBe('risk.finding.2');
        expect(memo.findings[1]?.evidenceRefs).toEqual([
            'dataset.context',
            'dataset.readiness',
            'workflow.verification',
            'workflow.preparation',
        ]);
        expect(memo.caveats).toContain('One helper column remains unverified.');
    });

    it('parses markdown JSON responses and wires the evidence bundle into the prompt', async () => {
        generateTextMock.mockResolvedValue({
            output: undefined,
            text: `\`\`\`json
{"role":"business","headline":"Topline growth is concentrated","summary":"The trusted card set points to one leading region.","findings":[{"id":"biz-1","claim":"East region leads revenue.","importance":"high","evidenceRefs":["card.card-1","summary.core"],"metricRefs":["Revenue","Region"]}],"blockers":[],"caveats":[],"confidence":"medium","recommendedNextChecks":["Check whether margin concentration mirrors revenue concentration."]}
\`\`\``,
        });

        const memo = await generateAnalystMemo('business', createBundle(), settings);

        expect(memo.role).toBe('business');
        expect(memo.findings[0]?.evidenceRefs).toEqual(['card.card-1', 'summary.core']);

        const request = generateTextMock.mock.calls[0]?.[0] as { messages: Array<{ role: string; content: string }> };
        expect(request.messages[0]?.content).toContain('Business Analyst');
        expect(request.messages[1]?.content).toContain('"id": "dataset.readiness"');
        expect(request.messages[1]?.content).toContain('"id": "card.card-1"');
        expect(request.messages[1]?.content).toContain('"displayTitle": "Revenue by Region"');
        expect(request.messages[1]?.content).toContain('Return a single JSON object matching the provided schema.');
    });

    it('fails cleanly with a fallback memo and does not mutate the bundle when generation throws', async () => {
        const bundle = createBundle();
        const before = JSON.stringify(bundle);
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        generateTextMock.mockRejectedValue(new Error('Synthetic provider failure'));

        const memo = await generateAnalystMemo('business', bundle, settings);

        consoleErrorSpy.mockRestore();
        expect(JSON.stringify(bundle)).toBe(before);
        expect(memo.role).toBe('business');
        expect(memo.blockers).toContain('Memo generation fallback used: Synthetic provider failure');
        expect(memo.findings[0]?.claim).toContain('trusted analysis card');
    });
});
