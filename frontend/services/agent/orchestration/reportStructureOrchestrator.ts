import type { AppState, ReportBoundary, ReportIntakeIr, ReportStructureProposal, Settings } from '../../../types';
import { detectReportStructureProposalWithAi, shouldRequestReportStructureProposal } from '../../ai/reportStructureProposal';
import { resolveReportStructureArtifacts } from '../reportStructureState';

// Cache AI proposals by rawIntakeIr object reference so repeated rebuilds (boundary override,
// restart, resume) skip redundant model calls. The WeakMap evicts entries automatically when
// the IR object is garbage-collected (i.e. after a new file is loaded).
const proposalCache = new WeakMap<ReportIntakeIr, Promise<ReportStructureProposal | null>>();

type ResolveArtifactsInput = {
    rawCsvData: AppState['rawCsvData'];
    csvData: AppState['csvData'];
    rawIntakeIr: AppState['rawIntakeIr'];
    cleaningRun: AppState['cleaningRun'];
    dataPreparationPlan: AppState['dataPreparationPlan'];
    columnProfiles?: AppState['columnProfiles'];
    humanBoundary?: ReportBoundary | null;
};

export const resolveReportStructureArtifactsWithProposal = async (
    params: ResolveArtifactsInput & {
        settings: Settings;
        telemetryTarget?: {
            sessionId?: string;
            currentDatasetId?: string | null;
        };
    },
) => {
    const baseline = resolveReportStructureArtifacts(params);
    const boundary = baseline.reportStructureResolution
        ? {
            headerRowIndex: baseline.reportStructureResolution.headerRowIndex,
            headerLayerRowIndexes: baseline.reportStructureResolution.headerLayerRowIndexes,
            bodyStartIndex: baseline.reportStructureResolution.bodyStartIndex,
            summaryStartIndex: baseline.reportStructureResolution.summaryStartIndex,
            parameterRowIndexes: baseline.reportStructureResolution.parameterRowIndexes,
            repeatedHeaderRowIndexes: baseline.reportStructureResolution.repeatedHeaderRowIndexes,
        }
        : null;

    if (!boundary || !params.rawIntakeIr || !shouldRequestReportStructureProposal({
        settings: params.settings,
        rawIntakeIr: params.rawIntakeIr,
        boundary,
        runtimeTableAssessment: baseline.reportStructureResolution?.runtimeTableAssessment ?? null,
        rowInspection: baseline.reportStructureResolution?.rowInspection ?? null,
    })) {
        return baseline;
    }

    if (!proposalCache.has(params.rawIntakeIr)) {
        proposalCache.set(
            params.rawIntakeIr,
            detectReportStructureProposalWithAi({
                rawIntakeIr: params.rawIntakeIr,
                boundary,
                rowInspection: baseline.reportStructureResolution?.rowInspection ?? null,
                runtimeTableAssessment: baseline.reportStructureResolution?.runtimeTableAssessment ?? null,
                settings: params.settings,
                telemetryTarget: params.telemetryTarget,
            }),
        );
    }
    const structureProposal = await proposalCache.get(params.rawIntakeIr)!;

    if (!structureProposal) {
        return baseline;
    }

    return resolveReportStructureArtifacts({
        ...params,
        structureProposal,
    });
};
