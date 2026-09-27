import {
    AgentMemoryRun,
    AgentMemoryColumnVerdict,
    AgentMemoryWarning,
    AgentMemoryExploration,
    AgentMemoryExplorationVerdict,
    ColumnProfile,
    ColumnRole,
    AggregationType,
    AgentEvent,
    DatasetKnowledge,
    DatasetColumnKnowledge,
    ReportMemoryScope,
} from '../../../types';
import {
    createInitialDatasetKnowledge,
    updateDatasetKnowledgeFacts,
    updateKnowledgeForColumnEvaluation,
    updateKnowledgeForRemovedColumns,
    updateKnowledgeForExploration,
    finalizeDatasetKnowledge,
} from '../contextBuilder';
import { createId } from '../../../utils/createId';

type ColumnEvaluation = {
    keepColumns: { name: string; role: ColumnRole }[];
    dropColumns: { name: string; role: ColumnRole; reason: string }[];
};

type RemovedNoiseColumnInput = {
    name: string;
    reason: string;
    role: ColumnRole;
    constantValue: string;
    sampleValues: string[];
};

type ExplorationRecordInput = {
    planTitle: string;
    groupBy: string[];
    metric?: string | null;
    aggregation?: AggregationType;
};

type ExplorationCompleteInput = {
    verdict: AgentMemoryExplorationVerdict;
    dropReason?: string;
    qualityWarning?: string | null;
    metrics?: {
        groups: number;
        uniqueValues: number;
        topShare: number | null;
    };
    commentary?: string;
};

const buildFacts = (fileName: string, rowCount: number, columnProfiles: ColumnProfile[]) => {
    const dimensions = columnProfiles
        .filter(col => ['categorical', 'date', 'time'].includes(col.type))
        .map(col => col.name);
    const metrics = columnProfiles
        .filter(col => ['numerical', 'currency', 'percentage'].includes(col.type))
        .map(col => col.name);
    return {
        fileName,
        rowCount,
        columnCount: columnProfiles.length,
        dimensions,
        metrics,
    };
};

class AgentMemoryCollector {
    private run: AgentMemoryRun | null = null;
    private explorationIndex = new Map<string, AgentMemoryExploration>();
    private datasetKnowledge: DatasetKnowledge | null = null;
    private columnKnowledge = new Map<string, DatasetColumnKnowledge>();

    startRun(params: { datasetId: string; fileName: string; rowCount: number; columnProfiles: ColumnProfile[] }): string {
        const runId = createId('memory-run');
        this.run = {
            runId,
            datasetId: params.datasetId,
            createdAt: new Date(),
            findings: {
                datasetFacts: buildFacts(params.fileName, params.rowCount, params.columnProfiles),
                columnVerdicts: [],
                explorations: [],
                warnings: [],
            },
        };
        this.explorationIndex.clear();
        this.columnKnowledge.clear();
        this.datasetKnowledge = createInitialDatasetKnowledge(params.rowCount, params.columnProfiles);
        return runId;
    }

    updateDatasetFacts(params: { fileName: string; rowCount: number; columnProfiles: ColumnProfile[] }) {
        if (!this.run || !this.datasetKnowledge) return;
        this.run.findings.datasetFacts = buildFacts(params.fileName, params.rowCount, params.columnProfiles);
        updateDatasetKnowledgeFacts(this.datasetKnowledge, this.columnKnowledge, params);
    }

    recordColumnEvaluation(schema: ColumnProfile[], evaluation: ColumnEvaluation) {
        if (!this.run || !this.datasetKnowledge) return;
        
        const dropMap = new Map(evaluation.dropColumns.map(col => [col.name.toLowerCase(), col]));
        const keepMap = new Map(evaluation.keepColumns.map(col => [col.name.toLowerCase(), col]));
        
        const verdicts = schema.map(column => {
            const key = column.name.toLowerCase();
            const dropDecision = dropMap.get(key);
            const keepDecision = keepMap.get(key);
            return {
                name: column.name,
                role: dropDecision?.role ?? keepDecision?.role ?? 'dimension',
                distinctValues: column.uniqueValues,
                removed: Boolean(dropDecision),
                reason: dropDecision?.reason,
            } as AgentMemoryColumnVerdict;
        });
        
        this.run.findings.columnVerdicts.push(...verdicts);
        updateKnowledgeForColumnEvaluation(this.columnKnowledge, schema, evaluation);
    }

    recordRemovedColumns(columns: RemovedNoiseColumnInput[], rowCount: number) {
        if (!this.run || columns.length === 0) return;

        const verdictsToUpdate = new Map(this.run.findings.columnVerdicts.map(v => [v.name.toLowerCase(), v]));
        columns.forEach(column => {
            const verdict = verdictsToUpdate.get(column.name.toLowerCase());
            if (verdict) {
                verdict.removed = true;
                verdict.reason = column.reason;
                verdict.constantValue = column.constantValue;
                verdict.sampleValues = column.sampleValues;
            }
            
            const normalizedValue = column.constantValue.trim();
            const sampleFallback = column.sampleValues?.[0]?.trim() ?? '';
            const displayValue = normalizedValue || sampleFallback;
            const formattedValue = displayValue.length > 0 ? ` ${displayValue}` : '';
            const message = `Column "${column.name}" has the same value${formattedValue} on all ${rowCount} rows. Treated as constant metadata and removed from cleaned dataset.`;
            this.addWarning({
                id: createId('warning'),
                type: 'dropped_column',
                message,
                relatedColumns: [column.name],
            });
        });
        updateKnowledgeForRemovedColumns(this.columnKnowledge, columns);
    }

    recordDataIssue(issue: string) {
        if (!this.run) return;
        this.addWarning({
            id: createId('warning'),
            type: 'data_issue',
            message: issue,
        });
    }

    beginExploration(params: ExplorationRecordInput): string | null {
        if (!this.run) return null;
        const exploration: AgentMemoryExploration = {
            id: createId('exploration'),
            startedAt: new Date(),
            planTitle: params.planTitle,
            groupBy: params.groupBy,
            metric: params.metric,
            aggregation: params.aggregation,
            verdict: 'skipped',
        };
        this.run.findings.explorations.push(exploration);
        this.explorationIndex.set(exploration.id, exploration);
        return exploration.id;
    }

    completeExploration(id: string | null, result: ExplorationCompleteInput) {
        if (!this.run || !id) return;
        const exploration = this.explorationIndex.get(id);
        if (!exploration) return;
        exploration.verdict = result.verdict;
        exploration.dropReason = result.dropReason;
        exploration.metrics = result.metrics;
        exploration.commentary = result.commentary;
        if (this.datasetKnowledge) {
            updateKnowledgeForExploration(this.datasetKnowledge, exploration, result);
        }
    }

    markExplorationAsCard(id: string | null) {
        if (!this.run || !id) return;
        const exploration = this.explorationIndex.get(id);
        if (!exploration) return;
        exploration.cardCreated = true;
        exploration.verdict = exploration.verdict === 'skipped' ? 'useful' : exploration.verdict;
    }

    failExploration(id: string | null, message: string) {
        if (!this.run || !id) return;
        const exploration = this.explorationIndex.get(id);
        if (!exploration) return;
        exploration.verdict = 'error';
        exploration.commentary = message;
    }

    getWarningSummaries(): string[] {
        if (!this.run) return [];
        return this.run.findings.warnings.map(warning => warning.message);
    }

    finalizeRun(timeline?: AgentEvent[], scope?: ReportMemoryScope | null): AgentMemoryRun | null {
        if (!this.run) return null;
        
        const finalKnowledge = this.datasetKnowledge ? finalizeDatasetKnowledge(this.datasetKnowledge, this.columnKnowledge) : undefined;

        const finalized: AgentMemoryRun = {
            runId: this.run.runId,
            datasetId: this.run.datasetId,
            ...(scope ? {
                reportId: scope.reportId,
                datasetVersion: scope.datasetVersion,
                origin: {
                    kind: 'agent_run' as const,
                    label: 'Completed agent analysis run',
                    sourceId: this.run.runId,
                    createdAt: new Date().toISOString(),
                },
            } : {}),
            createdAt: this.run.createdAt,
            findings: {
                datasetFacts: this.run.findings.datasetFacts,
                columnVerdicts: [...this.run.findings.columnVerdicts],
                explorations: [...this.run.findings.explorations],
                warnings: [...this.run.findings.warnings],
                datasetKnowledge: finalKnowledge,
            },
            timeline: timeline
                ? timeline.map(event => ({
                      ...event,
                      timestamp: new Date(event.timestamp),
                  }))
                : undefined,
        };
        this.run = null;
        this.explorationIndex.clear();
        this.datasetKnowledge = null;
        this.columnKnowledge.clear();
        return finalized;
    }

    private addWarning(warning: AgentMemoryWarning) {
        if (!this.run) return;
        this.run.findings.warnings.push(warning);
    }
}

export const agentMemoryCollector = new AgentMemoryCollector();
