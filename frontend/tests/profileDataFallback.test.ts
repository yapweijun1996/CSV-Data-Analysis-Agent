// @vitest-environment node

/**
 * P0 Anti-Survivorship Resilience: profileDataWithWorker fallback guard
 *
 * Verifies two layers of resilience:
 *
 * Layer 1 — profileDataLightweight (pure function):
 *   A minimal sampled profiler that never throws. Used as last resort.
 *
 * Layer 2 — fileProcessor.ts profiling guard:
 *   If profileDataWithWorker throws, the guard catches it, emits a warning,
 *   and falls back to profileDataLightweight so intake always completes.
 *
 * Test pattern: mock the failure → assert recovery fires → assert profiles available.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    robustParseFloat,
    profileData,
    profileDataLightweight,
    sampleStratified,
    LIGHTWEIGHT_PROFILER_ROW_LIMIT,
} from '../services/data/dataProfiler';
import type { CsvRow } from '../types';

// --- robustParseFloat: apostrophe-prefix handling ---

describe('robustParseFloat — apostrophe-prefixed numbers', () => {
    it('parses apostrophe-prefixed negative: \'−852.81 → −852.81', () => {
        expect(robustParseFloat("'-852.81")).toBe(-852.81);
    });

    it('parses apostrophe-prefixed negative with commas: \'−4,010.85 → −4010.85', () => {
        expect(robustParseFloat("'-4,010.85")).toBe(-4010.85);
    });

    it('parses apostrophe-prefixed positive: \'1234 → 1234', () => {
        expect(robustParseFloat("'1234")).toBe(1234);
    });

    it('returns null for apostrophe-prefixed text: \'hello → null', () => {
        expect(robustParseFloat("'hello")).toBeNull();
    });

    it('returns null for bare apostrophe', () => {
        expect(robustParseFloat("'")).toBeNull();
    });

    it('returns null for apostrophe-dash only: \'− → null', () => {
        expect(robustParseFloat("'-")).toBeNull();
    });

    it('returns null for mid-string apostrophe (O\'Brien)', () => {
        expect(robustParseFloat("O'Brien")).toBeNull();
    });

    it('handles Unicode left single quote: \\u2018−852.81 → −852.81', () => {
        expect(robustParseFloat('\u2018-852.81')).toBe(-852.81);
    });

    it('handles Unicode right single quote: \\u2019−852.81 → −852.81', () => {
        expect(robustParseFloat('\u2019-852.81')).toBe(-852.81);
    });

    it('still parses normal negatives without apostrophe', () => {
        expect(robustParseFloat('-852.81')).toBe(-852.81);
    });
});

// --- profileData: apostrophe-prefixed column typing ---

describe('profileData — apostrophe-prefixed columns', () => {
    it('types a column with all apostrophe-prefixed negatives as numerical', () => {
        const rows: CsvRow[] = [
            { COST: "'-852.81" },
            { COST: "'-4,010.85" },
            { COST: "'-1,281.83" },
        ];
        const { profiles } = profileData(rows);
        const costProfile = profiles.find(p => p.name === 'COST');
        expect(costProfile?.type).toBe('numerical');
        expect(costProfile?.hasApostrophePrefixedNumbers).toBe(true);
    });

    it('types a column with mixed apostrophe-prefixed and regular numbers as numerical', () => {
        const rows: CsvRow[] = [
            { COST: "'-852.81" },
            { COST: '1,234.56' },
            { COST: '0.00' },
            { COST: "'-260.00" },
        ];
        const { profiles } = profileData(rows);
        const costProfile = profiles.find(p => p.name === 'COST');
        expect(costProfile?.type).toBe('numerical');
    });

    it('emits an issue for apostrophe-prefixed numbers', () => {
        const rows: CsvRow[] = [
            { Amount: "'-100.50" },
            { Amount: '200.00' },
        ];
        const { issues } = profileData(rows);
        expect(issues.some(i => i.includes('apostrophe-prefixed'))).toBe(true);
    });
});

// --- Layer 1: profileDataLightweight unit tests ---

describe('profileDataLightweight', () => {
    it('returns empty result for empty input', () => {
        const { profiles, issues } = profileDataLightweight([]);
        expect(profiles).toEqual([]);
        expect(issues).toHaveLength(0);
    });

    it('detects numerical columns', () => {
        const rows: CsvRow[] = [
            { Revenue: 1000, Department: 'Sales' },
            { Revenue: 2000, Department: 'Marketing' },
            { Revenue: 1500, Department: 'Engineering' },
        ];
        const { profiles } = profileDataLightweight(rows);
        const revProfile = profiles.find(p => p.name === 'Revenue');
        const deptProfile = profiles.find(p => p.name === 'Department');

        expect(revProfile?.type).toBe('numerical');
        expect(deptProfile?.type).toBe('categorical');
    });

    it('populates uniqueValues and missingPercentage', () => {
        const rows: CsvRow[] = [
            { Status: 'Active', Value: 10 },
            { Status: 'Inactive', Value: null },
            { Status: 'Active', Value: 30 },
            { Status: null, Value: 40 },
        ];
        const { profiles } = profileDataLightweight(rows);
        const statusProfile = profiles.find(p => p.name === 'Status');
        const valueProfile = profiles.find(p => p.name === 'Value');

        expect(statusProfile?.uniqueValues).toBe(2);       // 'Active', 'Inactive'
        expect(statusProfile?.missingPercentage).toBe(25); // 1/4 = 25%
        expect(valueProfile?.missingPercentage).toBe(25);  // 1 null out of 4 rows
    });

    it('samples only maxRows rows and reports issue when truncating', () => {
        const rows: CsvRow[] = Array.from({ length: 200 }, (_, i) => ({ Col: i }));
        const { profiles, issues } = profileDataLightweight(rows, 50);

        // Profiles computed from 50-row stratified sample
        expect(profiles).toHaveLength(1);
        expect(profiles[0].name).toBe('Col');
        // Issue mentions the sample size and strategy
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0]).toContain('50');
        expect(issues[0]).toContain('stratified');
    });

    it('handles currency-style values as numerical', () => {
        const rows: CsvRow[] = [
            { Amount: '$1,234' },
            { Amount: '$5,678' },
            { Amount: '$999' },
        ];
        const { profiles } = profileDataLightweight(rows);
        const amountProfile = profiles.find(p => p.name === 'Amount');
        expect(amountProfile?.type).toBe('numerical');
    });

    it('treats mixed numeric/text columns as categorical', () => {
        const rows: CsvRow[] = [
            { Code: '100' },
            { Code: 'ABC' },
            { Code: '200' },
            { Code: 'DEF' },
        ];
        const { profiles } = profileDataLightweight(rows);
        const codeProfile = profiles.find(p => p.name === 'Code');
        // 50% numeric is below the 80% threshold → categorical
        expect(codeProfile?.type).toBe('categorical');
    });

    it('exports LIGHTWEIGHT_PROFILER_ROW_LIMIT as 1000', () => {
        expect(LIGHTWEIGHT_PROFILER_ROW_LIMIT).toBe(1000);
    });

    it('detects apostrophe-prefixed negatives as numerical', () => {
        const rows: CsvRow[] = [
            { COST: "'-852.81", Name: 'Alice' },
            { COST: "'-4,010.85", Name: 'Bob' },
            { COST: "'-260.00", Name: 'Charlie' },
        ];
        const { profiles } = profileDataLightweight(rows);
        const costProfile = profiles.find(p => p.name === 'COST');
        expect(costProfile?.type).toBe('numerical');
        expect(costProfile?.hasApostrophePrefixedNumbers).toBe(true);
    });

    it('never throws even on wildly malformed input', () => {
        // Array of rows with null prototype, unusual values, etc.
        const weirdRows: CsvRow[] = [
            { '': null, '\t': 'tab', '🔥': '🔥' },
            { '': 'x', '\t': null, '🔥': null },
        ];
        expect(() => profileDataLightweight(weirdRows)).not.toThrow();
    });
});

// --- sampleStratified unit tests ---

describe('sampleStratified', () => {
    it('returns full array when data.length <= maxRows', () => {
        const rows = Array.from({ length: 10 }, (_, i) => ({ v: i }));
        expect(sampleStratified(rows, 10)).toBe(rows);
        expect(sampleStratified(rows, 100)).toBe(rows);
    });

    it('returns exactly maxRows rows when truncating', () => {
        const rows = Array.from({ length: 900 }, (_, i) => ({ v: i }));
        const sample = sampleStratified(rows, 300);
        expect(sample).toHaveLength(300);
    });

    it('samples from head, middle, and tail — not just head', () => {
        // 1000 rows: values 0-999. With maxRows=30 we expect ~10 from head,
        // ~10 from middle (~450-460), ~10 from tail (~990-999).
        const rows = Array.from({ length: 1000 }, (_, i) => ({ v: i }));
        const sample = sampleStratified(rows, 30);
        const values = sample.map(r => r.v as number);

        // Should include some from the beginning
        expect(values.some(v => v < 50)).toBe(true);
        // Should include some from the middle
        expect(values.some(v => v >= 400 && v <= 600)).toBe(true);
        // Should include some from the tail
        expect(values.some(v => v >= 980)).toBe(true);
    });

    it('detects tail-only type differences that head-only sampling misses', () => {
        // Scenario: 900 rows of numeric values in the head, then 100 rows of text at the tail.
        // Head-only sampling (first 300 rows) would classify the column as numerical.
        // Stratified sampling includes tail rows so it correctly classifies as categorical.
        const numericRows = Array.from({ length: 900 }, (_, i) => ({ Amount: String(i * 100) }));
        const textRows = Array.from({ length: 100 }, () => ({ Amount: 'N/A' }));
        const allRows = [...numericRows, ...textRows];

        // Head-only: first 300 rows — all numeric → numerical classification
        const headOnlySample = allRows.slice(0, 300);
        const { profiles: headProfiles } = profileDataLightweight(headOnlySample);
        expect(headProfiles[0].type).toBe('numerical');

        // Stratified: includes tail rows with 'N/A' — mixed → categorical
        const { profiles: stratProfiles } = profileDataLightweight(allRows, 300);
        // Tail rows contain text values — stratified sample should detect this
        expect(stratProfiles[0].type).toBe('categorical');
    });
});

// --- Layer 2: fileProcessor profiling guard integration tests ---
// We test this via mocking profileDataWithWorker so we don't need a real worker.

const {
    profileDataWithWorkerMock,
    processCsvWithIntakeIrMock,
    extractAiReportContextMock,
    buildReportContextResolutionMock,
    buildReportContextWorkspaceFilesMock,
    emitAgentEventMock,
    finalizeAndSaveRunMock,
    agentMemoryCollectorMock,
    buildDatasetIdMock,
    buildDiverseSampleMock,
    buildSchemaSnapshotMock,
} = vi.hoisted(() => ({
    profileDataWithWorkerMock: vi.fn(),
    processCsvWithIntakeIrMock: vi.fn(),
    extractAiReportContextMock: vi.fn(),
    buildReportContextResolutionMock: vi.fn(),
    buildReportContextWorkspaceFilesMock: vi.fn(),
    emitAgentEventMock: vi.fn(),
    finalizeAndSaveRunMock: vi.fn(),
    agentMemoryCollectorMock: {
        startRun: vi.fn(),
        updateDatasetFacts: vi.fn(),
        recordDataIssue: vi.fn(),
    },
    buildDatasetIdMock: vi.fn().mockReturnValue('dataset-123'),
    buildDiverseSampleMock: vi.fn().mockReturnValue([]),
    buildSchemaSnapshotMock: vi.fn().mockReturnValue({}),
}));

vi.mock('../services/workers/dataWorkerClient', () => ({
    profileDataWithWorker: profileDataWithWorkerMock,
}));

vi.mock('../services/data/csvParser', () => ({
    processCsvWithIntakeIr: processCsvWithIntakeIrMock,
    MAX_FILE_SIZE_BYTES: 100 * 1024 * 1024,
}));

vi.mock('../services/ai/reportContextExtractor', () => ({
    extractAiReportContext: extractAiReportContextMock,
}));

vi.mock('../services/agent/reportContext', () => ({
    buildReportContextResolution: buildReportContextResolutionMock,
    buildReportContextWorkspaceFiles: buildReportContextWorkspaceFilesMock,
}));

vi.mock('../services/agent/monitoring/agentMonitor', () => ({
    emitAgentEvent: emitAgentEventMock,
    updateAgentTaskStatus: vi.fn(),
}));

vi.mock('../services/agent/memory/agentMemoryCollector', () => ({
    agentMemoryCollector: agentMemoryCollectorMock,
}));

vi.mock('../utils/datasetId', async importOriginal => {
    const actual = await importOriginal<typeof import('../utils/datasetId')>();
    return {
        ...actual,
        buildDatasetId: buildDatasetIdMock,
    };
});

vi.mock('../utils/dataHelpers', () => ({
    buildDiverseSample: buildDiverseSampleMock,
}));

vi.mock('../services/agent/orchestration/reportStructureOrchestrator', () => ({
    resolveReportStructureArtifactsWithProposal: vi.fn().mockResolvedValue({
        canonicalCsvData: null,
        canonicalBuildMeta: null,
        canonicalizationStatus: 'skipped',
        reportStructureResolution: null,
        pipelineOutcome: { status: 'ready', canAutoAnalyze: true },
    }),
}));

vi.mock('../services/data/dataProfiler', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../services/data/dataProfiler')>();
    return {
        ...actual,
        // Keep profileDataLightweight real — it's the fallback under test
        profileDataLightweight: actual.profileDataLightweight,
        buildSchemaSnapshot: buildSchemaSnapshotMock,
        summarizeDataQualityIssues: vi.fn().mockReturnValue(null),
    };
});

// --- Test fixtures ---

const makeMockFile = () => ({ name: 'test.csv', size: 1000 } as File);

const makeParsedCsvData = () => ({
    data: [
        { Department: 'Sales', Revenue: '1000' },
        { Department: 'Marketing', Revenue: '500' },
    ],
    totalRows: 2,
    headers: ['Department', 'Revenue'],
    delimiter: ',',
    encoding: 'UTF-8',
    metadataRows: [],
    headerLayers: [],
    summaryRows: [],
    headerDepth: 1,
    intakeDetection: { warnings: [], strategy: 'csv', confidence: 'high', delimiter: ',', quoteChar: '"' },
} as unknown as import('../types').CsvData);

const makeReportContextResolution = () => ({
    effective: { reportTitle: 'Test Report' },
    verification: { usedFallback: false, aiConfidence: 0.9, reason: null },
});

const createMockStore = () => {
    const state = {
        settings: { provider: 'openai', language: 'Mandarin', openAIApiKey: 'key', geminiApiKey: '', simpleModel: 'gpt-mini', complexModel: 'gpt-4', autoConfirmGoal: true, reportTemplate: 'executive_brief', runtimeAccessControl: { permissionMode: 'open', toolOverrides: {}, workspaceRules: { deniedPathPrefixes: [] } } },
        addProgress: vi.fn(),
        logTelemetryEvent: vi.fn(),
    };
    return {
        getState: () => state,
        setState: vi.fn(),
    };
};

const drainGenerator = async <T>(gen: AsyncGenerator<unknown, T, unknown>): Promise<T> => {
    let result: IteratorResult<unknown, T>;
    do {
        result = await gen.next();
    } while (!result.done);
    return result.value;
};

describe('fileProcessor profiling fallback guard (P0)', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        const csvData = makeParsedCsvData();
        processCsvWithIntakeIrMock.mockResolvedValue({
            csvData,
            intakeIr: {
                fileName: 'test.csv',
                columnCount: 2,
                rawRows: [['Department', 'Revenue'], ['Sales', '1000'], ['Marketing', '500']],
                normalizedRows: [['Department', 'Revenue'], ['Sales', '1000'], ['Marketing', '500']],
                detection: csvData.intakeDetection,
                segments: [],
                provisionalTable: null,
                diagnostics: {
                    hasRepeatedHeader: false,
                    hasParameterRowsBetweenHeaderAndBody: false,
                    headerShapeDrift: false,
                    singleColumnFallbackApplied: true,
                    bodyEvidenceKind: 'unknown',
                    segmentCountsByKind: {},
                    headerCandidates: [],
                    bodyStartCandidates: [],
                    evidenceStrength: 'moderate',
                    fallbackReason: null,
                },
            },
        });
        extractAiReportContextMock.mockResolvedValue({});
        buildReportContextResolutionMock.mockReturnValue(makeReportContextResolution());
        buildReportContextWorkspaceFilesMock.mockReturnValue({});
    });

    it('uses lightweight profiler when profileDataWithWorker throws, and intake completes', async () => {
        const store = createMockStore();

        // Primary profiler fails (worker crash)
        profileDataWithWorkerMock.mockRejectedValue(new Error('Worker crashed'));

        const { processAndCleanFile } = await import('../services/agent/fileProcessor');
        const gen = processAndCleanFile(makeMockFile(), store as never);
        const result = await drainGenerator(gen);

        // Result must be defined and have profiles (from lightweight fallback)
        expect(result).toBeDefined();
        expect(result.columnProfiles).toBeDefined();
        // Lightweight profiler returns profiles for each column in the data
        expect(result.columnProfiles.length).toBeGreaterThan(0);

        // A profiling_fallback event must have been emitted
        const fallbackEvent = emitAgentEventMock.mock.calls.find(
            call => call[1]?.step === 'profiling_fallback',
        );
        expect(fallbackEvent).toBeDefined();
        expect(fallbackEvent[1].status).toBe('error');
    });

    it('emits Mandarin warning progress when profiling falls back', async () => {
        const store = createMockStore();
        const progressMessages: string[] = [];

        profileDataWithWorkerMock.mockRejectedValue(new Error('Worker hung'));

        const { processAndCleanFile } = await import('../services/agent/fileProcessor');
        const gen = processAndCleanFile(makeMockFile(), store as never);

        let step = await gen.next();
        while (!step.done) {
            const update = step.value as { type: string; message?: string };
            if (update?.type === 'progress' && update.message) {
                progressMessages.push(update.message);
            }
            step = await gen.next();
        }

        // Mandarin fallback warning must appear in progress updates
        const hasMandarinWarning = progressMessages.some(m => m.includes('轻量级'));
        expect(hasMandarinWarning).toBe(true);
    });

    it('passes through profiles normally when profileDataWithWorker succeeds', async () => {
        const store = createMockStore();
        const mockProfiles = [
            { name: 'Department', type: 'categorical' as const, uniqueValues: 3, missingPercentage: 0 },
            { name: 'Revenue', type: 'numerical' as const, missingPercentage: 0 },
        ];

        profileDataWithWorkerMock.mockResolvedValue({ profiles: mockProfiles, issues: [] });

        const { processAndCleanFile } = await import('../services/agent/fileProcessor');
        const gen = processAndCleanFile(makeMockFile(), store as never);
        const result = await drainGenerator(gen);

        expect(result.columnProfiles).toEqual(mockProfiles);

        // No fallback event should have been emitted
        const fallbackEvent = emitAgentEventMock.mock.calls.find(
            call => call[1]?.step === 'profiling_fallback',
        );
        expect(fallbackEvent).toBeUndefined();
    });
});
