import { describe, expect, it } from 'vitest';
import { sanitizeDemoGatewayInput } from '../services/ai/demoGatewayInputSanitizer';

describe('demo gateway input sanitizer', () => {
    it('reduces reasoning items to the confirmed core and defaults a missing summary', () => {
        const body = sanitizeDemoGatewayInput({
            input: [{ type: 'reasoning', id: 'rs_1', content: [{ type: 'reasoning_text', text: 'x' }], status: 'completed', encrypted_content: 'enc' }],
        });

        expect(body.input).toEqual([{ type: 'reasoning', id: 'rs_1', encrypted_content: 'enc', summary: [] }]);
    });

    it('keeps an existing summary array', () => {
        const summary = [{ type: 'summary_text', text: 's' }];
        const body = sanitizeDemoGatewayInput({ input: [{ type: 'reasoning', id: 'rs_1', summary }] });
        expect(body.input).toEqual([{ type: 'reasoning', id: 'rs_1', summary }]);
    });

    it('passes unconfirmed item shapes through untouched', () => {
        const input = [
            { role: 'user', content: 'hi' },
            { type: 'message', role: 'assistant', id: 'msg_1', status: 'completed', content: [{ type: 'output_text', text: 'a', annotations: [] }] },
            { type: 'function_call', id: 'fc_1', call_id: 'c1', name: 'f', arguments: '{}' },
            { type: 'function_call_output', call_id: 'c1', output: 'ok' },
            null,
            'plain',
        ];
        expect(sanitizeDemoGatewayInput({ input }).input).toEqual(input);
    });

    it('leaves bodies without an input array unchanged', () => {
        const body = { model: 'm', input: 'text' };
        expect(sanitizeDemoGatewayInput(body)).toBe(body);
    });
});
