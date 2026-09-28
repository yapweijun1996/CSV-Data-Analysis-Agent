# End-user QA audit

Date: 2026-09-28. React source and checked-in static build tested in Chromium and the in-app browser using a synthetic 90-row HDB-shaped CSV; no private data or API key is stored here. Desktop baseline: 1280 × 720; mobile: 390 × 844; narrow landscape: 667 × 375. The separate [visual proposal](upload-visual-proposal.svg) is a design concept, not an app screenshot.

| Journey | Result |
| --- | --- |
| Upload and consent | File chooser works with keyboard Enter; provider consent precedes cloud AI. Automated analysis completed 9/9. Same-file retry is supported. |
| Settings and provider | Default gateway **Test Connection** succeeded for `gpt-5.4-mini`. Provider tab changes and Cancel preserved saved selection. Mobile controls measured at least 44px; no 390px viewport overflow. |
| Pi Assistant | Asked for a new card with average resale price and row count by Town over all 90 rows. Pi created **Resale Price by Town**, with 3 rows: averages 419,625 / 422,375 / 425,125 and 30 records per Town. The chat card link navigated to it. [Card screenshot](pi-card-e2e.png). |
| Cards and report | Simple/Explore switch, Pie → Bar, full data table, card CSV/PNG/HTML export worked. Downloaded PNG was 732 × 1354; HTML contained all three Towns and the expected averages. Analyst report completed all seven stages with caveats; Open Report worked. Export PDF invoked browser print; a PDF file was not separately inspected. |
| Data Explorer | Preview, filter, aggregate, duplicate candidates, and null/blank templates returned plausible results. Search and local sort worked. A historical AI query whose preview rows were not saved now says **Preview unavailable** rather than incorrectly saying no rows match. |
| History | Saved report restored after selecting the original CSV. The Pi-created card and prior cards returned in both source and static build. A same-name file with changed contents was rejected in the source browser; selecting the correct CSV afterward restored successfully. The card evidence version matched the restored analysis dataset. |
| Responsive and PWA | Mobile upload, Settings, results, and Data Explorer were visually inspected. At 390px and 667px, the document width matched the viewport. Offline/update states were not exercised in this audit. |

## Confirmed issues fixed

1. **History lost Pi cards after reselecting the CSV.** A deterministic cleaning step changed the prepared table version while analysis evidence still referenced the source table. Restore now verifies the original file and both relevant versions, reproduces preparation when needed, and restores saved cards/report only when evidence matches. A wrong-file attempt keeps the saved record available.
2. **Data Explorer clipped on mobile.** A query grid demanded 571px inside a 390px dialog. Its grid track and children can now shrink; the measured content width is 366px. [Before](data-explorer-mobile-before.png) / [after](data-explorer-mobile-after.png).
3. **Upload action was inaccessible by keyboard.** A styled label became a real button with a 44px target. Enter opened the picker in the browser. The control resets the input so users can select the same file again. [Before desktop](upload-baseline-desktop.png) / [before mobile](upload-baseline-mobile.png) / [after mobile](upload-after-mobile.png).
4. **Historical query status was misleading.** Some saved AI queries keep counts but no preview rows. The empty grid and history badge now explicitly state that the preview is unavailable.
5. **Several mobile controls were too small.** Upload and Settings actions now have 44px minimum targets; Settings dialog fits within a 390px viewport. [Settings after](settings-mobile-after.png).
6. **Card count was shown as a decimal.** `row_count` now renders as an integer (`30`, not `30.00`). The Advanced header icon is now distinct from Data Explorer, and the upload empty state is vertically centered against the available height.

## Verification limits

- The synthetic CSV confirms the main Pi and UI journey, but this audit did not rerun every path against the full 79 MB official HDB demo.
- PDF generation stopped at the browser print action; no produced PDF was inspected.
- Browser offline/update behavior and every possible CSV structure were not exercised.
