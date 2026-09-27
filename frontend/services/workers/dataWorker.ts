/// <reference lib="webworker" />

import { profileData } from '../data/dataProfiler';
import { executeDataQuery } from '../agent/execution/dataOperationRunner';
import { executeAggregationCore } from '../agent/execution/executors/aggregationCore';
import { executeAiCleaningProgram } from '../agent/execution/aiCleaningProgram';
import type { CsvRow, CsvData, QueryPlan, AiCleaningProgram, ColumnProfile } from '../../types';
import type { AggregationSpec } from '../agent/execution/executors/aggregationCore';

type WorkerRequest = {
    id: number;
    task: 'profileData' | 'executeAggregation' | 'executeDataQuery' | 'executeAiCleaningProgram' | 'ping';
    payload: any;
};

type WorkerResponse = {
    id: number;
    success: boolean;
    result?: any;
    error?: string;
};

const ctx: DedicatedWorkerGlobalScope = self as any;

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
    const { id, task, payload } = event.data;
    const taskStart = Date.now();
    try {
        let result: any;
        if (task === 'profileData') {
            result = profileData(payload.rows as CsvRow[]);
        } else if (task === 'executeAggregation') {
            result = executeAggregationCore(payload.data as CsvData, payload.spec as AggregationSpec);
        } else if (task === 'executeDataQuery') {
            result = executeDataQuery(payload.rows as CsvRow[], payload.plan as QueryPlan, payload.options);
        } else if (task === 'executeAiCleaningProgram') {
            result = executeAiCleaningProgram(
                payload.rows as CsvRow[],
                payload.program as AiCleaningProgram,
                payload.profiles as ColumnProfile[] | undefined,
            );
        } else if (task === 'ping') {
            result = { pong: true };
        } else {
            throw new Error(`Unknown task: ${task}`);
        }
        const taskMs = Date.now() - taskStart;
        if (taskMs > 50) {
            console.warn(
                `[DataWorker] ⚠ Slow task '${task}': ${taskMs}ms (id=${id})`,
            );
        }
        const response: WorkerResponse = { id, success: true, result };
        ctx.postMessage(response);
    } catch (error) {
        const taskMs = Date.now() - taskStart;
        console.warn(`[DataWorker] ⚠ Failed task '${task}': ${taskMs}ms (id=${id})`, error);
        const response: WorkerResponse = {
            id,
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
        ctx.postMessage(response);
    }
};
