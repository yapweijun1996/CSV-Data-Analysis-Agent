import { xorDecodeFromHex } from '../services/security/xorCipher';

/**
 * "Default" AI provider — a shared demo gateway (owned by the maintainer,
 * not the end user) so this project works out of the box without BYOK.
 * The gateway itself enforces a daily usage cap and stops serving once hit;
 * that server-side limit is the real protection, NOT the XOR encoding below
 * (XOR is trivially reversible — see services/security/xorCipher.ts).
 */

export const DEFAULT_GATEWAY_BASE_URL = 'https://gpt.yapweijun1996.com/v1';
export const DEFAULT_GATEWAY_MODEL = 'gpt-5.4-mini';

const DEFAULT_GATEWAY_XOR_KEY = '20260515';
const DEFAULT_GATEWAY_API_KEY_ENCODED =
    '55476d03020157540302540f015606015100535702045502015650575102530c0551000151025557015207570657020605000a';

export const resolveDefaultGatewayApiKey = (): string =>
    xorDecodeFromHex(DEFAULT_GATEWAY_API_KEY_ENCODED, DEFAULT_GATEWAY_XOR_KEY);
