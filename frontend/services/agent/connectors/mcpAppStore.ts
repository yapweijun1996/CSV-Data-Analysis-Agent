import { useAppStore } from '../../../store/useAppStore';
import type { StoreApi } from '../types';
import { syncEnabledMcpServers } from './mcpServerManager';

/** The app's own store as the MCP registry key; the registry is per store. */
export const mcpAppStore: StoreApi = { getState: useAppStore.getState, setState: useAppStore.setState };

/** Connect enabled servers now and again whenever the session changes (sessions retire their connections). */
export const startMcpAutoConnect = (): (() => void) => {
    void syncEnabledMcpServers(mcpAppStore);
    let session = useAppStore.getState().sessionId;
    return useAppStore.subscribe(state => {
        if (state.sessionId === session) return;
        session = state.sessionId;
        void syncEnabledMcpServers(mcpAppStore);
    });
};
