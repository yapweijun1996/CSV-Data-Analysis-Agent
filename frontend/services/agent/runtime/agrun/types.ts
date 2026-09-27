/**
 * Typed app boundary for the Agent Runtime JavaScript distribution.
 *
 * UI, manifests, orchestrators, and executors must not import the distribution
 * directly. Version-specific export handling stays in agrunModule.ts while
 * follow-up lifecycle ownership stays in followUpRuntimeAdapter.ts.
 */
import type {
    GroundingResult,
    IntentClassificationFindings,
    QueryUnderstandingArtifact,
} from '../intentClassificationTypes';
import type { StoreApi } from '../../types';
import type { AgrunCheckpointRecord } from './checkpointStore';

export type {
    InitialAnalysisBudgetState,
    InitialAnalysisCheckpointHostState,
    InitialAnalysisPhase,
    InitialAnalysisProviderSelection,
    InitialAnalysisRunError,
    InitialAnalysisRunOutcome,
    InitialAnalysisRunRequest,
    InitialAnalysisRunStatus,
    InitialAnalysisWarning,
} from './initialAnalysisTypes';

export type AgrunRecord = Record<string, unknown>;

export interface AgrunRunOptions {
    abortSignal?: AbortSignal;
    disabledActions?: string[];
    onCheckpoint?: (envelope: unknown) => void | Promise<void>;
    onStep?: (step: unknown) => void | Promise<void>;
    onToken?: (delta: unknown) => void | Promise<void>;
    onStreamEvent?: (event: unknown) => void | Promise<void>;
    resumeState?: AgrunRecord;
    [key: string]: unknown;
}

export interface AgrunRuntime {
    run(input: AgrunRecord, options?: AgrunRunOptions): Promise<unknown>;
    runStream?(input: AgrunRecord, options?: AgrunRunOptions): AsyncGenerator<unknown, unknown, void>;
    createSession?(options?: AgrunRecord): Promise<unknown>;
    openSession?(sessionId: string): Promise<unknown>;
    getState(): unknown;
    getRuntimeConfig(): unknown;
    getActionRegistry?(): unknown[];
    importCheckpointState?(envelope: AgrunRecord): AgrunRecord;
    subscribeEvents?(callback: (event: unknown) => void, options?: AgrunRecord): () => void;
}

export interface AgrunRuntimeOptions extends AgrunRecord {
    agentSkills?: unknown[];
    customActions?: unknown[];
    disabledActions?: string[];
    globalMemory?: {
        enabled: boolean;
        [key: string]: unknown;
    };
    maxSteps?: number;
}

export interface AgrunActionContext extends AgrunRecord {
    request?: AgrunRecord & {
        signal?: AbortSignal;
        agrunSessionId?: string | null;
        contextSnapshot?: AgrunRecord | null;
        sessionContext?: AgrunRecord | null;
    };
}

export interface AgrunActionPlannerSpec {
    argsSchema: Record<string, AgrunRecord>;
    argsExample?: AgrunRecord;
    guidance: string;
    aliases?: string[];
    decisionType?: string;
}

export interface AgrunActionSpec {
    name: string;
    description: string;
    planner: AgrunActionPlannerSpec;
    tier: number;
    permission?: AgrunRecord;
    execute(
        context: AgrunActionContext,
        args: AgrunRecord,
    ): unknown | Promise<unknown>;
    outputSchema: {
        kinds: string[];
        controls: Array<'continue' | 'stop' | 'complete'>;
    } | null;
    timeoutMs?: number;
    timeoutBehavior?: string;
}

export interface AgrunModule {
    createRuntime: (options?: AgrunRuntimeOptions) => AgrunRuntime;
    defineAction: (spec: AgrunActionSpec) => unknown;
    createSessionStore: (...args: unknown[]) => unknown;
    createMemoryStore: (...args: unknown[]) => unknown;
    createIndexedDBMessageStorage: (...args: unknown[]) => unknown;
    exportState?: (input: AgrunRecord, options?: AgrunRecord) => AgrunRecord;
    importState?: (envelope: AgrunRecord) => AgrunRecord;
    openaiBrowserSkill?: unknown;
    geminiBrowserSkill?: unknown;
}

export type AgrunLoadStatus = 'idle' | 'loading' | 'loaded' | 'failed';

export interface AgrunRuntimeDebugState {
    /** Git revision of yapweijun1996/Agent-Runtime-JavaScript pinned in package.json. */
    pinnedRevision: string;
    /** Dist package name + version consumed through the loader. */
    distPackage: string;
    loadStatus: AgrunLoadStatus;
    loadError: string | null;
}

export interface FollowUpRuntimeRequest {
    message: string;
    sessionId: string;
    turnId: string;
    intentFindings?: IntentClassificationFindings;
    queryUnderstandingArtifact?: QueryUnderstandingArtifact;
    groundingResult?: GroundingResult;
    signal?: AbortSignal;
}

export type FollowUpRuntimeStatus = 'completed' | 'blocked' | 'failed' | 'cancelled';

export interface FollowUpRuntimeError {
    code: string;
    message: string;
    retryable: boolean;
}

export interface FollowUpPendingInteraction {
    kind: 'clarification' | 'approval';
    prompt: string;
    actionName?: string;
    resumeToken?: unknown;
}

export interface FollowUpRuntimeResult {
    status: FollowUpRuntimeStatus;
    appTurnId: string;
    runtimeRunId?: string;
    text?: string;
    error?: FollowUpRuntimeError;
    pendingInteraction?: FollowUpPendingInteraction;
    groundingMode?:
        | 'deterministic_complete_query_table'
        | 'deterministic_derived_margin_table'
        | 'deterministic_derived_cost_per_result_table'
        | 'deterministic_ranked_share';
    usage?: {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
    };
}

export type FollowUpInteractionResolution =
    | {
        kind: 'clarification';
        sessionId: string;
        turnId: string;
        answer: string;
        resumeToken?: unknown;
        signal?: AbortSignal;
    }
    | {
        kind: 'approval';
        sessionId: string;
        turnId: string;
        decision: 'approve' | 'deny';
        resumeToken: unknown;
        signal?: AbortSignal;
    };

export interface FollowUpRuntimeAdapter {
    initialize(): Promise<void>;
    run(request: FollowUpRuntimeRequest, store: StoreApi): Promise<FollowUpRuntimeResult>;
    recover?(
        request: FollowUpRuntimeRequest,
        checkpoint: AgrunCheckpointRecord,
        store: StoreApi,
    ): Promise<FollowUpRuntimeResult>;
    resume(
        interaction: FollowUpInteractionResolution,
        store: StoreApi,
    ): Promise<FollowUpRuntimeResult>;
    cancel(turnId: string): void;
}

export interface InitialAnalysisRuntimeAdapter {
    initialize(): Promise<void>;
    run(
        request: import('./initialAnalysisTypes').InitialAnalysisRunRequest,
        store: StoreApi,
    ): Promise<import('./initialAnalysisTypes').InitialAnalysisRunOutcome>;
    recover?(
        request: import('./initialAnalysisTypes').InitialAnalysisRunRequest,
        checkpoint: AgrunCheckpointRecord,
        store: StoreApi,
    ): Promise<import('./initialAnalysisTypes').InitialAnalysisRunOutcome>;
    cancel(appSessionId: string): void;
}

export interface AgrunRunAdapterContext {
    appTurnId: string;
    sessionId: string;
    store: StoreApi;
}

/**
 * AGRUN-002 composition seam. AGRUN-003 supplies request/action mapping and
 * AGRUN-004 supplies result normalization without moving lifecycle ownership
 * out of FollowUpRuntimeAdapter.
 */
export interface FollowUpRuntimeExecutionBindings {
    createRunInput(
        request: FollowUpRuntimeRequest,
        store: StoreApi,
    ): AgrunRecord | Promise<AgrunRecord>;
    createResumeInput(
        interaction: FollowUpInteractionResolution,
        store: StoreApi,
    ): AgrunRecord | Promise<AgrunRecord>;
    normalizeResult(
        result: unknown,
        context: AgrunRunAdapterContext,
    ): FollowUpRuntimeResult | Promise<FollowUpRuntimeResult>;
    projectEvent?(
        event: unknown,
        context: AgrunRunAdapterContext,
    ): void | Promise<void>;
    projectToken?(
        delta: unknown,
        context: AgrunRunAdapterContext,
    ): void | Promise<void>;
}

export type AgrunRuntimeFactory = () => Promise<AgrunRuntime>;
