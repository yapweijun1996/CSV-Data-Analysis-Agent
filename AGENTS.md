# AGENTS.md

## Current project

- `frontend/` is the canonical React/TypeScript source package. Its 2026-07-28 source revision was verified to reproduce the checked-in React build byte-for-byte.
- The repository root serves the checked-in React build from `index.html` and `assets/`. Treat manifest-managed root files as generated deployment output.
- The earlier root-level Vanilla JavaScript implementation has been removed. Do not recreate it unless the current task asks for it.
- The older `original/` reference was removed because it does not match the active build. The source package under `frontend/` is the recovered matching version.
- The app is statically hosted and has no required backend at runtime. Node.js is used for source builds and tests only.
- Keep application edits in `frontend/`, run its checks, then use `npm run publish:root` to update the checked-in deployment. Do not hand-edit generated bundle files.
- Before removing or moving a browser resource, trace references from `assets/`, `index.html`, and `service-worker.js`. In particular, preserve required paths under `duckdb/`, `pyodide/`, `sandbox/`, and `public/models/`.
- Preserve the source package's existing ownership boundaries under `components/`, `store/`, and `services/`; do not create a parallel source tree merely to group files by extension.
- GitHub Pages publishes through a manually dispatched Actions workflow. Stage only checksum-verified site files with `npm run stage:pages`; do not upload the repository root as the Pages artifact.
- The public `frontend/` package was recovered from a private backup after excluding local business reports and private QA material. Keep `sample csv/`, `tests/benchmark/`, ignored operator-only files, and `.env` files out of public commits; review new files for credentials and business data before pushing.

## Engineering rules

- Understand the active entry point and runtime behavior before changing code.
- Preserve unrelated user changes and keep edits focused.
- Keep source code and comments in English. Explain non-obvious reasons, not obvious syntax.
- Update `README.md` and `context.md` when behavior, structure, or project direction changes.
- Verify changes against the checked-in React app. Do not claim that a source file is active or a workflow works solely because it exists.
- For review requests, report findings and evidence without changing application code unless the user asks for a fix.

## Communication

- Reply in concise Mandarin-English mixed language and numbered format.
- Restate the user's goal and give practical engineering and user perspectives when relevant.
- Update `context.md` before the final response, and end actionable responses with four short Next Options (A-D).
