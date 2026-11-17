# Universal AI Business Data Analyst

## Product objective

Help users who do not know SQL, pivot tables or complex formulas understand business data and make informed decisions. The product is browser-first, local-first and domain-agnostic, not a replacement for every Excel feature.

Intended journey: upload a business report → understand structure and meaning → clean and verify → analyze → explain findings → answer follow-up questions using real data and traceable calculations.

"Any business report" is an ambition, not a current compatibility guarantee. CSV is the observed input path; Excel import requires an implementation inventory and acceptance before being advertised.

## Required capabilities

| Capability | Intended outcome |
| --- | --- |
| Universal report understanding | Interpret different companies' fields, dates, currencies, headers and record grain without one fixed template. |
| Intelligent cleaning | Identify repeated headings, subtotals, missing values and header drift while preserving originals and explaining uncertainty. |
| Accurate calculation | Execute governed calculations instead of presenting LLM guesses as measured numbers. |
| Autonomous analysis | Investigate trends, anomalies and business issues within bounded resources; distinguish association from proven cause. |
| Interactive reporting | Generate KPI cards, charts, pivots and findings with source, filter, unit, method and dataset-version provenance. |
| Conversational analysis | Continue natural-language investigation with report-scoped context, visible progress and verified results. |

Sales questions include customer revenue contribution, margin differences, contributors to a decline and what management should investigate next. Concept UI numbers are illustrative, never evidence of actual analysis.

## Responsibilities and technology

AI reasons; DuckDB calculates supported queries; independent validation checks results; humans approve important dataset changes. Other governed runtimes may execute supported computations. The application owns intake, persistence, validation and approval; the agent runtime cannot override these boundaries.

Current direction uses React/TypeScript, DuckDB-WASM, IndexedDB, Pi runtime, Default/BYOK providers and a statically hosted PWA with a GitHub Pages workflow. `frontend/package.json` declares Chart.js. ECharts in the proposed concept is not an established implementation or an authorized migration.

Local-first does not mean all requests stay on-device: approved cloud requests can contain context, samples and results. Original-row retention and recovery vary by supported lane; do not promise universal automatic restoration.

## Production acceptance

Require reproducible release bytes, functional local queries, source-bound meaning and exact approval, reliable units/precision, usable recovery/privacy controls and representative analytical E2E evidence. A loaded homepage, synthetic replay or one successful model run is insufficient.

[TASK.md](TASK.md) owns execution and status. The [2026-11-17 review](docs/reviews/2026-11-17-production-readiness.md) records the failed baseline and verified remedial local-query/recovery checks. Full production acceptance remains incomplete; consult the review for release and deployment evidence.

This file owns the vision clarified by the user on 2026-11-17, consistent with earlier KB direction. README summarizes usage and scope.
