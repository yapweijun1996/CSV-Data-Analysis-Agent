import { describe, expect, it } from 'vitest';
import {
    createDefaultRuntimeAccessControl,
    normalizeRuntimeAccessControlSettings,
    serializeRuntimeAccessControlSettings,
} from '../services/runtimeAccessControl';

describe('runtime access-control settings', () => {
    it('backfills legacy settings to the open defaults', () => {
        expect(normalizeRuntimeAccessControlSettings(undefined)).toEqual(createDefaultRuntimeAccessControl());
        expect(normalizeRuntimeAccessControlSettings(null)).toEqual(createDefaultRuntimeAccessControl());
    });

    it('normalizes and dedupes denied path prefixes and ignores invalid overrides', () => {
        const normalized = normalizeRuntimeAccessControlSettings({
            permissionMode: 'balanced',
            toolOverrides: {
                'workspace.write': 'deny',
                'workspace.read': 'allow',
                'workspace.list': 'maybe' as never,
            },
            workspaceRules: {
                deniedPathPrefixes: ['/dataset/', '/dataset', 'workspace/private', '../bad-path'],
            },
        });

        expect(normalized.permissionMode).toBe('balanced');
        expect(normalized.toolOverrides).toEqual({
            'workspace.read': 'allow',
            'workspace.write': 'deny',
        });
        expect(normalized.workspaceRules.deniedPathPrefixes).toEqual(['/dataset', '/workspace/private']);
    });

    it('serializes settings deterministically for registry cache keys', () => {
        const left = serializeRuntimeAccessControlSettings({
            permissionMode: 'strict',
            toolOverrides: {
                'workspace.write': 'deny',
                'workspace.read': 'allow',
            },
            workspaceRules: {
                deniedPathPrefixes: ['/workspace/private', '/dataset'],
            },
        });
        const right = serializeRuntimeAccessControlSettings({
            permissionMode: 'strict',
            toolOverrides: {
                'workspace.read': 'allow',
                'workspace.write': 'deny',
            },
            workspaceRules: {
                deniedPathPrefixes: ['/dataset/', '/workspace/private'],
            },
        });

        expect(left).toBe(right);
    });
});
