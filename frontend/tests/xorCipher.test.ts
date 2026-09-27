import { describe, expect, it } from 'vitest';
import { xorDecodeFromHex, xorEncodeToHex } from '../services/security/xorCipher';
import { DEFAULT_GATEWAY_MODEL, resolveDefaultGatewayApiKey } from '../config/defaultGatewayConfig';

describe('xorCipher', () => {
    it('round-trips arbitrary plaintext through a repeating key', () => {
        const key = '20260515';
        const plain = 'gw_524fa12f91c74c0aa21d73fbaa7b97a27a7db3b5a6b33708';
        const encoded = xorEncodeToHex(plain, key);
        expect(encoded).not.toContain(plain);
        expect(xorDecodeFromHex(encoded, key)).toBe(plain);
    });
});

describe('defaultGatewayConfig', () => {
    it('decodes the bundled demo gateway key to a plausible gw_ token', () => {
        const key = resolveDefaultGatewayApiKey();
        expect(key).toMatch(/^gw_[0-9a-f]+$/);
    });

    it('always targets the fixed gateway model', () => {
        expect(DEFAULT_GATEWAY_MODEL).toBe('gpt-5.4-mini');
    });
});
