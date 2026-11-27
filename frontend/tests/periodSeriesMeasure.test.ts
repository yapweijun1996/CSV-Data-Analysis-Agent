import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type {
    AnalysisCardData,
    ColumnProfile,
    CsvRow,
    QueryAggregateFunction,
    RuntimeSemanticUnderstanding,
    SeriesMeasureSemantics,
    SqlEvidenceQueryPlan,
} from '../types';
import { processCsvWithIntakeIr } from '../services/data/csvParser';
import { buildCsvDataFromIntakeIr } from '../services/data/reportCsvIntake';
import { profileData } from '../services/data/dataProfiler';
import { resolveReportStructureArtifactsWithProposal } from '../services/agent/orchestration/reportStructureOrchestrator';
import { evaluateEvidenceValue } from '../services/agent/evidenceValueGate';
import { buildEvidenceResultSummary } from '../services/agent/execution/sqlCardExecutor';
import { attachAutoAnalysisEvaluationToCards } from '../services/agent/autoAnalysisEvaluation';
import { resolveCardTrustDecision } from '../services/agent/cardTrustDecision';
import { buildExecutiveKpis } from '../services/dashboard/executiveKpis';
import { buildDeterministicTopics, generateEvidenceQueryPlanStepped } from '../services/agent/planning/planGenerator';
import { buildResearchTopic, checkQuestionSeriesScope, validateResearchQuestions } from '../services/agent/runtime/pi/researchPlan';
import { assessSeriesMeasurePlan, resolveTopicSeriesFilter } from '../services/agent/planning/seriesMeasureGuard';
import { createTestSettings } from './testSettings';

// The three SingStat-style demo files that the intake melts into
// DataSeries/Period/Value long tables, loaded through the production intake.
const DEMO_DIR = path.resolve(process.cwd(), '../demo-data');
const TRANSPORT = 'sg-public-transport-ridership.csv';
const VISITORS = 'sg-visitor-arrivals.csv';
const BUSINESS = 'sg-business-formation.csv';

interface MeltedDemo {
    rows: CsvRow[];
    profiles: ColumnProfile[];
    seriesMeasure: SeriesMeasureSemantics | null | undefined;
}

const loadMeltedDemo = async (fileName: string): Promise<MeltedDemo> => {
    const text = fs.readFileSync(path.join(DEMO_DIR, fileName), 'utf8');
    const file = ({ name: fileName, size: text.length, text: async () => text }) as unknown as File;
    const { csvData, intakeIr } = await processCsvWithIntakeIr(file);
    const artifacts = await resolveReportStructureArtifactsWithProposal({
        rawCsvData: buildCsvDataFromIntakeIr(intakeIr),
        csvData,
        rawIntakeIr: intakeIr,
        cleaningRun: null,
        dataPreparationPlan: {
            explanation: 'Import keeps the source rows unchanged.',
            operations: [],
            outputColumns: [],
            planStatus: 'schema_only',
            consistencyIssues: [],
        },
        columnProfiles: profileData(csvData.data).profiles,
        settings: createTestSettings(),
    });
    const rows = artifacts.canonicalCsvData!.data;
    return { rows, profiles: profileData(rows).profiles, seriesMeasure: artifacts.canonicalBuildMeta?.seriesMeasure };
};

const semanticUnderstanding: RuntimeSemanticUnderstanding = {
    businessGrains: ['DataSeries', 'Period'],
    candidateMetrics: ['Value'],
    timeGrains: ['Period'],
    helperDimensions: [],
    blockedDimensions: [],
    detailRowPolicy: 'exclude_non_detail_rows',
    businessGlossary: [],
    businessGrainConfidence: 'high',
    unsafeForBusinessNarrative: false,
};

type Filter = { column: string; value: string | string[] };

const buildPlan = (params: {
    title: string;
    groupBy: string;
    fn: QueryAggregateFunction;
    filters?: Filter[];
}): SqlEvidenceQueryPlan => {
    const alias = `${params.fn}_value`;
    return {
        title: params.title,
        queryMode: 'aggregate',
        intentSummary: params.title,
        preferredResultShape: params.groupBy === 'Period' ? 'time_series' : 'ranked_aggregate',
        query: {
            select: [params.groupBy, alias],
            groupBy: [params.groupBy],
            aggregates: [{ function: params.fn, column: params.fn === 'count' ? undefined : 'Value', as: alias }],
            where: params.filters?.length
                ? {
                    predicates: params.filters.map(filter => ({
                        column: filter.column,
                        operator: Array.isArray(filter.value) ? 'in' as const : 'eq' as const,
                        value: filter.value,
                    })),
                }
                : undefined,
            orderBy: [{ column: params.groupBy, direction: 'asc' }],
            limit: 500,
        },
    };
};

// Runs a plan's WHERE/GROUP BY/aggregate over the canonical rows, as the
// DuckDB evidence query would, so the gate sees the real result shape.
const runPlan = (rows: CsvRow[], plan: SqlEvidenceQueryPlan): CsvRow[] => {
    const predicates = plan.query.where?.predicates ?? [];
    const filtered = rows.filter(row => predicates.every(predicate => {
        const values = (Array.isArray(predicate.value) ? predicate.value : [predicate.value]).map(String);
        return values.includes(String(row[predicate.column]));
    }));
    const groupBy = plan.query.groupBy![0];
    const aggregate = plan.query.aggregates![0];
    const groups = new Map<string, number[]>();
    filtered.forEach(row => {
        const key = String(row[groupBy]);
        const values = groups.get(key) ?? [];
        const value = row.Value === null ? null : Number(row.Value);
        if (aggregate.function === 'count') values.push(1);
        else if (value !== null && Number.isFinite(value)) values.push(value);
        groups.set(key, values);
    });
    return [...groups.entries()].map(([key, values]) => {
        const sorted = [...values].sort((left, right) => left - right);
        const result = aggregate.function === 'sum' || aggregate.function === 'count'
            ? values.reduce((total, value) => total + value, 0)
            : aggregate.function === 'avg'
                ? values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1)
                : aggregate.function === 'max'
                    ? Math.max(...values)
                    : sorted[Math.floor(sorted.length / 2)];
        return { [groupBy]: key, [aggregate.as]: result };
    });
};

const gate = (demo: MeltedDemo, plan: SqlEvidenceQueryPlan) => {
    const rows = runPlan(demo.rows, plan);
    const evidenceSummary = buildEvidenceResultSummary(plan, {
        rows,
        totalMatchedRows: rows.length,
        returnedRows: rows.length,
        truncated: false,
        selectedColumns: plan.query.select ?? [],
        appliedOrderBy: [],
        appliedLimit: 0,
        durationMs: 0,
    }, demo.profiles);
    return {
        rows,
        result: evaluateEvidenceValue({
            semanticUnderstanding,
            evidencePlan: plan,
            evidenceSummary,
            existingAcceptedOutputs: [],
            seriesMeasure: demo.seriesMeasure,
        }),
    };
};

// A card exactly as the topic pipeline would store it, with complete
// provenance, so only the evidence gate and quality evaluation decide trust.
const buildCard = (plan: SqlEvidenceQueryPlan, gated: ReturnType<typeof gate>): AnalysisCardData => {
    const aggregate = plan.query.aggregates![0];
    const [card] = attachAutoAnalysisEvaluationToCards([{
        id: `card-${plan.title}`,
        plan: {
            title: plan.title,
            description: plan.intentSummary,
            chartType: plan.query.groupBy![0] === 'Period' ? 'line' : 'bar',
            aggregation: aggregate.function,
            groupByColumn: plan.query.groupBy![0],
            valueColumn: aggregate.as,
        },
        aggregatedData: gated.rows,
        summary: { language: 'English', text: plan.title },
        displayChartType: 'line',
        isDataVisible: false,
        topN: null,
        hideOthers: false,
        provenance: {
            schemaVersion: 1,
            datasetId: 'demo',
            datasetVersion: 'v1',
            evidenceStatus: 'verified',
            evidenceReasons: [],
            method: {
                operation: 'line',
                groupByColumns: plan.query.groupBy!,
                aggregations: [{ function: aggregate.function, column: aggregate.column ?? null, alias: aggregate.as }],
                sourceColumns: ['Period', 'Value'],
                filterCount: plan.query.where?.predicates?.length ?? 0,
                pivotRows: [],
                pivotColumns: [],
            },
            queryEvidence: null,
            queryEvidenceRequired: false,
            evidenceRefs: [],
            createdAt: '2026-10-23T00:00:00.000Z',
        },
        evidenceValueGate: { ...gated.result, evaluatedAt: '2026-10-23T00:00:00.000Z', source: 'evidence_value_gate_v1' },
    } as AnalysisCardData]);
    return card;
};

describe('melted period-series tables keep the value tied to its series', () => {
    const demos = new Map<string, MeltedDemo>();
    beforeAll(async () => {
        for (const fileName of [TRANSPORT, VISITORS, BUSINESS]) {
            demos.set(fileName, await loadMeltedDemo(fileName));
        }
    }, 120_000);

    it('records at intake whether the melted series can be summed with each other', () => {
        const transport = demos.get(TRANSPORT)!.seriesMeasure;
        expect(transport).toMatchObject({
            seriesColumn: 'DataSeries',
            measureColumn: 'Value',
            periodColumn: 'Period',
            additiveAcrossSeries: false,
        });
        // Rail Length = MRT + LRT holds in every year, but eight unrelated
        // top-level series (km operated, daily ridership, passenger-km) are
        // not covered by any published total.
        expect(transport?.unitFamilies).toEqual([
            { parent: 'Rail Length', children: ['Mass Rapid Transit (MRT)', 'Light Rail Transit (LRT)'] },
        ]);
        expect(transport?.evidence.rootSeries).toBe(9);

        for (const fileName of [VISITORS, BUSINESS]) {
            const semantics = demos.get(fileName)!.seriesMeasure;
            expect(semantics?.additiveAcrossSeries).toBe(true);
            expect(semantics?.evidence.rootSeries).toBe(1);
            expect(semantics?.evidence.parentPeriodsMatched).toBe(semantics?.evidence.parentPeriodsChecked);
            expect(semantics?.evidence.parentSeriesVerified).toBe(semantics?.evidence.parentSeriesChecked);
        }
    });

    it('rejects a cross-series SUM(Value) by Period on transport and keeps a single-series trend verified', () => {
        const transport = demos.get(TRANSPORT)!;
        // The live run's "Total Ridership by Period": km of rail, km operated
        // and daily riders added together, once with the detail-row filter.
        for (const filters of [[], [{ column: 'RowClass', value: 'fact' }]]) {
            const plan = buildPlan({ title: 'Total Ridership by Period', groupBy: 'Period', fn: 'sum', filters });
            const { result } = gate(transport, plan);
            expect(result.decision).toBe('reject');
            expect(result.reasonCodes).toContain('cross_series_aggregate');
        }
        const peak = gate(transport, buildPlan({ title: 'Peak Value by Period', groupBy: 'Period', fn: 'max' }));
        expect(peak.result.decision).toBe('reject');

        const trendPlan = buildPlan({
            title: 'Average daily MRT ridership trend by year',
            groupBy: 'Period',
            fn: 'avg',
            filters: [{ column: 'DataSeries', value: 'Average Daily Ridership - MRT' }],
        });
        const trend = gate(transport, trendPlan);
        expect(trend.result.decision).toBe('pass');
        expect(trend.rows.find(row => row.Period === '2025-01-01')?.avg_value).toBe(3490);
        const trendCard = buildCard(trendPlan, trend);
        expect(trendCard.autoAnalysisEvaluation?.verdict).toBe('trusted');
        expect(resolveCardTrustDecision(trendCard, 'v1').status).toBe('verified');

        // Same-unit siblings verified at intake may be summed (MRT + LRT = Rail Length).
        const railPlan = buildPlan({
            title: 'Rail network length by year',
            groupBy: 'Period',
            fn: 'sum',
            filters: [{ column: 'DataSeries', value: ['Mass Rapid Transit (MRT)', 'Light Rail Transit (LRT)'] }],
        });
        expect(gate(transport, railPlan).result.decision).toBe('pass');
        const doubleCounted = buildPlan({
            title: 'Rail length with its parts',
            groupBy: 'Period',
            fn: 'sum',
            filters: [{ column: 'DataSeries', value: ['Rail Length', 'Mass Rapid Transit (MRT)'] }],
        });
        expect(gate(transport, doubleCounted).result.decision).toBe('reject');
    });


    it.each([VISITORS, BUSINESS])('sums %s over detail rows but never a total together with its components', fileName => {
        const demo = demos.get(fileName)!;
        const detail = gate(demo, buildPlan({
            title: 'Total by period',
            groupBy: 'Period',
            fn: 'sum',
            filters: [{ column: 'RowClass', value: 'fact' }],
        }));
        expect(detail.result.decision).not.toBe('reject');
        expect(detail.result.reasonCodes.filter(code => /series/.test(code))).toEqual([]);

        const mixed = gate(demo, buildPlan({ title: 'Total by period', groupBy: 'Period', fn: 'sum' }));
        expect(mixed.result.decision).toBe('reject');
        expect(mixed.result.reasonCodes).toContain('series_hierarchy_double_count');
    });

    it('does not headline a total of a non-additive series measure in the executive KPIs', () => {
        const transport = demos.get(TRANSPORT)!;
        const plan = buildPlan({
            title: 'Rail length by year',
            groupBy: 'Period',
            fn: 'sum',
            filters: [{ column: 'DataSeries', value: 'Rail Length' }],
        });
        const card = buildCard(plan, gate(transport, plan));
        expect(resolveCardTrustDecision(card, 'v1').status).toBe('verified');
        const kpis = buildExecutiveKpis({
            cards: [card],
            columnProfiles: transport.profiles,
            csvData: { fileName: TRANSPORT, data: transport.rows },
            currentDatasetVersion: 'v1',
            seriesMeasure: transport.seriesMeasure,
        });
        expect(kpis.length).toBeGreaterThan(0);
        expect(kpis.map(kpi => kpi.id)).not.toContain('total-metric');
    });

    it('falls back to a one-series trend topic that plans and passes the gate on transport', async () => {
        const transport = demos.get(TRANSPORT)!;
        const datasetContext = {
            dimensionColumns: ['DataSeries', 'Period'],
            metricColumns: ['Value'],
            seriesMeasure: transport.seriesMeasure,
        };
        const topics = buildDeterministicTopics(transport.profiles, datasetContext);
        expect(topics.length).toBeGreaterThan(0);
        expect(topics[0]).toContain("where DataSeries = '");

        const plan = await generateEvidenceQueryPlanStepped(
            topics[0],
            transport.profiles,
            createTestSettings(),
            null,
            datasetContext,
            null,
            null,
            { deterministicOnly: true },
        );
        expect(plan.query.groupBy).toEqual(['Period']);
        expect(plan.query.where?.predicates).toEqual(expect.arrayContaining([
            expect.objectContaining({ column: 'DataSeries', operator: 'eq' }),
        ]));
        expect(plan.query.aggregates?.[0]).toMatchObject({ function: 'avg', column: 'Value' });
        const gated = gate(transport, plan);
        expect(gated.result.decision).toBe('pass');
        expect(gated.rows.length).toBeGreaterThan(10);
    });

    it('plans an AI topic that names one transport series in words as that series over Period', async () => {
        const transport = demos.get(TRANSPORT)!;
        const datasetContext = {
            dimensionColumns: ['DataSeries', 'Period'],
            metricColumns: ['Value'],
            seriesMeasure: transport.seriesMeasure,
        };
        const cases = [
            ['Average Daily Ridership - MRT by Period', 'Average Daily Ridership - MRT'],
            ['Year-over-year trend in Average Daily Ridership – Public Bus', 'Average Daily Ridership - Public Bus'],
            ['How did Mass Rapid Transit (MRT) change over the years?', 'Mass Rapid Transit (MRT)'],
        ] as const;
        for (const [topic, series] of cases) {
            expect(resolveTopicSeriesFilter(topic, transport.seriesMeasure)).toBe(series);
            // Not deterministicOnly: the plan must come without asking the AI
            // (these settings have no key), from the named series alone.
            const plan = await generateEvidenceQueryPlanStepped(topic, transport.profiles, createTestSettings(), 'Detail rows: RowClass = fact', datasetContext, null, null);
            expect(plan.query.groupBy).toEqual(['Period']);
            expect(plan.query.where?.predicates).toEqual([{ column: 'DataSeries', operator: 'eq', value: series }]);
            expect(plan.query.aggregates).toEqual([expect.objectContaining({ function: 'avg', column: 'Value' })]);
            expect(assessSeriesMeasurePlan(plan, transport.seriesMeasure).decision).toBe('pass');
            const gated = gate(transport, plan);
            expect(gated.result.decision).toBe('pass');
            expect(gated.rows.length).toBeGreaterThan(5);
        }
        // Two series, or only part of a series name, pick no single series.
        expect(resolveTopicSeriesFilter('Average Daily Ridership - MRT vs Average Daily Ridership - LRT', transport.seriesMeasure)).toBeNull();
        expect(resolveTopicSeriesFilter('MRT ridership by Period', transport.seriesMeasure)).toBeNull();
    });

    it('sends back Pi research questions that aggregate the transport value across series', () => {
        const transport = demos.get(TRANSPORT)!;
        const validation = validateResearchQuestions({
            questions: [
                { title: 'Total ridership by year', dimension: 'Period', metric: 'Value', aggregation: 'sum' },
                { title: 'How many records per series?', dimension: 'DataSeries', metric: null, aggregation: 'count' },
                { title: 'Average daily MRT ridership trend', dimension: 'Period', metric: 'Value', aggregation: 'avg', series: 'average daily ridership - mrt' },
                { title: 'Typical value per series', dimension: 'DataSeries', metric: 'Value', aggregation: 'median' },
            ],
        }, transport.profiles);
        const scoped = checkQuestionSeriesScope(validation.questions, transport.seriesMeasure);
        expect(scoped.rejected.map(item => item.title)).toEqual(['Total ridership by year', 'How many records per series?']);
        const trend = scoped.questions.find(question => question.title === 'Average daily MRT ridership trend')!;
        expect(trend.filter).toEqual({ column: 'DataSeries', value: 'Average Daily Ridership - MRT' });
        expect(buildResearchTopic(trend)).toBe(
            "Average daily MRT ridership trend (avg of Value by Period, where DataSeries = 'Average Daily Ridership - MRT')",
        );

        // Additive tables keep the sum, restricted to detail rows.
        const visitors = demos.get(VISITORS)!;
        const visitorScoped = checkQuestionSeriesScope(validateResearchQuestions({
            questions: [{ title: 'Total visitor arrivals by month', dimension: 'Period', metric: 'Value', aggregation: 'sum' }],
        }, visitors.profiles).questions, visitors.seriesMeasure);
        expect(visitorScoped.rejected).toEqual([]);
        expect(visitorScoped.questions[0].filter).toEqual({ column: 'RowClass', value: 'fact' });
    });
});
