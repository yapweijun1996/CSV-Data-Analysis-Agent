# Editable React source

This directory is the source package for the checked-in static app at the repository root. It was recovered from `React-CSV-Data-Analysis-Agent-Backup` revision `b268e31b37de94ea3b7a5b9e604ce3eca3a48e3d`; the rebuilt deployment matches the original SHA-256 manifest.

- `index.tsx` and `App.tsx` own bootstrap and the application shell.
- `components/` owns presentation, `store/` owns UI and data state, and `services/` owns agent, AI, data, persistence, and worker behavior.
- `tests/` contains unit tests and synthetic report fixtures. Local business reports in `sample csv/` and their benchmark snapshots are ignored by Git; tests that require that corpus are kept out of the public repository.
- `public/` holds small source templates. Build preparation copies large runtime resources from the repository root into ignored `public/` subdirectories.
- The repository [README](../README.md) describes the current source/deployment boundary and agent flow. Internal planning notes and corpus-dependent release procedures are not part of the public repository.

Use Node.js `>=22.13 <23`. From the repository root, run `npm ci --prefix frontend`, then `npm run dev`, `npm run typecheck`, `npm run test`, or `npm run build`. The build output is `frontend/dist/`; publish it to the checked-in static root with `npm run publish:root` after review.
