# Work package 16 — venue-board publishing

Branch `feat/surface-book-remediation`, repo HEAD `446b9c0a` at verification time (started from `cf996a6e`; other packages landed concurrently on the same branch while this one ran). Scope: `apps/console/src/modules/workspace/DisplayConfig.tsx`, `apps/console/src/modules/workspace/displayConfig/**`, `apps/console/src/modules/display/DisplayProduct.tsx` (operator-side preview entry only), the display-link management UI (`apps/console/src/modules/settings/SharingTab.tsx` — found by searching "Replace link"/"Revoke"/"display link"; composed directly beneath `DisplayConfig` on the canonical `/publish/displays` page, so its copy is this package's to fix even though the file lives under `modules/settings/`), `docs/audits/v3-consolidated/`, per `plan.md` §3 row "Remove the tiny board preview instead of widening it" and §4 "Destructive/recovery copy"/"Buttons and links", findings V3-OC22.1/V3-OC22.2, and the OC23 evidence/state-coverage row (same Displays page as OC22).

No commits were made (per instructions).

## Files touched

- `apps/console/src/modules/workspace/DisplayConfig.tsx` — rewritten: heading renamed, "Public link" section removed (now solely owned by `SharingTab`), the 30rem inline `<iframe>` replaced by a single "Preview fullscreen" `<a target="_blank">` action against the same minted token, owner-denied vs. genuine-load-failure states distinguished, `showLinkControls` prop removed.
- `apps/console/src/modules/workspace/displayConfig/DisplayPreview.tsx` — **deleted** (dead code: the sample-data swatch was never imported anywhere outside its own doc comments; confirmed by grep before deletion).
- `apps/console/src/modules/workspace/displayConfig/DisplayLayoutEditor.tsx` — one doc-comment update noting the `DisplayPreview` removal (no behavior change).
- `apps/console/src/modules/workspace/WorkspaceShellSurface.tsx` — dropped the now-gone `showLinkControls={false}` prop at the `PublishPaneContent` call site; comment updated.
- `apps/console/src/modules/settings/SharingTab.tsx` — V3-OC22.2 copy fixes: no second page heading for `scope="links"`, eyebrow/field-label/access-sentence/replace-consequence/button-label changes (see ledger), "deliberately" dropped from the `scope="links"` intro (removed entirely, since it duplicated the page heading) and from the `scope="all"` intro.
- `apps/console/src/modules/display/DisplayProduct.tsx` — one string aligned to "venue board" naming (no structural change — its full-size embedded preview + existing "Open fullscreen" action were inspected and left alone; see Findings below).
- `apps/console/src/modules/display/MeetDisplayPage.tsx` — one stale comment referencing the deleted `DisplayPreview` corrected (comment only).
- `apps/console/src/modules/workspace/__tests__/DisplayConfig.test.tsx` — rewritten for the new behavior (see below).
- `apps/console/src/modules/settings/__tests__/SharingTab.test.tsx` — label/button-name updates plus three new tests (see below).
- `docs/audits/v3-consolidated/ledger/16-strings.md` (new).
- `docs/reference/debt-log.md` — new "Work package 16" subsection (one item).
- `apps/api/src/display/**` — **no changes.** `GET /tournaments/{id}/display-token` already both fetches and creates (`get_or_create_display_token`), which is exactly the "action that creates a link" the no-token state needed; no DTO or route change was required.

## What changed and why

**The tiny preview is gone, not widened (supersedes V3-OC22.1).** The plan explicitly overrides the finding's own "widen it" proposal: `DisplayConfig.tsx` no longer embeds an `<iframe>` at all. Board-source rows come first, then one `Row` with a single "Preview fullscreen" link that opens the exact same minted capability URL (`GET /tournaments/{id}/display-token`) every other surface (`SharingTab`, `DisplayProduct`) reads, in a new browser tab/window. Because it is a plain link rather than an embedded/mounted preview, there is no separate "return" code path to break — the configuration page underneath is never unmounted, so clicking the action and coming back leaves board sources, the layout controls, and all component state exactly as they were. This is tested directly (`DisplayConfig.test.tsx`'s "leaves the configuration page state untouched…").

**No-link state.** The backend route is owner-gated and auto-creates on the first successful call, so a genuine "does not exist yet" state is only reachable as a 401/403/404 denial for a non-owner — there is no window where an owner sees "no link" before one exists. `DisplayConfig` now distinguishes that denial (reason only, no action a non-owner could use anyway) from a real transient failure (reason + a **Retry** button that re-issues the same `get_or_create` call — the action that creates the link, satisfying the ruling's "reason + create action" for the one case where an action is actually available).

**One board name everywhere ("Venue board").** Before this package, the composed `/publish/displays` page stacked five different names for the same thing in one screen: the pane tab said "Displays," `DisplayConfig`'s own heading said "Display," `SharingTab`'s heading (scope="links") said "Display link," its eyebrow said "PUBLIC DISPLAY LINK," and its field label said "Public display link" (twice — visible label and duplicate `aria-label`). `DisplayConfig` now titles the page once ("Venue board"); `SharingTab` renders no second heading at all for `scope="links"` (it is only ever composed in this one place, directly beneath `DisplayConfig`); the eyebrow became "BOARD LINK"; the field label became "Venue board link." `DisplayProduct.tsx`'s own board-related banner string was aligned to match.

**Link copy (V3-OC22.2).** Replaced the flagged "Manage view-only display links and revoke access deliberately." with nothing at all for `scope="links"` (the heading it sat under is gone too) and fixed the underlying sentences to the plan's exact wording: the access sentence is now literally "Anyone with this link can view the board." and the sentence adjacent to the Replace control is literally "Replacing the link stops the old link from working." — shown at rest, not only once the two-click confirm is armed (the armed state appends the existing "every venue display goes blank…/press Escape" detail as a second sentence, not a substitute claim). The Replace button itself was renamed from "Revoke and replace link" to "Replace link" (aria-labels to match) — it performs one action (rotate-and-replace) and "Copy/Replace/Revoke" per the plan's grammar are each meant to read as one action with its consequence stated next to it, not "Revoke and replace" read as two verbs. The unrelated `scope="all"` intro's "Share each deliberately" was also dropped for the same "no deliberately" reason, since it renders on the same component and would otherwise still trip a literal grep for the word.

## Tests

- `DisplayConfig.test.tsx` (rewritten, 9 tests): Board layout renders when Meet is enabled; no inline iframe/sample-swatch/test-id ever renders; the fullscreen action stays for a bracket-only workspace while Meet-only controls hide; Board sources render explicit module state (Enabled/Off/Available + Modules→ link); the fullscreen action's `href` is the minted `?token=` URL and never the old viewer-gated `?id=` URL, with `target="_blank"`; the configuration page's own headings/controls are unaffected by the action being present; the owner-denied no-link state shows the reason with no action; a genuine load failure shows the reason plus a working Retry that re-mints and then shows the action.
- `SharingTab.test.tsx` (26 tests, 3 new): updated every `getByLabelText('Public display link')` → `'Venue board link'` and every button name (`'Revoke and replace the public display link'` → `'Replace the venue board link'`, confirm variant likewise); sharpened the "keeps Rotate out of the safe row" query from `/rotate/i` to `/replace/i` (the old regex would have passed vacuously once the button text no longer said "rotate" anywhere). New: the replace consequence text is present at rest and "deliberately" is absent anywhere on the page; `scope="links"` renders no `<h2>` of its own.
- `DisplayLayoutEditor.test.tsx` — inspected, no changes needed (it never referenced `DisplayConfig`, `showLinkControls`, or `DisplayPreview` directly).

## Commands run and results (verbatim)

```
$ npm --prefix apps/console run test:run -- src/modules/workspace src/modules/display
 Test Files  33 passed (33)
      Tests  230 passed (230)

$ npm run lint:scheduler
✖ 136 problems (0 errors, 136 warnings)
  0 errors and 3 warnings potentially fixable with the `--fix` option.

$ npx tsc -b apps/console
(clean — no output)
```

(The 136 lint warnings are pre-existing, downgraded-to-warn rules per CLAUDE.md's lean-gate philosophy — zero errors, none newly introduced by this package's edits. During the run, `npm run lint:scheduler` and `npx tsc -b apps/console` each transiently failed once on files entirely outside this package's scope — `modules/operations/UnifiedOpsList.tsx` and an `AuthMode` typing mismatch in `SharingTab.test.tsx`'s package-18 additions, respectively — because other agents were editing those files concurrently on the same branch; both were clean on re-run once that in-flight work settled. No backend files were touched, so no `pytest`/`ruff`/`lint-imports` run was needed.)

Also spot-checked, not part of this package's required gate: `npm --prefix apps/console run test:run -- src/modules/settings` — 111/111 passed (13 files), confirming `SharingTab.tsx`'s changes did not regress the concurrently-edited invitation/publication tests in that directory.

## Findings verified/fixed

- **V3-OC22.1** — "the preview shows a narrow vertical board… the operator cannot assess the venue layout without leaving the configuration page." The plan's own decision **supersedes** this finding's proposed fix (widen the preview, move link actions beneath it): instead, the inline preview is removed entirely and replaced with an explicit "Preview fullscreen" action against the real published board. Acceptance re-read for the superseding treatment: board-source rows appear first, the fullscreen action is present and adjacent, it targets the configured token's actual board URL, and returning from it (a plain new-tab link, nothing unmounted) leaves the configuration page untouched — all four asserted directly in `DisplayConfig.test.tsx`.
- **V3-OC22.2** — "Manage view-only display links and revoke access deliberately" read as an internal policy admonition and didn't explain the replace consequence. Fixed: the admonition sentence is gone (along with the heading it sat under, since the composed page no longer needs a second one); the access sentence and the replace-consequence sentence now match the plan's exact wording, the consequence sits next to the Replace control at rest (not only when armed), and no "public display link" heading repeats anywhere on the page — one name, "Venue board," end to end.
- **OC23** ("Same Displays page as S22" — evidence/state coverage) — addressed by the same test suite: the no-link (owner-denied), load-error, and configured-token states of the fullscreen preview action are each covered directly in `DisplayConfig.test.tsx`, and the Replace control's resting/armed states plus its adjacent consequence text are covered in `SharingTab.test.tsx`.

## Debt logged

- **V3-16-1** (`docs/reference/debt-log.md`, "Work package 16"): `WorkspaceShellSurface.tsx`'s `case 'display-config':` switch branch (which would render `DisplayConfig` without `SharingTab`) is dead code — the only nav entry reaching that segment (`publish/displays`) is intercepted earlier by the component's own `/publish/` path check. Confirmed by grep; not removed here as it's a routing-logic cleanup outside this package's Displays-composition scope.
