# AGENTS.md

## Current project

- `frontend/` is the canonical React/TypeScript source package. Its 2026-07-28 source revision was verified to reproduce the checked-in React build byte-for-byte.
- No production build is checked in. `npm run build` writes `frontend/dist/`, and the GitHub Pages workflow builds and verifies it in CI. Root `duckdb/` and `demo-data/` are source resources copied into the build.
- The earlier root-level Vanilla JavaScript implementation has been removed. Do not recreate it unless the current task asks for it.
- The older `original/` reference was removed because it does not match the active build. The source package under `frontend/` is the recovered matching version.
- The app is statically hosted and has no required backend at runtime. Node.js is used for source builds and tests only.
- Keep application edits in `frontend/` and run its checks. Do not commit generated bundle files; deployment is the manually dispatched Pages workflow.
- Before removing or moving a browser resource, trace references from the built `frontend/dist/assets/`, `index.html`, and `service-worker.js`. In particular, preserve required paths under `duckdb/`, `frontend/public/sandbox/`, and the Pyodide files synced from `node_modules`.
- Preserve the source package's existing ownership boundaries under `components/`, `store/`, and `services/`; do not create a parallel source tree merely to group files by extension.
- GitHub Pages publishes through a manually dispatched Actions workflow. The workflow stages only checksum-verified files from `frontend/dist` (`npm run stage:pages` locally); do not upload the repository root as the Pages artifact.
- The public `frontend/` package was recovered from a private backup after excluding local business reports and private QA material. Keep `sample csv/`, `tests/benchmark/`, ignored operator-only files, and `.env` files out of public commits; review new files for credentials and business data before pushing.

## Engineering rules

- Understand the active entry point and runtime behavior before changing code.
- Preserve unrelated user changes and keep edits focused.
- Keep source code and comments in English. Explain non-obvious reasons, not obvious syntax.
- Update `README.md` and `context.md` when behavior, structure, or project direction changes.
- Verify changes against a fresh `npm run build` of the React app. Do not claim that a source file is active or a workflow works solely because it exists.
- For the Default demo gateway, never send `max_output_tokens` in an HTTP request. Before changing provider or SDK integration, inspect the final serialized request payload and run the gateway boundary regression test; a model compatibility flag alone does not prove the wire contract.
- Keep the app's context planning cap at 200,000 tokens and Pi auto-compaction trigger at 80% unless the current request changes that policy. Verify that compressed summaries remain visible to the model and preserve recent tool-call/result pairs.
- Exception, approved 2026-10-22: the Default demo gateway also compacts Pi history on serialized request bytes (`DEFAULT_GATEWAY_PI_REQUEST_BYTE_BUDGET` = 150,000 bytes including tool declarations, in `frontend/config/agentDefaults.ts`), because the gateway rejects bodies above about 205 KB with `DEMO_INPUT_TOO_LARGE`. Other providers keep only the token trigger. The summary request must stay within the same byte budget.
- For review requests, report findings and evidence without changing application code unless the user asks for a fix.

## Communication

- Reply in concise Mandarin-English mixed language and numbered format.
- Restate the user's goal and give practical engineering and user perspectives when relevant.
- Update `context.md` before the final response, and end actionable responses with four short Next Options (A-D).
