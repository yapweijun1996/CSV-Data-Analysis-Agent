import { AiAction, ToolAvailabilityContext, ToolRegistryError } from '../../types';
import { getWorkspaceRuleViolation } from '../runtimeAccessControl';
import { ResolvedToolRegistry, buildBuiltinToolRegistry, resolveAllowedTools } from '../agent/tools/toolRegistry';
import { normalizeToolAvailabilityContext } from '../agent/tools/toolGovernance';

export type ToolValidationContext = ToolAvailabilityContext;

export const getResolvedToolRegistry = (context: ToolValidationContext): ResolvedToolRegistry => {
    const normalizedContext: ToolValidationContext = normalizeToolAvailabilityContext(context);

    return resolveAllowedTools(buildBuiltinToolRegistry(normalizedContext.columnNames), normalizedContext);
};

const buildError = (code: ToolRegistryError['code'], message: string, toolName?: string): ToolRegistryError => ({
    code,
    message,
    toolName,
});

export const validateAction = (
    action: AiAction,
    context: ToolValidationContext,
    registry: ResolvedToolRegistry = getResolvedToolRegistry(context),
): { isValid: boolean; errors: string; error?: ToolRegistryError } => {
    const normalizedContext = normalizeToolAvailabilityContext(context);
    if (!action.thought) {
        const error = buildError('invalid_action', "Every action must include a non-empty 'thought'.");
        return { isValid: false, errors: error.message, error };
    }

    if (action.type === 'assistant_message') {
        if (!action.message) {
            const error = buildError('invalid_action', "Assistant messages require a 'message'.");
            return { isValid: false, errors: error.message, error };
        }
        if (action.cardId && !normalizedContext.cardIds.includes(action.cardId)) {
            const error = buildError('invalid_args', `"cardId" ('${action.cardId}') must reference one of [${normalizedContext.cardIds.join(', ')}].`);
            return { isValid: false, errors: error.message, error };
        }
        return { isValid: true, errors: '' };
    }

    const descriptor = registry.descriptorMap.get(action.toolName);
    if (!descriptor) {
        const error = buildError('invalid_tool_name', `Tool "${action.toolName}" is not registered or not allowed.`, action.toolName);
        return { isValid: false, errors: error.message, error };
    }

    const decision = registry.decisions[action.toolName];
    if (decision && !decision.allowed) {
        const error = buildError(
            decision.source === 'availability' ? 'tool_unavailable' : 'blocked_tool',
            decision.reason,
            action.toolName,
        );
        error.detail = {
            stage: decision.stage,
            source: decision.source,
            category: decision.category,
            risk: decision.risk,
        };
        return { isValid: false, errors: error.message, error };
    }

    const workspaceRuleViolation = getWorkspaceRuleViolation(action, normalizedContext.runtimeAccessControl);
    if (workspaceRuleViolation) {
        const error = buildError('blocked_tool', workspaceRuleViolation.message, action.toolName);
        error.detail = {
            source: 'workspace_rule',
            normalizedPath: workspaceRuleViolation.normalizedPath,
            matchedPrefix: workspaceRuleViolation.matchedPrefix,
            field: workspaceRuleViolation.field,
            stage: registry.stage,
        };
        return { isValid: false, errors: error.message, error };
    }

    const semanticErrors = descriptor.validate?.(action.args ?? {}, normalizedContext) ?? [];
    if (semanticErrors.length > 0) {
        const error = buildError('malformed_tool_payload', semanticErrors.join(' '), action.toolName);
        return { isValid: false, errors: semanticErrors.join(' '), error };
    }

    return { isValid: true, errors: '' };
};
