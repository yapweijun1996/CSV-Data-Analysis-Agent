// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { resolveBrowserTestAiSettings } from './live/defaultGatewayTestSettings';

describe('resolveBrowserTestAiSettings', () => {
    it('uses the established development-only Gemini aliases for local browser acceptance', () => {
        expect(resolveBrowserTestAiSettings({
            GEMINI_API_KEY_FOR_DEVELOPMENT_ONLY: ' local-key ',
            GEMINI_MODEL_FOR_DEVELOPMENT_ONLY: ' gemini-local ',
        })).toEqual({
            geminiApiKey: 'local-key',
            geminiModel: 'gemini-local',
        });
    });

    it('prefers explicit E2E Gemini overrides', () => {
        expect(resolveBrowserTestAiSettings({
            E2E_GEMINI_API_KEY: 'e2e-key',
            E2E_GEMINI_MODEL: 'gemini-e2e',
            GEMINI_API_KEY_FOR_DEVELOPMENT_ONLY: 'local-key',
            GEMINI_MODEL_FOR_DEVELOPMENT_ONLY: 'gemini-local',
        })).toEqual({
            geminiApiKey: 'e2e-key',
            geminiModel: 'gemini-e2e',
        });
    });

    it('keeps the keyless shared gateway fallback when no complete Gemini pair exists', () => {
        expect(resolveBrowserTestAiSettings({})).toEqual({
            geminiApiKey: '',
            geminiModel: '',
        });
    });
});
