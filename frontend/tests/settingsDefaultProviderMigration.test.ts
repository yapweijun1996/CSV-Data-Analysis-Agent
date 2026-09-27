// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '../types';

const fakeStore = new Map<string, unknown>();

const fakeDb = {
    get: vi.fn(async (_storeName: string, key: string) => fakeStore.get(key)),
    put: vi.fn(async (_storeName: string, record: { key: string }) => {
        fakeStore.set(record.key, record);
    }),
};

vi.mock('idb', () => ({
    openDB: vi.fn(async () => fakeDb),
    deleteDB: vi.fn(),
}));

const { getDefaultSettings, getSettings } = await import('../services/storageService');

const seedSettings = (settings: Settings): void => {
    fakeStore.set('app_settings', {
        key: 'app_settings',
        settings,
    });
};

beforeEach(() => {
    fakeStore.clear();
    vi.clearAllMocks();
});

describe('default provider settings migration', () => {
    it('uses the keyless Default provider for a new installation', () => {
        expect(getDefaultSettings()).toMatchObject({
            provider: 'default',
            simpleModel: 'gpt-5.4-mini',
            complexModel: 'gpt-5.4-mini',
        });
    });

    it('migrates a legacy keyless Google selection to Default', async () => {
        seedSettings({
            ...getDefaultSettings(),
            provider: 'google',
            geminiApiKey: '',
        });

        await expect(getSettings()).resolves.toMatchObject({
            provider: 'default',
            geminiApiKey: '',
            simpleModel: 'gpt-5.4-mini',
            complexModel: 'gpt-5.4-mini',
            fallbackModel: undefined,
        });
    });

    it('preserves Google when the user has supplied a Gemini API key', async () => {
        seedSettings({
            ...getDefaultSettings(),
            provider: 'google',
            geminiApiKey: 'user-gemini-key',
        });

        await expect(getSettings()).resolves.toMatchObject({
            provider: 'google',
            geminiApiKey: 'user-gemini-key',
        });
    });

    it('preserves a configured OpenAI selection', async () => {
        seedSettings({
            ...getDefaultSettings(),
            provider: 'openai',
            openAIApiKey: 'user-openai-key',
        });

        await expect(getSettings()).resolves.toMatchObject({
            provider: 'openai',
            openAIApiKey: 'user-openai-key',
        });
    });
});
