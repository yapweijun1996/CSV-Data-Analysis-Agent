import { beforeEach, describe, expect, it } from 'vitest';
import { clearDemoGatewayLog, readDemoGatewayLog, recordDemoGatewayRequest } from '../services/ai/demoGatewayRequestLog';

describe('demo gateway request log', () => {
    beforeEach(() => clearDemoGatewayLog());

    it('records the request shape without message text', () => {
        recordDemoGatewayRequest({
            instructions: 'You plan\nthe research for a CSV dataset and must call submit_research_plan once.',
            tools: [{ type: 'function', name: 'data_query' }, { type: 'function', name: 'submit_research_plan' }],
            text: { format: { type: 'json_schema', name: 'response' } },
            input: [{ role: 'user', content: 'secret row values' }, { role: 'user', content: 'x' }],
        });
        const [entry] = readDemoGatewayLog();
        expect(entry.caller).toBe('You plan the research for a CSV dataset and must call submit_research_plan'.slice(0, 70));
        expect(entry.tools).toEqual(['data_query', 'submit_research_plan']);
        expect(entry.schema).toBe('response');
        expect(entry.inputItems).toBe(2);
        expect(JSON.stringify(entry)).not.toContain('secret');
    });

    it('falls back to the first system input item when there are no top-level instructions', () => {
        recordDemoGatewayRequest({ input: [
            { role: 'user', content: 'hi' },
            { role: 'system', content: [{ type: 'input_text', text: 'You summarise a CSV analysis card.' }] },
        ] });
        expect(readDemoGatewayLog()[0].caller).toBe('You summarise a CSV analysis card.');
    });

    it('keeps at most 300 entries', () => {
        for (let index = 0; index < 305; index += 1) recordDemoGatewayRequest({ instructions: `call ${index}` });
        expect(readDemoGatewayLog()).toHaveLength(300);
        expect(readDemoGatewayLog()[0].caller).toBe('call 5');
    });
});
