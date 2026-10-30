# 2026-10-30 — Full E2E and 25-persona review archive

## Provenance and caveats

Two independent AI review runs simulated 25 role perspectives and produced 50 suggestions; these were not human interviews. This archive adapts an English summary of three reports. Every result and observation below is a **reviewer claim**, not independently reverified here. Suggestions are not confirmed defects. The reviewers identified build `1.0.0-97e7e0a9bc53` at main `56196a0`; their scope was HTTPS production, Chrome/Chromium, synthetic CSV only, no paid AI provider or private records, and clean Git. Raw QA artifacts are outside this repository. The brief reports zero confirmed production P0 and no confirmed P1 code defect; priorities include UX, privacy and decision-integrity recommendations. See [task backlog](../../TASK.md) and [bug register](../../BUG.md).

## Evidence matrix — reviewer claims

| ID | Scope | Reported result |
|---|---|---|
| S01 | Full Vitest first pass | 5485 pass / 1 fail; 535 files; missing prepared public DuckDB WASM, setup only |
| S02 | WASM security retest after build | 32/32 pass |
| S03 | Build and artifact checksums | 109/109 SHA256 pass |
| S04 | Cold/warm startup | 2/2 pass |
| S05 | Local preview and resilience | 6/6 pass |
| S06 | Exact decimal and mixed units | 3/3 pass |
| S07 | Dual-grain governed approval | 11/11 unique scenarios across separated runs; A60 retain/recovery timed out in a combined run and passed alone |
| S08 | Structure Repair bounded actions | 3/3 pass |
| S09 | Live responsive UI | 6/6 viewports load; no horizontal overflow |
| S10 | Live synthetic CSV upload | 5/5 classifications correct, 8/42/60/90-row complex fixtures |
| S11 | Cross-browser | Chrome pass; Firefox/WebKit NOT VERIFIED, matching Playwright browser revisions absent |
| S12 | Offline reload after cache | pass; fresh cold-start offline NOT TESTED |

S01 followed by S02 is not a clean full-suite rerun.

## Observations — reviewer claims

None was confirmed as a product defect in the review.

1. P2 UX hypothesis: mobile Assistant screenshot immediately after opening was white; repeat and check lazy-loading timing. [BUG-004](../../BUG.md#bug-004--mobile-first-paint), [CA-178](../../TASK.md#ca-178--mobile-assistant-first-paint).
2. P2 accessibility candidate: a DOM heuristic found no explicit accessible name on the disabled desktop Assistant textarea; verify using axe and a screen reader. [BUG-003](../../BUG.md#bug-003--assistant-textarea-name), [CA-177](../../TASK.md#ca-177--accessible-assistant-and-mobile-close).
3. P2 QA harness flakiness: A60 retain/recovery timed out grouped but passed alone; harness versus app cause not confirmed. [BUG-002](../../BUG.md#bug-002--a60-grouped-timeout), [CA-176](../../TASK.md#ca-176--bounded-a60-retainrecovery-regression).
4. P2 QA environment: Vitest needed build asset preparation; the WASM security retest passed 32/32 after build. [BUG-001](../../BUG.md#bug-001--vitest-asset-setup), [CA-175](../../TASK.md#ca-175--vitest-build-asset-preflight).
5. P2, P21: at 390x844 Escape closed full-screen Assistant; a visible, named, touch-sized close control was not verified. Source now inspected shows a named hide button with 44px minimum dimensions in `frontend/components/chat/ChatPanelHeader.tsx:74-77`; actual visibility and operation still need verification. [BUG-005](../../BUG.md#bug-005--mobile-close-verification), [CA-177](../../TASK.md#ca-177--accessible-assistant-and-mobile-close).

## Coverage gaps — reviewer claims

Real AI-model analysis quality, private real CSV data, Firefox/WebKit with matching binaries, manual screen-reader testing, cold offline first run, long-running and large-file load were not tested.

## Deduplicated recommended backlog — reviewer claims

| # | Priority and recommendation | Personas | Done condition | Task |
|---|---|---|---|---|
| 1 | P1 data safety: unify Candidate / Validation / Human Approval summary; explain business-row grain | P01 P04 P06 P10 P11 P12 P14 P18 | acceptedCommit empty before approval; explicit per-column source evidence and row counts | [CA-179](../../TASK.md#ca-179--candidate-validation-and-approval-evidence) |
| 2 | P1 privacy: Local-Only / Cloud Consent / Retention, sensitive fields and cleanup | P02 P09 P16 P17 | cloud refusal permits local preview; independently read back deletion and storage scope | [CA-180](../../TASK.md#ca-180--local-only-cloud-consent-and-retention-disclosure) |
| 3 | P1 amounts: currency, unit and DECIMAL precision validation | P03 P08 P13 | never silently sum mixed units; consistent exact numeric queries | [CA-181](../../TASK.md#ca-181--currency-unit-and-decimal-precision) |
| 4 | P1 accessibility: names, full keyboard flow and reachable mobile close | P21 P22 P23 | real keyboard and screen-reader checks pass; close without Escape | [CA-177](../../TASK.md#ca-177--accessible-assistant-and-mobile-close) |
| 5 | P2 foundation: build/WASM/Vitest and repeatable A60 retain/recovery | P15 P17 | no fresh-clone false failure; repeated A60 runs never hang | [CA-175](../../TASK.md#ca-175--vitest-build-asset-preflight), [CA-176](../../TASK.md#ca-176--bounded-a60-retainrecovery-regression) |
| 6 | P2 support: non-sensitive guidance for source_scan_anomalies and runtime_boundary_ambiguous | P05 P19 | understandable next step; no raw CSV cell leaked | [CA-182](../../TASK.md#ca-182--safe-guidance-for-boundary-diagnostics) |
| 7 | P2 performance/offline: first download, cold offline, long-run/large-file stress | P20 P24 | visible low-bandwidth/offline recovery hint; monitor Worker/RSS peaks | [CA-183](../../TASK.md#ca-183--download-offline-and-stress-coverage) |
| 8 | P2 decision quality: separate real-model and real-data gate | P07 P14 P25 | release report includes scope, denominators and failure types; no invented replacement for real validation | [CA-184](../../TASK.md#ca-184--real-model-and-real-data-gate) |
| 9 | P3 convenience: schema/audit exports, cohorts, named SQL, school templates, versioned results | P06 P07 P10 P11 P12 P13 P18 | exports and saves bind to controlled dataset version | [CA-186](../../TASK.md#ca-186--version-bound-convenience-features) |

Cross-browser coverage is tracked separately as [CA-185](../../TASK.md#ca-185--firefox-and-webkit-verification).

## Persona index — reviewer claims

Basis describes the primary suggestion: OBSERVED means related state was seen, not that the improvement exists. Counts: OBSERVED 13 / HYPOTHESIS 5 / RECOMMENDATION 7.

| ID | Persona | Priority | Category | Basis |
|---|---|---|---|---|
| P01 | SME owner | P1 | Approval distinction | OBSERVED |
| P02 | First-time non-technical CSV user | P1 | Local vs cloud authorization | HYPOTHESIS |
| P03 | Finance controller / accountant | P1 | Exact amounts and currency | OBSERVED |
| P04 | FP&A analyst | P1 | Dual-grain semantics | OBSERVED |
| P05 | ERP inventory analyst | P1 | Irregular raw reports | OBSERVED |
| P06 | Sales operations analyst | P1 | Business rows vs subtotals | OBSERVED |
| P07 | Marketing analyst | P2 | Conclusion evidence transparency | RECOMMENDATION |
| P08 | Procurement manager | P1 | Supplier comparison basis | RECOMMENDATION |
| P09 | HR analyst | P1 | Sensitive-field preview; PII not tested | HYPOTHESIS |
| P10 | School administrator | P1 | Row classification explainability | OBSERVED |
| P11 | Data engineer | P1 | Provenance and repair versions | OBSERVED |
| P12 | BI developer | P1 | Schema and grain boundaries | OBSERVED |
| P13 | Advanced SQL user | P1 | Query auditability | RECOMMENDATION |
| P14 | AI agent engineer | P1 | Auto-repair evidence and approval | OBSERVED |
| P15 | QA automation engineer | P2 | Test environment self-check | OBSERVED |
| P16 | Security engineer | P1 | Local-processing network boundary | RECOMMENDATION |
| P17 | Privacy officer | P1 | Local storage retention and deletion | HYPOTHESIS |
| P18 | Compliance / internal auditor | P1 | Audit trail completeness | RECOMMENDATION |
| P19 | Customer support engineer | P2 | Explainable blocking errors | OBSERVED |
| P20 | SRE | P2 | Failure and resource boundaries | RECOMMENDATION |
| P21 | Mobile-only analyst | P1 | Full-screen Assistant operability | OBSERVED |
| P22 | Keyboard-only user | P2 | Full keyboard accessibility; only first six Tab stops checked | HYPOTHESIS |
| P23 | Screen-reader user | P1 | Screen-reader names and states | HYPOTHESIS |
| P24 | Low-bandwidth / offline PWA user | P2 | Offline and loading progress | OBSERVED |
| P25 | Product manager | P1 | Release trust and coverage gates | RECOMMENDATION |

## Verdict — reviewer claim

Within the verified Local-Only and deterministic governed E2E scope, the reviewers found no confirmed P0/P1 live fault. AI output quality, privacy audit and full cross-browser coverage have not passed formal product acceptance.
