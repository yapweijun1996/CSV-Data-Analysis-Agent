
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initExternalCsvBridge } from './utils/externalCsvBridge';
import { installStaleChunkRecovery } from './utils/staleChunkRecovery';
import { registerPwa } from './services/pwa/pwaManager';
import { watchSystemColorMode } from './utils/colorMode';
import { finishMcpOAuthPopup } from './utils/mcpOAuthPopup';
import { installConsoleRingBuffer } from './services/support/consoleRingBuffer';

installConsoleRingBuffer();

watchSystemColorMode();
const oauthPopupHandled = finishMcpOAuthPopup();
if (!oauthPopupHandled) { initExternalCsvBridge(); installStaleChunkRecovery(); }

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

if (!oauthPopupHandled) {
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
}

if (import.meta.env.PROD && !oauthPopupHandled) {
  void registerPwa();
}
