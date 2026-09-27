/**
 * AGRUN-002: creates the Agent Runtime JavaScript runtime behind one typed,
 * lazy boundary. Provider skills and app actions are added by later adapters.
 */
import { loadAgrunModule } from './agrunLoader';
import type {
    AgrunModule,
    AgrunRuntime,
    AgrunRuntimeFactory,
    AgrunRuntimeOptions,
} from './types';
import {
    AGRUN_GLOBAL_MEMORY_ENABLED,
} from '../../memory/memoryOwnership';

export const AGRUN_FOLLOW_UP_MAX_STEPS = 8;
// Nine governed host actions plus bounded format/terminal correction cycles.
// Complex report observations can require several correction cycles even when
// every host action is valid, so 12 steps could stop at 7/9 before evidence.
export const AGRUN_INITIAL_ANALYSIS_MAX_STEPS = 18;
export const AGRUN_DISABLED_NETWORK_ACTIONS = Object.freeze([
    'web_search',
    'read_url',
]);

type AgrunModuleLoader = () => Promise<AgrunModule>;
type AgrunRuntimeOptionsFactory = (
    module: AgrunModule,
) => AgrunRuntimeOptions | Promise<AgrunRuntimeOptions>;

const isAgrunRuntime = (candidate: unknown): candidate is AgrunRuntime => {
    if (!candidate || typeof candidate !== 'object') return false;
    const runtime = candidate as Partial<AgrunRuntime>;
    return typeof runtime.run === 'function'
        && typeof runtime.getState === 'function'
        && typeof runtime.getRuntimeConfig === 'function';
};

export const buildAgrunFollowUpRuntimeOptions = (
    overrides: AgrunRuntimeOptions = {},
): AgrunRuntimeOptions => ({
    ...overrides,
    agentSkills: overrides.agentSkills ?? [],
    customActions: overrides.customActions ?? [],
    disabledActions: Array.from(new Set([
        ...AGRUN_DISABLED_NETWORK_ACTIONS,
        ...(overrides.disabledActions ?? []),
    ])),
    globalMemory: {
        ...(overrides.globalMemory ?? {}),
        enabled: AGRUN_GLOBAL_MEMORY_ENABLED,
    },
    maxSteps: overrides.maxSteps ?? AGRUN_FOLLOW_UP_MAX_STEPS,
});

export const buildAgrunInitialAnalysisRuntimeOptions = (
    overrides: AgrunRuntimeOptions = {},
): AgrunRuntimeOptions => ({
    ...overrides,
    // The initial lifecycle has a fixed, governed action sequence. Use the
    // providers' native tool protocol so a valid host action is not dependent
    // on the model reproducing Agrun's JSON envelope syntax. The adapter's
    // onBeforeFinalize guard and host bridge still enforce exact ordering.
    plannerMode: overrides.plannerMode ?? 'native_tools',
    agentSkills: overrides.agentSkills ?? [],
    customActions: overrides.customActions ?? [],
    disabledActions: Array.from(new Set([
        ...AGRUN_DISABLED_NETWORK_ACTIONS,
        ...(overrides.disabledActions ?? []),
    ])),
    globalMemory: {
        ...(overrides.globalMemory ?? {}),
        enabled: false,
    },
    maxSteps: overrides.maxSteps ?? AGRUN_INITIAL_ANALYSIS_MAX_STEPS,
});

const createRuntimeFactory = ({
    loadModule = loadAgrunModule,
    runtimeOptions = {},
    runtimeOptionsFactory,
    buildOptions,
}: {
    loadModule?: AgrunModuleLoader;
    runtimeOptions?: AgrunRuntimeOptions;
    runtimeOptionsFactory?: AgrunRuntimeOptionsFactory;
    buildOptions: (options?: AgrunRuntimeOptions) => AgrunRuntimeOptions;
}): AgrunRuntimeFactory => {
    let runtimePromise: Promise<AgrunRuntime> | null = null;

    return () => {
        if (runtimePromise) return runtimePromise;

        runtimePromise = loadModule()
            .then(async module => {
                const dynamicOptions = runtimeOptionsFactory
                    ? await runtimeOptionsFactory(module)
                    : {};
                const runtime = module.createRuntime(
                    buildOptions({
                        ...runtimeOptions,
                        ...dynamicOptions,
                    }),
                );
                if (!isAgrunRuntime(runtime)) {
                    throw new Error(
                        'Agent Runtime JavaScript createRuntime returned an incompatible runtime.',
                    );
                }
                if (module.importState) {
                    runtime.importCheckpointState = envelope =>
                        module.importState!(envelope);
                }
                return runtime;
            })
            .catch((error: unknown) => {
                runtimePromise = null;
                throw error;
            });

        return runtimePromise;
    };
};

export const createAgrunRuntimeFactory = (
    options: {
        loadModule?: AgrunModuleLoader;
        runtimeOptions?: AgrunRuntimeOptions;
        runtimeOptionsFactory?: AgrunRuntimeOptionsFactory;
    } = {},
): AgrunRuntimeFactory => createRuntimeFactory({
    ...options,
    buildOptions: buildAgrunFollowUpRuntimeOptions,
});

export const createAgrunInitialAnalysisRuntimeFactory = (
    options: {
        loadModule?: AgrunModuleLoader;
        runtimeOptions?: AgrunRuntimeOptions;
        runtimeOptionsFactory?: AgrunRuntimeOptionsFactory;
    } = {},
): AgrunRuntimeFactory => createRuntimeFactory({
    ...options,
    buildOptions: buildAgrunInitialAnalysisRuntimeOptions,
});
