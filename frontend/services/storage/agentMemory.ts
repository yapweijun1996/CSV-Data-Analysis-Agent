import type { AgentMemoryRun, StoredReportArtifactRecord, ReportMemoryScope } from '../../types';
import { toSerializable } from '../../utils/serializable';
import { MEMORY_STORE_NAME, REPORT_ARTIFACTS_STORE_NAME, StorageOperationError, getDb } from './connection';

export const saveAgentMemoryRun = async (run: AgentMemoryRun): Promise<void> => {
    try {
        const db = await getDb();
        await db.put(MEMORY_STORE_NAME, toSerializable(run));
    } catch (error) {
        console.error('Failed to save agent memory run:', error);
    }
};

export const getAgentMemoryRuns = async (
    scope?: ReportMemoryScope,
): Promise<AgentMemoryRun[]> => {
    try {
        const db = await getDb();
        if (scope) {
            const runs = await db.getAllFromIndex(
                MEMORY_STORE_NAME,
                'datasetId',
                IDBKeyRange.only(scope.datasetId),
            );
            const scopedRuns = runs.filter(run =>
                run.reportId === scope.reportId
                && run.datasetVersion === scope.datasetVersion);
            return scopedRuns.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        const allRuns = await db.getAll(MEMORY_STORE_NAME);
        return allRuns.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
        console.error('Failed to read agent memory runs:', error);
        return [];
    }
};

export const getLatestAgentMemoryRun = async (
    scope: ReportMemoryScope,
): Promise<AgentMemoryRun | null> => {
    try {
        const runs = await getAgentMemoryRuns(scope);
        if (runs.length === 0) return null;
        return runs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    } catch (error) {
        console.error('Failed to load latest agent memory run:', error);
        return null;
    }
};

export const saveReportArtifactRecord = async (record: StoredReportArtifactRecord): Promise<void> => {
    try {
        const db = await getDb();
        await db.put(REPORT_ARTIFACTS_STORE_NAME, toSerializable(record));
    } catch (error) {
        console.error('Failed to save report artifact record:', error);
        throw new StorageOperationError('saveReportArtifactRecord', error);
    }
};

export const getReportArtifactRecord = async (reportId: string): Promise<StoredReportArtifactRecord | undefined> => {
    try {
        const db = await getDb();
        return await db.get(REPORT_ARTIFACTS_STORE_NAME, reportId);
    } catch (error) {
        console.error('Failed to read report artifact record:', error);
        return undefined;
    }
};

// Original Data Management (for cleaning rollback)
