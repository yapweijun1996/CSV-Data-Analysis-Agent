import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    __resetRuntimeConfigForTests,
    isEndUserMode,
    shouldAllowDatabaseSurface,
    shouldAllowLogsSurface,
    shouldAllowSettingsSurface,
    shouldAllowWorkspaceSurface,
    shouldAllowWorkflowSurface,
    shouldShowAssistantToggleButton,
    shouldShowHistoryButton,
    shouldShowNewSessionButton,
} from '../config/runtimeConfig';

const setRuntimeUiConfig = (ui: Record<string, boolean>) => {
    window.__CSV_AGENT_CONFIG__ = {
        ui,
    };
    __resetRuntimeConfigForTests();
};

describe('runtimeConfig end user mode', () => {
    beforeEach(() => {
        delete window.__CSV_AGENT_CONFIG__;
        __resetRuntimeConfigForTests();
    });

    afterEach(() => {
        delete window.__CSV_AGENT_CONFIG__;
        __resetRuntimeConfigForTests();
    });

    it('keeps existing defaults when end user mode is disabled', () => {
        setRuntimeUiConfig({ endUserMode: false });

        expect(isEndUserMode()).toBe(false);
        expect(shouldAllowSettingsSurface()).toBe(true);
        expect(shouldAllowDatabaseSurface()).toBe(true);
        expect(shouldAllowWorkspaceSurface()).toBe(true);
        expect(shouldAllowWorkflowSurface()).toBe(true);
        expect(shouldAllowLogsSurface()).toBe(true);
        expect(shouldShowNewSessionButton()).toBe(true);
        expect(shouldShowHistoryButton()).toBe(true);
        expect(shouldShowAssistantToggleButton()).toBe(true);
    });

    it('hides advanced surfaces by default in end user mode', () => {
        setRuntimeUiConfig({ endUserMode: true });

        expect(isEndUserMode()).toBe(true);
        expect(shouldAllowSettingsSurface()).toBe(false);
        expect(shouldAllowDatabaseSurface()).toBe(false);
        expect(shouldAllowWorkspaceSurface()).toBe(false);
        expect(shouldAllowWorkflowSurface()).toBe(false);
        expect(shouldAllowLogsSurface()).toBe(false);
        expect(shouldShowNewSessionButton()).toBe(false);
        expect(shouldShowHistoryButton()).toBe(true);
        expect(shouldShowAssistantToggleButton()).toBe(true);
    });

    it('allows explicit overrides to re-enable individual surfaces', () => {
        setRuntimeUiConfig({
            endUserMode: true,
            showSettingsButton: true,
            showNewSessionButton: true,
            showWorkspaceButton: true,
        });

        expect(isEndUserMode()).toBe(true);
        expect(shouldAllowSettingsSurface()).toBe(true);
        expect(shouldShowNewSessionButton()).toBe(true);
        expect(shouldAllowWorkspaceSurface()).toBe(true);
        expect(shouldAllowDatabaseSurface()).toBe(false);
        expect(shouldAllowWorkflowSurface()).toBe(false);
        expect(shouldAllowLogsSurface()).toBe(false);
    });

    it('allows explicit overrides to hide the new session button', () => {
        setRuntimeUiConfig({
            endUserMode: true,
            showNewSessionButton: false,
        });

        expect(isEndUserMode()).toBe(true);
        expect(shouldShowNewSessionButton()).toBe(false);
        expect(shouldShowHistoryButton()).toBe(true);
    });

});
