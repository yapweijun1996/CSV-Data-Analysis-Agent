# Upload screen visual review

## Scope

Reviewed the supplied real baseline screenshots at 1280×720 desktop and 390×844 mobile. This is a screenshot-only visual review; it does not establish DOM semantics, keyboard behavior, or the current CSS implementation. [upload-visual-proposal.svg](upload-visual-proposal.svg) is a **design proposal and visual anchor**, not an implemented application screenshot.

## Findings

### 1. Upload content stack sits below the visual center — Medium

- **Observed evidence:** In the desktop screenshot, the dashed upload area spans approximately y=50–708 (center ≈379), while the content from the upload icon to the provider note spans roughly y=211–603 (center ≈407), about 28px low. On mobile, the area spans about y=69–832 (center ≈451); the content stack spans roughly y=283–692 (center ≈488), about 37px low. The upper blank area is visibly taller than the lower blank area in both images.
- **Proposed remedy:** Center the complete empty-state content wrapper within the dashed upload surface using a single flex/grid layout (`display: grid; place-content: center`) and balanced inline padding. Avoid adding independent vertical offsets to each child; let the stack's total height determine its centered position.
- **Acceptance criteria:** At both 1280×720 and 390×844, the visual center of the icon-to-provider-note stack is within 12px of the upload surface center. The heading, actions, callout, and note remain fully inside the dashed area with no overlap or clipping.

### 2. Mobile primary and demo buttons are shorter than a 44px touch target — High

- **Observed evidence:** In the mobile baseline, “Select a file” is approximately 30px high and “Load Full Raw HDB Data” approximately 34px high. The three header controls are already about 44px high. In the desktop screenshot, header controls are about 25px high, while the two content buttons are about 30px and 34px high.
- **Proposed remedy:** Give button components `min-height: 44px`, `box-sizing: border-box`, centered inline-flex alignment, and sufficient horizontal padding. Keep the file-selection button visually primary and the HDB action outlined inside its existing callout.
- **Acceptance criteria:** At both viewport sizes, every visible button/control has at least a 44px-high hit area; labels remain vertically centered and unwrapped, and the HDB callout retains its current content and secondary visual hierarchy.

### 3. Header glyphs look small inside the compact controls — Low

- **Observed evidence:** Header action boxes on mobile meet the 44px target, but their history, code, and chat glyphs appear roughly 13–15px across. Desktop header controls and glyphs are smaller still. On mobile, the three actions are icon-only, so glyph shape carries most of the visible recognition.
- **Proposed remedy:** Size the header SVG icons to about 18–20px with consistent stroke weight and optical centering. Preserve the existing history/code/chat shapes, Assistant blue treatment, and muted Data Explorer treatment.
- **Acceptance criteria:** At 390px and 1280px widths, icons render at 18–20px within their button hit areas, align to the same visual center, and remain distinct at normal screenshot scale.

### 4. Provider notice has low visual weight at mobile size — Low

- **Observed evidence:** The privacy/provider notice appears around 10–11px in the mobile screenshot and spans two narrow lines below the HDB card. It is secondary information, but its small type is harder to scan than the surrounding 12–16px copy.
- **Proposed remedy:** Use a 12px type size with at least 16px line height and a centered max-width around 340px; allow the existing sentence to wrap onto additional lines rather than shrinking the text. Keep the same copy and subdued text role.
- **Acceptance criteria:** At 390px, the complete notice is readable at 12px or larger, wraps naturally within the dashed-area safe margins, and does not collide with the HDB callout. At 1280px, it remains centered and does not stretch into an unnecessarily long line.

## Proposal notes

- The SVG keeps the visible controls and supplied copy: History, Data Explorer, Assistant, CSV upload/drop prompt, file picker, HDB raw-data action, and provider notice.
- Its 390×844 layout uses a 12px outer safe margin, 44px button heights, and a balanced centered content stack. It is a proposed design reference only; no app files were changed and the app was not run.
