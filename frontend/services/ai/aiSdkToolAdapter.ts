import { jsonSchema, tool } from 'ai';
import type { ToolDescriptor } from '../../types';
import { prepareSchemaForProvider } from './googleSchemaAdapter';

export const buildAiSdkTools = (
    descriptors: ToolDescriptor[],
    options?: { provider?: 'google' | 'openai' | 'default' },
) =>
    Object.fromEntries(
        descriptors.map(descriptor => [
            descriptor.name,
            tool({
                description: descriptor.description,
                inputSchema: jsonSchema(
                    prepareSchemaForProvider(
                        descriptor.inputSchema ?? { type: 'object', properties: {} },
                        options?.provider,
                    ),
                ),
            }),
        ]),
    );
