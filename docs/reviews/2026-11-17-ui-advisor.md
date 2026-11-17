# AI Analyst layout advisor — proposal

## Evidence and scope

Read-only advisor review used KB skills `ui:ux-quality-auditor` (1.0.5; ref `270d896a-12b0-40b4-856f-f6274d872c95:d8fae7bd-0cc2-4dd9-9e38-33d8c1470564`), with visual-design-lifecycle, popular-app-ui-language and sidebar-navigation guidance. Browser evidence is recorded in the [production review](2026-11-17-production-readiness.md). Recommendations below are proposals, not implemented features or screenshot-based proof of business correctness.

## Recommended desktop layout

Open the [responsive layout preview](../design/ai-analyst-layout-preview.html) locally. It is a clearly labelled static proposal with illustrative bars, no analytical values and no AI requests.

```text
Header: dataset name | New | History | Data Explorer | More
Status: source identity | local/cloud mode | analysis readiness
Main workspace                                  Assistant
  Blocking issue / review decision, when needed   Working dataset + mode
  Summary | Explore                              Progress and evidence
  Verified conclusion                            Contextual suggestions
  KPIs + primary chart                           Conversation
  Next investigation                             Composer + disabled reason
  Expandable evidence and quality details
```

Keep one analysis workspace and the contextual right Assistant. Do not add another permanent sidebar. Summary should prioritize a verified conclusion, key metrics, one chart and a next investigation; detailed diagnostics belong in expandable evidence.

## State design

Each major state should explain what happened, what is safe to rely on and the next action: importing, local-ready, consent-needed, meaning-review, engine-unavailable, source-reattachment, interrupted-cleaning and complete/degraded analysis. Never equate source scan, semantic confirmation, exact commit and analysis readiness.

An unavailable query engine must not resemble an empty successful dataset. Prefer an explicit engine-error surface and truthful retry guidance; advertise a source-preview fallback only if implemented and verified. Assistant context should show dataset, mode and current evidence, with a nearby reason when its composer is disabled.

## Mobile and visual hierarchy

Retain a closed-by-default full-screen Assistant, accessible opener, 44px controls, Escape and focus restoration. Proposed refinements: compact context header, sticky composer and clear return to analysis. Avoid automatic opening after import. Use consistent spacing, one primary action per state and subordinate technical metadata rather than equally prominent nested cards.

## Acceptance for implementation

- Local-only import and restored state never imply unstarted AI cleaning.
- Engine failure is distinct from zero rows or hidden columns.
- Summary prioritizes supported findings; no decorative invented KPI values.
- Dataset/version/mode and evidence context remain truthful across source changes.
- Validate 320, 390, 430, 768, 1024 and 1440px layouts; keyboard/dialog focus, reduced motion, forced colors and 200% zoom.
- Preserve consent, validation and exact approval gates.

CA-193 owns implementation planning. This textual layout is a reviewable proposal; visual preview and owner acceptance precede a broad redesign under the selected KB workflow. Functional fixes CA-191/CA-192 do not depend on redesign approval.
