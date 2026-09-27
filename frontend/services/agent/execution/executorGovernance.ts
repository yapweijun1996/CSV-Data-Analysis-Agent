import type { ToolName } from '../../../types';
import type { StoreApi } from '../types';
import { buildBuiltinToolRegistry, resolveAllowedTools } from '../tools/toolRegistry';
import { buildToolAvailabilityContext } from '../tools/toolGovernance';

export const getToolGovernanceMeta = (store: StoreApi, toolName: ToolName) => {
    const context = buildToolAvailabilityContext(store.getState());
    const registry = resolveAllowedTools(buildBuiltinToolRegistry(context.columnNames), context);
    return {
        stage: registry.stage,
        descriptor: registry.descriptorMap.get(toolName),
        decision: registry.decisions[toolName],
    };
};
