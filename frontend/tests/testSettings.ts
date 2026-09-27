import type { Settings } from '../types';
import { getDefaultSettings } from '../services/storageService';

// The app's own default provider is 'default' (the maintainer's shared demo
// gateway) so real end users have zero setup friction — but that provider is
// ALWAYS considered configured (services/ai/providerConfig.ts), with a real,
// bundled API key. If test settings inherited that as-is, every test built on
// createTestSettings() would silently start making live network calls to a
// shared production service — including the whole deterministic-intake
// benchmark suite, which is specifically designed to exercise the
// no-API-key/deterministic-only code path. Test settings must stay
// hermetic (unconfigured) by default; a test that genuinely wants AI
// behavior should pass an explicit provider/key override AND mock the
// network layer itself.
export const createTestSettings = (overrides: Partial<Settings> = {}): Settings => ({
    ...getDefaultSettings(),
    provider: 'google',
    geminiApiKey: '',
    openAIApiKey: '',
    ...overrides,
});
