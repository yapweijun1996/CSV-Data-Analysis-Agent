
import { saveAgentMemoryRun, getAgentMemoryRuns } from '../../storageService';
import { agentMemoryCollector } from './agentMemoryCollector';
import { StoreApi } from '../types';
import { resolveReportMemoryScope } from './memoryScope';
import { getPreferredAnalysisDataset } from '../reportStructureState';
import { getCsvDataRowCount } from '../../../utils/datasetId';

export const finalizeAndSaveRun = async (store: StoreApi) => {
    const { getState, setState } = store;
    try {
        const state = getState();
        const timelineSnapshot = state.agentEvents;
        const scope = resolveReportMemoryScope(state);
        const preparedDataset = getPreferredAnalysisDataset(state);
        if (preparedDataset) {
            agentMemoryCollector.updateDatasetFacts({
                fileName: preparedDataset.fileName,
                rowCount: getCsvDataRowCount(preparedDataset),
                columnProfiles: state.columnProfiles,
            });
        }
        const memoryRun = agentMemoryCollector.finalizeRun(timelineSnapshot, scope);
        if (memoryRun) {
            await saveAgentMemoryRun(memoryRun);
            const historyRuns = scope ? await getAgentMemoryRuns(scope) : [];
            setState({
                agentMemoryRun: memoryRun,
                liveAgentMemoryRun: memoryRun,
                agentMemoryHistory: historyRuns,
                // Keep the monitor on the live event stream after a run
                // finishes. Historical memory remains selectable explicitly.
                selectedMemoryRunId: null,
                dataQualityIssues: memoryRun.findings.warnings.map(warning => warning.message),
            });
        } else {
            setState({ agentMemoryRun: null, selectedMemoryRunId: null });
        }
    } catch (memoryError) {
        console.error('[AgentMemory] Failed to persist run:', memoryError);
    }
};
