import { ToolDescriptor } from '../../../types';

const assistantMessageSchema = {
    type: 'object',
    properties: {
        thought: { type: 'string', description: 'The reasoning for the assistant message.' },
        type: { type: 'string', enum: ['assistant_message'] },
        message: { type: 'string', description: 'Markdown response for the user.' },
        cardId: { type: 'string', description: 'Optional related card id.' },
        suggestedActions: {
            type: 'array',
            description: 'Optional 2-3 follow-up suggestions.',
            maxItems: 3,
            items: {
                type: 'object',
                properties: {
                    label: { type: 'string', description: 'Short user-facing button text.' },
                    action: { type: 'string', description: 'The exact user-facing follow-up prompt to send when clicked. Never use an internal tool name.' },
                },
                required: ['label', 'action'],
            },
        },
    },
    required: ['type', 'thought', 'message'],
};

const createToolCallSchema = (descriptor: ToolDescriptor) => ({
    type: 'object',
    properties: {
        thought: { type: 'string', description: 'The reasoning for the tool call.' },
        type: { type: 'string', enum: ['tool_call'] },
        toolName: { type: 'string', enum: [descriptor.name] },
        args: descriptor.inputSchema,
    },
    required: ['type', 'thought', 'toolName', 'args'],
});

export const createChatDecisionSchema = (descriptors: ToolDescriptor[]) => {
    const actionSchema = {
        anyOf: [
            assistantMessageSchema,
            ...descriptors.map(createToolCallSchema),
        ],
    };

    return {
        type: 'object',
        properties: {
            action: actionSchema,
        },
        required: ['action'],
    };
};

export const createChatActionSchema = createChatDecisionSchema;
