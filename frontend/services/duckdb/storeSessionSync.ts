import type { AppStore } from '../../store/useAppStore';
import type { ColumnRegistry, CsvData, DuckDbSessionStatus } from '../../types';
import { primeDuckDbDataset } from './queryEngine';
import {
    createBindingDuckDbSessionStatus,
    createDuckDbSessionStatusFromBinding,
    createIdleDuckDbSessionStatus,
    isDuckDbSessionStatusEqual,
} from './sessionStatus';
import type { WorkerDiagnosticsReporter } from '../workers/workerDiagnostics';
import { buildEffectiveColumnRegistryFromState } from '../data/columnRegistry';

type SessionSyncStore = {
    getState: () => {
        csvData?: CsvData | null;
        columnRegistry?: ColumnRegistry | null;
        columnProfiles?: AppStore['columnProfiles'];
        datasetSemanticSnapshot?: AppStore['datasetSemanticSnapshot'];
        userColumnAnnotations?: AppStore['userColumnAnnotations'];
        latestAnalysisSession?: AppStore['latestAnalysisSession'];
        duckDbSessionStatus?: DuckDbSessionStatus;
        refreshDuckDbSession?: (datasetOverride?: CsvData | null) => Promise<DuckDbSessionStatus>;
    };
    setState: (
        partial:
            | Partial<AppStore>
            | ((state: AppStore) => Partial<AppStore>)
    ) => void;
};

export const ensureDuckDbSessionSync = async (
    store: SessionSyncStore,
    dataset?: CsvData | null,
    reportDiagnostics?: WorkerDiagnosticsReporter,
): Promise<DuckDbSessionStatus> => {
    const t0 = performance.now();
    const state = store.getState();
    if (typeof state.refreshDuckDbSession === 'function') {
        const result = await state.refreshDuckDbSession(dataset ?? null);
        console.log(`[Perf:SessionSync] via refreshDuckDbSession: ${Math.round(performance.now() - t0)}ms`);
        return result;
    }

    const nextDataset = dataset ?? state.csvData ?? null;
    if (!nextDataset) {
        const idleStatus = createIdleDuckDbSessionStatus();
        if (!isDuckDbSessionStatusEqual(store.getState().duckDbSessionStatus as DuckDbSessionStatus | undefined, idleStatus)) {
            store.setState({ duckDbSessionStatus: idleStatus });
        }
        return idleStatus;
    }

    const bindingStatus = createBindingDuckDbSessionStatus(store.getState().duckDbSessionStatus as DuckDbSessionStatus | undefined);
    if (!isDuckDbSessionStatusEqual(store.getState().duckDbSessionStatus as DuckDbSessionStatus | undefined, bindingStatus)) {
        store.setState({ duckDbSessionStatus: bindingStatus });
    }
    const tReg = performance.now();
    const nextRegistry = buildEffectiveColumnRegistryFromState(state, {
        datasetOverride: nextDataset,
    });
    console.log(`[Perf:SessionSync] buildRegistry: ${Math.round(performance.now() - tReg)}ms`);
    const tPrime = performance.now();
    const binding = await primeDuckDbDataset(nextDataset, undefined, reportDiagnostics, undefined, nextRegistry);
    console.log(`[Perf:SessionSync] primeDuckDbDataset: ${Math.round(performance.now() - tPrime)}ms`);
    const nextStatus = binding
        ? createDuckDbSessionStatusFromBinding(binding)
        : createIdleDuckDbSessionStatus();
    if (!isDuckDbSessionStatusEqual(store.getState().duckDbSessionStatus as DuckDbSessionStatus | undefined, nextStatus)) {
        store.setState({ duckDbSessionStatus: nextStatus });
    }
    console.log(`[Perf:SessionSync] total: ${Math.round(performance.now() - t0)}ms`);
    return nextStatus;
};
