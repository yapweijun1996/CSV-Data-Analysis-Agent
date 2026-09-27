// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppStore } from '../../store/useAppStore';
import { buildReportEvidenceBundle } from '../../services/reporting/buildReportEvidenceBundle';
import {
    buildAnalysisArtifactProvenance,
    buildNarrativeArtifactProvenance,
} from '../../services/agent/artifactProvenance';

const createLocalizedText = (text: string) => ({
    language: 'English' as const,
    text,
});

const createBaseState = (): AppStore => ({
    sessionId: 'session-1',
    currentView: 'analysis_dashboard',
    currentDatasetId: 'dataset-1',
    settings: {
        provider: 'google',
        geminiApiKey: 'key',
        openAIApiKey: '',
        simpleModel: 'gemini-3-flash-preview',
        complexModel: 'gemini-3-flash-preview',
        language: 'English',
        autoConfirmGoal: true,
    },
    csvData: {
        fileName: 'sales.csv',
        data: [
            { Region: 'East', Revenue: 1200 },
            { Region: 'West', Revenue: 900 },
        ],
        metadataRows: [['Revenue Report']],
        summaryRows: [{ Region: 'Total', Revenue: 2100 }],
        headerDepth: 1,
    },
    rawCsvData: {
        fileName: 'sales.csv',
        data: [
            { Region: 'East', Revenue: '1200' },
            { Region: 'West', Revenue: '900' },
        ],
        metadataRows: [['Revenue Report']],
        summaryRows: [{ Region: 'Total', Revenue: '2100' }],
        headerDepth: 1,
        intakeDetection: {
            strategy: 'scored_candidate',
            confidence: 'high',
            delimiter: ',',
            quoteChar: '"',
            warnings: [],
            candidateCount: 3,
            parserErrorCount: 0,
            sampledNonEmptyLines: 2,
            topScore: 1,
            runnerUpScore: 0.25,
        },
    },
    columnProfiles: [
        { name: 'Region', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
        { name: 'Revenue', type: 'numerical', missingPercentage: 0, valueRange: [900, 1200] },
    ],
    dataPreparationPlan: {
        explanation: 'Normalized revenue and preserved only analysis-ready rows.',
        operations: [
            {
                id: 'op-1',
                type: 'cast_column',
                reason: 'Cast Revenue to number.',
                column: 'Revenue',
                asType: 'number',
            },
        ],
        outputColumns: [
            { name: 'Region', type: 'categorical' },
            { name: 'Revenue', type: 'numerical' },
        ],
        planStatus: 'operations',
        consistencyIssues: [],
    },
    reportContextResolution: {
        aiExtracted: null,
        fallback: {
            sourceFile: 'sales.csv',
            reportTitle: 'Fallback Title',
            parameterLines: [],
            footerLines: [],
            candidateHeaderLine: ['Region', 'Revenue'],
            notes: ['Fallback note'],
            source: 'fallback',
            confidence: null,
        },
        effective: {
            sourceFile: 'sales.csv',
            reportTitle: 'Executive Revenue Report',
            parameterLines: ['Period: FY2026'],
            footerLines: ['Prepared for finance'],
            candidateHeaderLine: ['Region', 'Revenue'],
            notes: ['Report title validated from metadata', 'Report title validated from metadata'],
            source: 'fallback',
            confidence: null,
        },
    },
    analysisCards: [],
    aiCoreAnalysisSummary: null,
    finalSummary: null,
    contextualSummary: null,
    activeDataQuery: null,
    activeSpreadsheetFilter: null,
    spreadsheetFilterFunction: null,
    aiFilterExplanation: null,
    agentEvents: [
        {
            id: 'schema-before',
            timestamp: new Date('2026-03-10T00:00:00.000Z'),
            phase: 'file',
            step: 'schema_snapshot_before',
            status: 'done',
            message: 'Captured schema before preparation.',
            detail: {
                schema: [
                    { name: 'Region', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                    { name: 'Revenue', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                ],
            },
        },
        {
            id: 'profile-complete',
            timestamp: new Date('2026-03-10T00:00:01.000Z'),
            phase: 'profiling',
            step: 'profiling_complete',
            status: 'done',
            message: 'Profiled columns.',
            detail: {
                issues: ['Low confidence note from profiling.', 'Low confidence note from profiling.'],
            },
        },
        {
            id: 'column-evaluation',
            timestamp: new Date('2026-03-10T00:00:02.000Z'),
            phase: 'profiling',
            step: 'column_evaluation',
            status: 'done',
            message: 'Evaluated columns.',
            detail: {
                keepColumns: [{ name: 'Region', role: 'dimension' }],
                dropColumns: [],
            },
        },
        {
            id: 'schema-after',
            timestamp: new Date('2026-03-10T00:00:03.000Z'),
            phase: 'profiling',
            step: 'schema_snapshot_after',
            status: 'done',
            message: 'Captured schema after preparation.',
            detail: {
                schema: [
                    { name: 'Region', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
                    { name: 'Revenue', type: 'numerical', uniqueValues: 2, missingPercentage: 0, valueRange: [900, 1200] },
                ],
            },
        },
    ] as AppStore['agentEvents'],
    agentToolLogs: [],
    telemetryEvents: [],
    chatHistory: [],
    dataQualityIssues: [
        'Review helper columns.',
        'Review helper columns.',
        'Check metadata notes.',
        'Validate reporting parameters.',
        'Confirm currency assumptions.',
        'Inspect summary row handling.',
        'Review category mapping.',
        'Check outlier handling.',
        'Review export notes.',
    ],
    initialDataSample: [
        { Region: 'East', Revenue: '1200' },
        { Region: 'West', Revenue: '900' },
    ],
    isGeneratingReport: false,
    reportGenerationProgress: null,
} as unknown as AppStore);

const createCard = (id: string, title: string) => {
    const plan = {
        chartType: 'bar' as const,
        title,
        description: `${title} description`,
        aggregation: 'sum' as const,
        groupByColumn: 'Region',
        valueColumn: 'Revenue',
    };
    return {
    id,
    plan,
    aggregatedData: [
        { Region: 'East', Revenue: 1200 },
        { Region: 'West', Revenue: 900 },
        { Region: 'North', Revenue: 800 },
        { Region: 'South', Revenue: 700 },
        { Region: 'Central', Revenue: 650 },
        { Region: 'APAC', Revenue: 600 },
        { Region: 'EMEA', Revenue: 550 },
        { Region: 'LATAM', Revenue: 500 },
        { Region: 'Other', Revenue: 450 },
    ],
    summary: createLocalizedText(`${title} summary`),
    displayChartType: 'bar' as const,
    isDataVisible: true,
    topN: null,
    hideOthers: false,
    sourceTopic: null,
    autoAnalysisEvaluation: null,
    provenance: buildAnalysisArtifactProvenance(plan, createBaseState(), {
        now: '2026-03-10T00:00:00.000Z',
    }),
    };
};

const createAnalystReadyState = (): AppStore => {
    const state = createBaseState();
    state.csvData = {
        ...state.csvData!,
        metadataRows: [],
        summaryRows: [],
    };
    state.rawCsvData = {
        ...state.rawCsvData!,
        metadataRows: [],
        summaryRows: [],
        headerDepth: 1,
        intakeDetection: {
            ...state.rawCsvData!.intakeDetection!,
            confidence: 'high',
            warnings: [],
        },
    };
    state.reportContextResolution = {
        aiExtracted: {
            reportTitle: 'Executive Revenue Report',
            reportDescription: 'Executive revenue report by region.',
            parameterLines: [],
            footerLines: [],
            candidateHeaderLine: ['Region', 'Revenue'],
            confidence: 'high',
            reasoning: 'Validated directly from the report header.',
        },
        fallback: {
            sourceFile: 'sales.csv',
            reportTitle: 'Executive Revenue Report',
            reportDescription: null,
            parameterLines: [],
            footerLines: [],
            candidateHeaderLine: ['Region', 'Revenue'],
            notes: [],
            source: 'fallback',
            confidence: null,
        },
        effective: {
            sourceFile: 'sales.csv',
            reportTitle: 'Executive Revenue Report',
            reportDescription: 'Executive revenue report by region.',
            parameterLines: [],
            footerLines: [],
            candidateHeaderLine: ['Region', 'Revenue'],
            notes: [],
            source: 'ai',
            confidence: 'high',
        },
        verification: {
            passed: true,
            usedFallback: false,
            reason: null,
            aiConfidence: 'high',
            issues: [],
        },
        generatedAt: '2026-03-10T00:00:00.000Z',
    };
    state.dataPreparationPlan = {
        ...state.dataPreparationPlan!,
        sqlPrecheck: {
            status: 'passed',
            summary: 'SQL precheck passed.',
            findings: [],
        },
    };
    state.agentEvents = state.agentEvents.map(event =>
        event.step === 'profiling_complete'
            ? {
                ...event,
                detail: {
                    issues: [],
                },
            }
            : event
    ) as AppStore['agentEvents'];
    return state;
};

afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../services/dashboard/displayAnalysisIr');
});

describe('buildReportEvidenceBundle', () => {
    it('returns null when no raw or cleaned dataset exists', () => {
        const bundle = buildReportEvidenceBundle({
            sessionId: 'session-1',
            currentView: 'file_upload',
            currentDatasetId: null,
            csvData: null,
            rawCsvData: null,
        } as unknown as AppStore);

        expect(bundle).toBeNull();
    });

    it('returns blocked readiness when intake gate is blocked', () => {
        const state = createBaseState();
        state.rawCsvData = {
            ...state.rawCsvData!,
            intakeDetection: {
                ...state.rawCsvData!.intakeDetection!,
                warnings: [
                    {
                        code: 'parse_errors',
                        message: 'Parser reported 2 issues while evaluating the selected CSV dialect.',
                    },
                ],
            },
        };

        const bundle = buildReportEvidenceBundle(state);

        expect(bundle?.dataset.reportReadiness).toBe('blocked');
        expect(bundle?.dataset.reportReadinessReason).toContain('Automatic analysis is paused');
    });

    it('returns partial readiness when dataset is analyzable but has no cards', () => {
        const bundle = buildReportEvidenceBundle(createAnalystReadyState());

        expect(bundle?.dataset.reportReadiness).toBe('partial');
        expect(bundle?.dataset.reportReadinessReason).toBe('Usable for bounded synthesis inputs, but trusted analysis cards are still missing.');
        expect(bundle?.dataset.readinessRisks).toContain('Trusted analysis cards are not available yet.');
        expect(bundle?.dataset.reportGenerationGate).toBe('blocked');
        expect(bundle?.dataset.reportGenerationBlockers).toEqual(['No trusted report evidence cards qualified for analyst reporting.']);
    });

    it('returns ready readiness when analyzable dataset has cards', () => {
        const state = createAnalystReadyState();
        state.analysisCards = [createCard('card-1', 'Revenue by Region')] as AppStore['analysisCards'];

        const bundle = buildReportEvidenceBundle(state);

        expect(bundle?.dataset.reportReadiness).toBe('ready');
        expect(bundle?.dataset.reportReadinessReason).toBe('Ready for bounded analyst synthesis with no material structural or workflow caveats detected.');
        expect(bundle?.dataset.readinessDrivers).toContain('Trusted analysis cards exist (1).');
        expect(bundle?.dataset.readinessRisks).toHaveLength(0);
        expect(bundle?.dataset.reportGenerationGate).toBe('allowed');
        expect(bundle?.dataset.trustedCardsCount).toBe(1);
        expect(bundle?.includedCardIds).toEqual(['card-1']);
        expect(bundle?.excludedCardIds).toEqual([]);
    });

    it('uses the effective report title from report context', () => {
        const bundle = buildReportEvidenceBundle(createBaseState());

        expect(bundle?.dataset.reportTitle).toBe('Executive Revenue Report');
    });

    it('dedupes caveats and limits them', () => {
        const state = createBaseState();
        state.rawCsvData = {
            ...state.rawCsvData!,
            intakeDetection: {
                ...state.rawCsvData!.intakeDetection!,
                confidence: 'low',
                warnings: [
                    {
                        code: 'low_confidence',
                        message: 'CSV dialect detection confidence is limited.',
                    },
                ],
            },
        };

        const bundle = buildReportEvidenceBundle(state);

        expect(bundle?.dataset.caveats.length).toBeLessThanOrEqual(8);
        expect(bundle?.dataset.caveats.some(caveat => /confidence/i.test(caveat))).toBe(true);
        expect(new Set(bundle?.dataset.caveats).size).toBe(bundle?.dataset.caveats.length);
    });

    it('returns blocked readiness when dataset safety fails', () => {
        const state = createAnalystReadyState();
        state.csvData = {
            ...state.csvData!,
            data: [],
        };

        const bundle = buildReportEvidenceBundle(state);

        expect(bundle?.dataset.reportReadiness).toBe('blocked');
        expect(bundle?.dataset.reportReadinessReason).toBe('Not ready for analyst synthesis because dataset safety checks failed.');
    });

    it('returns blocked readiness when SQL precheck blocks analysis', () => {
        const state = createAnalystReadyState();
        state.dataPreparationPlan = {
            ...state.dataPreparationPlan!,
            sqlPrecheck: {
                status: 'blocked',
                summary: 'SQL precheck blocked automatic analysis.',
                findings: [
                    {
                        kind: 'no_viable_candidates',
                        severity: 'block',
                        message: 'No viable metric and dimension combinations remain.',
                    },
                ],
            },
        };

        const bundle = buildReportEvidenceBundle(state);

        expect(bundle?.dataset.reportReadiness).toBe('blocked');
        expect(bundle?.dataset.reportReadinessReason).toBe('SQL precheck blocked automatic analysis.');
    });

    it('returns partial readiness when parser confidence is limited even with cards', () => {
        const state = createAnalystReadyState();
        state.analysisCards = [createCard('card-1', 'Revenue by Region')] as AppStore['analysisCards'];
        state.rawCsvData = {
            ...state.rawCsvData!,
            intakeDetection: {
                ...state.rawCsvData!.intakeDetection!,
                confidence: 'low',
                warnings: [
                    {
                        code: 'low_confidence',
                        message: 'CSV dialect detection confidence is limited.',
                    },
                ],
            },
        };

        const bundle = buildReportEvidenceBundle(state);

        expect(bundle?.dataset.reportReadiness).toBe('partial');
        expect(bundle?.dataset.readinessRisks).toContain('Parser confidence is limited.');
    });

    it('returns partial readiness when workflow warnings remain unresolved', () => {
        const state = createAnalystReadyState();
        state.analysisCards = [createCard('card-1', 'Revenue by Region')] as AppStore['analysisCards'];
        state.rawCsvData = {
            ...state.rawCsvData!,
            intakeDetection: {
                ...state.rawCsvData!.intakeDetection!,
                warnings: [
                    {
                        code: 'low_confidence',
                        message: 'CSV dialect detection confidence is limited.',
                    },
                ],
            },
        };

        const bundle = buildReportEvidenceBundle(state);

        expect(bundle?.dataset.reportReadiness).toBe('partial');
        expect(bundle?.dataset.readinessRisks).toContain('Workflow warnings remain unresolved.');
    });

    it('returns partial readiness when structural caveats exist', () => {
        const state = createBaseState();
        state.analysisCards = [createCard('card-1', 'Revenue by Region')] as AppStore['analysisCards'];

        const bundle = buildReportEvidenceBundle(state);

        expect(bundle?.dataset.reportReadiness).toBe('partial');
        expect(bundle?.dataset.reportReadinessReason).toBe('Usable for bounded synthesis, but structural caveats still limit executive certainty.');
        expect(bundle?.dataset.structuralSignals.usedFallbackContext).toBe(true);
    });

    it('returns partial readiness when cleaned rows expand far beyond raw rows', () => {
        const state = createAnalystReadyState();
        state.analysisCards = [createCard('card-1', 'Revenue by Region')] as AppStore['analysisCards'];
        state.csvData = {
            ...state.csvData!,
            data: Array.from({ length: 7 }, (_, index) => ({
                Region: `Region-${index + 1}`,
                Revenue: 100 + index,
            })),
        };

        const bundle = buildReportEvidenceBundle(state);

        expect(bundle?.dataset.reportReadiness).toBe('partial');
        expect(bundle?.dataset.structuralSignals.rowExpansionRatio).toBe(3.5);
        expect(bundle?.dataset.readinessRisks).toContain('Cleaned rows expanded 3.5x over raw rows.');
    });

    it('returns partial readiness when report context falls back even with cards', () => {
        const state = createAnalystReadyState();
        state.analysisCards = [createCard('card-1', 'Revenue by Region')] as AppStore['analysisCards'];
        state.reportContextResolution = {
            ...state.reportContextResolution!,
            effective: {
                ...state.reportContextResolution!.effective,
                source: 'fallback',
            },
            verification: {
                ...state.reportContextResolution!.verification,
                usedFallback: true,
            },
        };

        const bundle = buildReportEvidenceBundle(state);

        expect(bundle?.dataset.reportReadiness).toBe('partial');
        expect(bundle?.dataset.readinessRisks).toContain('Report context required fallback recovery.');
    });

    it('creates deterministic evidence ids in the required order', () => {
        const state = createBaseState();
        state.aiCoreAnalysisSummary = createLocalizedText('Core summary');
        state.finalSummary = createLocalizedText('Final summary');
        state.activeDataQuery = {
            explanation: 'Show the top revenue regions.',
            plan: {
                select: ['Region', 'Revenue'],
                limit: 5,
            },
            result: {
                rows: [{ Region: 'East', Revenue: 1200 }],
                totalMatchedRows: 3,
                returnedRows: 1,
                truncated: false,
                selectedColumns: ['Region', 'Revenue'],
                appliedOrderBy: [],
                appliedLimit: 5,
                durationMs: 7,
            },
            appliedAt: new Date('2026-03-10T00:00:04.000Z'),
            source: 'execute_data_query',
            engine: 'duckdb',
            sqlPreview: 'select "Region", "Revenue" from clean_dataset',
            tableName: 'clean_dataset',
            loadVersion: 'dataset-1',
            fallbackReason: null,
            fallbackFilterOperation: null,
        };
        state.analysisCards = [
            createCard('card-1', 'Revenue by Region'),
            createCard('card-2', 'Revenue by Market'),
        ] as AppStore['analysisCards'];
        const narrativeProvenance = buildNarrativeArtifactProvenance(state, state.analysisCards, '2026-03-10T00:00:05.000Z');
        state.aiCoreAnalysisSummaryProvenance = narrativeProvenance;
        state.finalSummaryProvenance = narrativeProvenance;

        const bundle = buildReportEvidenceBundle(state);

        expect(bundle?.evidenceCatalog.map(entry => entry.id)).toEqual([
            'dataset.context',
            'dataset.readiness',
            'workflow.preparation',
            'workflow.verification',
            'summary.core',
            'summary.final',
            'query.active',
            'card.card-1',
            'card.card-2',
        ]);
    });

    it('summarizes active query without embedding row previews', () => {
        const state = createBaseState();
        state.activeDataQuery = {
            explanation: 'Show the top revenue regions.',
            plan: {
                select: ['Region', 'Revenue'],
                limit: 5,
            },
            result: {
                rows: [{ Region: 'East', Revenue: 1200 }],
                totalMatchedRows: 4,
                returnedRows: 1,
                truncated: false,
                selectedColumns: ['Region', 'Revenue'],
                appliedOrderBy: [],
                appliedLimit: 5,
                durationMs: 4,
            },
            appliedAt: new Date('2026-03-10T00:00:04.000Z'),
            source: 'execute_data_query',
            engine: 'duckdb',
            sqlPreview: 'select "Region", "Revenue" from clean_dataset',
            tableName: 'clean_dataset',
            loadVersion: 'dataset-1',
            fallbackReason: null,
            fallbackFilterOperation: null,
        };

        const bundle = buildReportEvidenceBundle(state);

        expect(bundle?.query).toEqual({
            queryTraceId: null,
            loadVersion: 'dataset-1',
            hasActiveQuery: true,
            explanation: 'Show the top revenue regions.',
            sqlPreview: 'select "Region", "Revenue" from clean_dataset',
            engine: 'duckdb',
            totalMatchedRows: 4,
            returnedRows: 1,
            selectedColumns: ['Region', 'Revenue'],
        });
        expect(bundle?.query).not.toHaveProperty('rows');
        expect(bundle?.query).not.toHaveProperty('previewRows');
    });

    it('emits summary card evidence only, with truncated aggregatedDataSample', () => {
        const state = createBaseState();
        state.analysisCards = [createCard('card-1', 'Revenue by Region')] as AppStore['analysisCards'];

        const bundle = buildReportEvidenceBundle(state);
        const card = bundle?.cards[0];

        expect(card?.evidenceId).toBe('card.card-1');
        expect(card?.summary?.text).toBe('Revenue by Region summary');
        expect(card?.aggregatedDataSample).toHaveLength(8);
        expect(card).not.toHaveProperty('aggregatedData');
    });

    it('carries auto-analysis lineage into report card evidence', () => {
        const state = createBaseState();
        const qualityCard = createCard('card-1', 'Revenue by Region');
        state.analysisCards = [{
            ...qualityCard,
            provenance: buildAnalysisArtifactProvenance(qualityCard.plan, state, {
                now: '2026-03-19T00:00:00.000Z',
            }),
            sourceTopic: 'Revenue by Region',
            autoAnalysisEvaluation: {
                verdict: 'trusted' as const,
                reasonCodes: [],
                detail: 'trusted',
                evaluatedAt: '2026-03-16T00:00:00.000Z',
                source: 'auto_analysis_evaluator_v1' as const,
            },
        }] as AppStore['analysisCards'];

        const bundle = buildReportEvidenceBundle(state);
        const card = bundle?.allCards[0];

        expect(card).toMatchObject({
            sourceTopic: 'Revenue by Region',
            autoAnalysisVerdict: 'trusted',
            autoAnalysisVerdictDetail: 'trusted',
            autoAnalysisReasonCodes: [],
        });
    });

    it('exposes evidenceValueGate decision, detail, and reasonCodes in card evidence', () => {
        const state = createBaseState();
        state.analysisCards = [{
            ...createCard('card-1', 'Revenue by Region'),
            evidenceValueGate: {
                decision: 'table_only' as const,
                reasonCodes: ['helper_dimension', 'not_chart_worthy'] as any[],
                detail: 'Helper dimension detected, table presentation preferred.',
                querySignature: 'qs-1',
                semanticSignature: 'ss-1',
                semanticRisk: 'medium' as const,
                evaluatedAt: '2026-03-16T00:00:00.000Z',
                source: 'evidence_value_gate_v1' as const,
            },
        }] as AppStore['analysisCards'];

        const bundle = buildReportEvidenceBundle(state);
        const card = bundle?.allCards[0];

        expect(card?.evidenceValueGateDecision).toBe('table_only');
        expect(card?.evidenceValueGateDetail).toBe('Helper dimension detected, table presentation preferred.');
        expect(card?.evidenceValueGateReasonCodes).toEqual(['helper_dimension', 'not_chart_worthy']);
    });

    it('defaults evidenceValueGate fields to null/empty when no gate result exists', () => {
        const state = createBaseState();
        state.analysisCards = [createCard('card-1', 'Revenue by Region')] as AppStore['analysisCards'];

        const bundle = buildReportEvidenceBundle(state);
        const card = bundle?.allCards[0];

        expect(card?.evidenceValueGateDecision).toBeNull();
        expect(card?.evidenceValueGateDetail).toBeNull();
        expect(card?.evidenceValueGateReasonCodes).toEqual([]);
    });

    it('uses display IR fields when available and falls back safely when absent', async () => {
        vi.resetModules();
        vi.doMock('../../services/dashboard/displayAnalysisIr', () => ({
            buildDisplayAnalysisIrList: () => [],
        }));

        const { buildReportEvidenceBundle: buildWithoutIr } = await import('../../services/reporting/buildReportEvidenceBundle');
        const state = createBaseState();
        state.analysisCards = [createCard('card-1', 'Revenue by Region')] as AppStore['analysisCards'];

        const bundle = buildWithoutIr(state);
        const card = bundle?.allCards[0];

        expect(card?.displayTitle).toBe('Revenue by Region');
        expect(card?.description).toBe('Revenue by Region description');
        expect(card?.semanticRole).toBeNull();
        expect(card?.helperExposureLevel).toBeNull();
        expect(card?.businessMeaningConfidence).toBeNull();
        expect(card?.aggregationQualityFlags).toEqual([]);
        expect(bundle?.cards).toHaveLength(0);
        expect(bundle?.excludedEvidence[0]).toEqual(expect.objectContaining({
            cardId: 'card-1',
            reasonCodes: expect.arrayContaining(['helper_exposure', 'low_business_confidence']),
        }));
    });

    it('keeps readiness semantics but blocks generation when all cards are excluded from trusted reporting', () => {
        const state = createAnalystReadyState();
        state.analysisCards = [createCard('card-1', 'Revenue by Region')] as AppStore['analysisCards'];

        vi.resetModules();
        vi.doMock('../../services/dashboard/displayAnalysisIr', () => ({
            buildDisplayAnalysisIrList: () => [{
                cardId: 'card-1',
                semanticRole: 'helper_classification',
                helperExposureLevel: 'low',
                businessMeaningConfidence: 0.61,
                aggregationQualityFlags: ['mixed_grain'],
                displayTitle: 'Revenue by Region',
                description: 'Revenue by Region description',
                artifactType: null,
            }],
        }));

        return import('../../services/reporting/buildReportEvidenceBundle').then(({ buildReportEvidenceBundle: buildBlockedBundle }) => {
            const bundle = buildBlockedBundle(state);

            expect(bundle?.dataset.reportReadiness).toBe('partial');
            expect(bundle?.dataset.reportGenerationGate).toBe('blocked');
            expect(bundle?.dataset.trustedCardsCount).toBe(0);
            expect(bundle?.includedCardIds).toEqual([]);
            expect(bundle?.excludedCardIds).toEqual(['card-1']);
            expect(bundle?.excludedEvidence[0]).toEqual(expect.objectContaining({
                cardId: 'card-1',
                reasonCodes: ['helper_exposure', 'narrative_ineligible', 'low_business_confidence', 'aggregation_quality_warning'],
            }));
        });
    });

    it('adds quality governance summary and caveats when only caveated cards remain includable', () => {
        const state = createAnalystReadyState();
        state.csvData = {
            ...state.csvData!,
            data: [
                { Region: 'Unknown', Revenue: 1500 },
                { Region: 'East', Revenue: 600 },
            ],
        };
        state.columnProfiles = [
            { name: 'Region', type: 'categorical', uniqueValues: 2, missingPercentage: 0 },
            { name: 'Revenue', type: 'currency', missingPercentage: 55, hasFormattedNumbers: true, valueRange: [600, 1500] },
        ];
        const qualityGovernedCard = createCard('card-1', 'Revenue by Region');
        state.analysisCards = [{
            ...qualityGovernedCard,
            provenance: buildAnalysisArtifactProvenance(qualityGovernedCard.plan, state, {
                now: '2026-03-19T00:00:00.000Z',
            }),
            aggregatedData: [
                { Region: 'Unknown', Revenue: 1500 },
                { Region: 'East', Revenue: 600 },
            ],
            autoAnalysisEvaluation: {
                verdict: 'caveated',
                reasonCodes: ['dimension_quality_warning', 'metric_quality_warning', 'unclassified_share_warning'],
                detail: 'dimensionQuality=Region:avoid | metricQuality=Revenue:avoid | unclassifiedShare=71%',
                evaluatedAt: '2026-03-19T00:00:00.000Z',
                source: 'auto_analysis_evaluator_v1',
            },
        }] as AppStore['analysisCards'];

        const bundle = buildReportEvidenceBundle(state);

        expect(bundle?.dataset.reportReadiness).toBe('partial');
        expect(bundle?.dataset.reportGenerationGate).toBe('allowed_with_caveats');
        expect(bundle?.dataset.trustedCardsCount).toBe(0);
        expect(bundle?.dataset.includedCardsCount).toBe(1);
        expect(bundle?.dataset.caveatedCardsCount).toBe(1);
        expect(bundle?.dataset.qualityHintsSummary).toContain('Avoid risky metrics');
        expect(bundle?.allCards[0]?.autoAnalysisReasonCodes).toEqual(expect.arrayContaining([
            'dimension_quality_warning',
            'metric_quality_warning',
            'unclassified_share_warning',
        ]));
        expect(bundle?.evidenceCatalog.some(entry => entry.id === 'dataset.quality_governance')).toBe(true);
    });
});
