import { describe, expect, it } from 'vitest';
import { endsWithAssistantMessage, sanitizeDemoGatewayInput, stringifyToolOutput } from '../services/ai/demoGatewayInputSanitizer';

const run = (input: unknown[]) => sanitizeDemoGatewayInput({ input }).input as unknown[];

describe('demo gateway input sanitizer', () => {
    it('keeps reasoning with encrypted_content and strips content/status', () => {
        expect(run([{ type: 'reasoning', id: 'rs_1', content: [{ type: 'reasoning_text', text: 'x' }], status: 'completed', encrypted_content: 'enc' }]))
            .toEqual([{ type: 'reasoning', id: 'rs_1', encrypted_content: 'enc', summary: [] }]);
    });

    it('keeps an existing reasoning summary', () => {
        const summary = [{ type: 'summary_text', text: 's' }];
        expect(run([{ type: 'reasoning', id: 'rs_1', summary, encrypted_content: 'enc' }]))
            .toEqual([{ type: 'reasoning', id: 'rs_1', summary, encrypted_content: 'enc' }]);
    });

    it('does not replay reasoning without encrypted_content and unpairs its function calls', () => {
        const items = run([
            { role: 'user', content: 'q' },
            { type: 'reasoning', id: 'rs_1', summary: [] },
            { type: 'function_call', id: 'fc_1', call_id: 'c1', name: 'f', arguments: '{}' },
            { type: 'function_call', id: 'fc_2', call_id: 'c2', name: 'g', arguments: '{}' },
            { type: 'function_call_output', call_id: 'c1', output: 'a' },
            { type: 'function_call', id: 'fc_3', call_id: 'c3', name: 'h', arguments: '{}' },
        ]);

        expect(items).toEqual([
            { role: 'user', content: 'q' },
            { type: 'function_call', call_id: 'c1', name: 'f', arguments: '{}' },
            { type: 'function_call', call_id: 'c2', name: 'g', arguments: '{}' },
            { type: 'function_call_output', call_id: 'c1', output: 'a' },
            { type: 'function_call', id: 'fc_3', call_id: 'c3', name: 'h', arguments: '{}' },
        ]);
    });

    it('removes namespace from function_call items', () => {
        expect(run([{ type: 'function_call', id: 'fc_1', call_id: 'c1', name: 'f', arguments: '{}', namespace: 'ns', status: 'completed' }]))
            .toEqual([{ type: 'function_call', id: 'fc_1', call_id: 'c1', name: 'f', arguments: '{}', status: 'completed' }]);
    });

    it('turns array tool output into a string', () => {
        expect(run([{ type: 'function_call_output', call_id: 'c1', output: [{ type: 'input_text', text: 'a' }, { type: 'input_image', image_url: 'data:...' }, { type: 'input_text', text: 'b' }] }]))
            .toEqual([{ type: 'function_call_output', call_id: 'c1', output: 'a\n[image omitted]\nb' }]);
        expect(stringifyToolOutput('plain')).toBe('plain');
        expect(stringifyToolOutput(undefined)).toBe('');
    });

    it('reduces replayed assistant messages to gateway-accepted fields', () => {
        expect(run([{
            type: 'message', role: 'assistant', id: 'msg_1', status: 'completed', phase: 'final_answer',
            content: [{ type: 'output_text', text: 'hi', annotations: [{ type: 'url_citation' }], logprobs: [] }],
        }])).toEqual([{
            type: 'message', role: 'assistant', id: 'msg_1', phase: 'final_answer',
            content: [{ type: 'output_text', text: 'hi', annotations: [] }],
        }]);
    });

    it('drops an invalid assistant phase and leaves user messages alone', () => {
        const user = { role: 'user', content: [{ type: 'input_text', text: 'q' }] };
        expect(run([{ type: 'message', role: 'assistant', phase: 'weird', content: 'a' }, user]))
            .toEqual([{ type: 'message', role: 'assistant', content: 'a' }, user]);
    });

    it('removes top_p and leaves bodies without an input array otherwise unchanged', () => {
        expect(sanitizeDemoGatewayInput({ model: 'm', input: 'text', top_p: 0.9, temperature: 1 }))
            .toEqual({ model: 'm', input: 'text', temperature: 1 });
    });

    it('detects a history that ends with an assistant message', () => {
        expect(endsWithAssistantMessage([{ role: 'user', content: 'q' }, { type: 'message', role: 'assistant', content: 'a' }])).toBe(true);
        expect(endsWithAssistantMessage([{ role: 'assistant', content: 'a' }, { role: 'user', content: 'q' }])).toBe(false);
        expect(endsWithAssistantMessage([{ type: 'function_call_output', call_id: 'c', output: 'x' }])).toBe(false);
        expect(endsWithAssistantMessage('text')).toBe(false);
    });
});
