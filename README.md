## CSV Data Analysis Agent (Frontend-Only)

This branch rewrites the original React/TypeScript implementation into a pure ES6 Modules + Web Components application. All functionality now runs entirely in the browser and communicates directly with the Gemini or OpenAI APIs, so ensure this approach aligns with your internal security policies before distributing it.

### Features

- CSV upload, parsing, and automatic column profiling
- AI-generated analysis plans, Chart.js visualisations, and narrative summaries
- Progress log panel plus conversational assistant with multi-action responses
- Support for AI-authored JavaScript data transformations applied on the fly
- Settings modal to manage API provider, keys, model, and response language on the client

### Getting Started

```bash
npm install
npm run dev
```

The app also works as static files (e.g., serving `index.html` directly) provided the browser can reach the target AI endpoints from the current origin.

### Configuring API Keys

1. Launch the app and open the **Settings** button in the top-right corner.
2. Choose either Google Gemini or OpenAI as the provider.
3. Enter the corresponding API key and default model.
4. Save the settings to unlock the AI-driven workflow.

> Keys are saved in `localStorage`, so only run this build in trusted environments. For stricter security, route calls through an internal proxy instead.

### Key Files

- `index.html` – loads Tailwind, Chart.js, PapaParse, idb, and bootstraps `main.js`
- `main.js` – defines the `<csv-data-analysis-app>` Web Component handling UI and state
- `utils/dataProcessor.js` – CSV parsing, profiling, aggregations, and AI transformation executor
- `services/geminiService.js` – shared wrapper for Gemini/OpenAI requests (plans, summaries, chat)
- `storageService.js` – manages settings persistence (and can be extended for report history)

### Important Notes

- Exposing API keys in the browser inherently reveals them to end users; treat this build as internal tooling only.
- If you deploy with a strict Content Security Policy, allow `unsafe-eval` or rework the transformation executor so AI-authored JavaScript can run.
- For production use, consider adding a backend façade to secure credentials, enforce quotas, and audit requests.
