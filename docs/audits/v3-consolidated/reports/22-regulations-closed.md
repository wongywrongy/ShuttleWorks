# Work package 22 — regulations and closed-entry pages

Branch `feat/surface-book-remediation`, repo HEAD `3f84ef2d` at start. Scope: `apps/entrant/app/routes/regulations.tsx`, the entries-closed branch of `apps/entrant/app/routes/enter.tsx`, the shared account chrome (`enter.tsx`'s footer — no separate component existed; see "Chrome location" below), `apps/entrant/tests/**`, and `docs/audits/v3-consolidated/`, per plan.md §4 rows "Page titles and navigation", "Buttons and links", "Organizer content", "Success", "Empty states" and findings V3-PE15.1, V3-PE15.2, V3-PE16.1, V3-PE16.2.

No commits were made (per instructions).

## Chrome location

Findings V3-PE16.1/16.2 both name `enter.tsx`'s zero-open-events state and its footer. There is no separate "account chrome" component: `PlayShell` (`apps/entrant/app/components/PlayShell.tsx`) already renders the header's session-aware `Sign in` / `My entries` split (§3.8, pre-existing and correct); the sign-out mechanism lives only in `enter.tsx`'s footer (by design — it reuses the double-submit nonce that page already mints; see the in-file comment). `myEntries.tsx` has a sign-in prompt but no sign-out control. So the single place to fix H1 (one state-aware account action) was `enter.tsx`'s footer.

`enter.tsx` had uncommitted changes from a concurrent package (button-height edits, `h-10`→`h-11` on three wizard-step buttons) at the start of this session. Per instructions, edits below are targeted string/JSX edits around those hunks, not a rewrite; `git diff --stat` was checked before editing and confirms no overlap with the touched regions.

## Files touched

- `apps/entrant/app/routes/regulations.tsx` — sidebar link labels now match `TabBar`'s own vocabulary; the duplicate provenance/contact-details footer paragraph is removed; an organizer-authored source citation ending in a bare URL is now linkified (content untouched) instead of shown as raw text (V3-PE15.2).
- `apps/entrant/app/routes/enter.tsx` — the closed-entries state names the tournament and drops the repeated heading/reopening promise (V3-PE16.1); the footer's sign-in/sign-out control is now derived from the real session (cookie presence) instead of rendering both a hedge question and an unconditional sign-out button (V3-PE16.2).
- `apps/entrant/tests/regulations.render.test.ts` (new) — SSR render tests for the link labels, the removed provenance/contact-details text, and the source-citation linkification.
- `apps/entrant/tests/enter.render.test.ts` — updated the two tests that pinned the old closed-state copy; added tests for the new closed-state copy and the session-aware footer.
- `apps/entrant/tests/logout.test.ts` — updated fixtures to fetch signed-in by default (most of this file exercises the sign-out form's mechanics, which now only render when the session cookie is present); updated the copy hedge assertion; added a signed-out-absence test.
- `apps/entrant/vitest.test-files.ts` + `apps/entrant/tests/launch-scripts.test.ts` — registered the new `regulations.render.test.ts` in the pinned SSR test-file list (`launch-scripts.test.ts` derives and pins this list's length; both needed the one-line addition together).
- `docs/reference/debt-log.md` — new "work package 22" subsection (V3-22-1: no reporting-time field exists on Setup's public-information section, routed to package 13 with an organizer-confirmation requirement).
- `docs/audits/v3-consolidated/ledger/22-strings.md` (new).

## Per-finding acceptance

**V3-PE15.2** (regulations link labels + raw URL) — met. Sidebar links now read "Overview" / "Draws" / "Players", matching `TabBar`'s `TAB_LABELS` (`apps/entrant/app/components/TabBar.tsx:18-20`) — the same names the tournament page's own navigation uses for these destinations. The footer's duplicate provenance paragraph ("Source: this document is published by...") and the "Contact details are not published on this page" sentence are removed; the organizer's name already appears once, in the document header's `dl`. Separately, the historical-demo regulations text (`simulator/tournament_sim/seed.py`) ends some tournaments' text in a bare `Source[ reference]: <url>.` citation — this is now rendered as a link with a label derived from the URL (e.g. "2026 BWF World Tour") rather than a raw address in prose; the organizer's own words are untouched (R1). `seed.py` itself was not edited — the fix is a rendering change in `regulations.tsx`.

**V3-PE15.1** (ambiguous "N minutes before match is called" reporting rule) — handled per ruling R2, not "fixed": the regulations reader already renders organizer text verbatim (no change needed for that half). Checked `apps/api/src/workspaces/setup.py`'s public-information section for a reporting-time/check-in field to cite as a system-chrome line next to the rule — **none exists**. Per R2, nothing was added to the public page (adding a chrome line naming "scheduled start" without such a field would be this pass inventing organizer policy). Logged as `V3-22-1` in `docs/reference/debt-log.md` (package 13 should add a structured reporting-reference field, organizer-confirmed) and marked "conditional: organizer confirmation" in `docs/audits/v3-consolidated/ledger/22-strings.md`.

**V3-PE16.1** (closed-entries state repeats itself and implies reopening) — met. The zero-open-events section's own repeated heading ("No event is taking entries right now") is removed (the page's h1 "Entries are closed" is the one heading); the paragraph now reads "Entries are closed for {tournament name}. View the tournament page for schedules and results." — the ruling's exact text. Checked `EntryPageDTO`/`EntryTournamentDTO`/`EntryPolicyDTO` (`apps/entrant/app/lib/entryPage.types.ts`) for a published entry-window field to branch on — none exists (`phase` includes `entries_closed` but carries no future-window date) — so no reopening is promised, per the ruling's conditional.

**V3-PE16.2** (header says Sign in, footer says Sign out) — met. `enter.tsx`'s loader now reads `hasEntrantSession(request)` (cookie presence, the same read `PlayShell`'s header already uses for its own `Sign in`/`My entries` split — not a credential relay, R8-D: the value is never read). The footer renders exactly one of: signed-out → "Sign in" link only, no sign-out affordance, no "Signed in on this device?" question; signed-in → "Sign out" button plus one device-scope sentence, stated once (not doubled with a preceding question). `logout.test.ts`'s mechanics tests (CSRF token, POST-only, button styling) now fetch with the session cookie present by default, since the control they exercise only renders in that state; a new test confirms its absence when signed out.

## Commands run (verbatim)

```
$ npm run -w apps/entrant test:run
...
 Test Files  1 failed | 52 passed (53)
      Tests  2 failed | 946 passed (948)
```
The one failing file, `tests/dtoParity.test.ts` ("draws.types.ts... to include 'SideDTO'"), fails against `apps/entrant/app/lib/draws.types.ts` / a new `apps/entrant/app/lib/side.ts`, both under concurrent package 11's edits (confirmed via `git status` — neither file is in this package's scope, and the failure is present independent of any change made here). All 946 other tests pass, including the new/updated regulations, enter, and logout suites (`regulations.render.test.ts` 4/4, `enter.render.test.ts` 31/31, `logout.test.ts` 46/46).

```
$ npm run typecheck:entrant
> react-router typegen && tsc
```
First observed clean (exit 0, no output). A later re-run in the same session failed on `tests/components.test.ts:43` and `tests/sitemap.test.ts:18` against `SeasonRow` — both errors are in `apps/entrant/app/lib/phase.ts` (concurrently modified this session per `git status`, not a file in this package's scope) and in test files this package did not touch. Re-run once more to confirm: same two errors, unrelated to `regulations.tsx`/`enter.tsx`/the new or updated tests in this package's scope, which type-checked clean throughout.

```
$ npm run lint:entrant
> eslint .
(clean — no output, exit 0)
```

Node used: `~/.local/share/zed/node/node-v24.11.0-linux-x64/bin` (added to `PATH`), `v24.11.0`.

## Debt logged

- `docs/reference/debt-log.md` V3-22-1 — no reporting-time/check-in field exists in Setup's public-information section (`apps/api/src/workspaces/setup.py`) to bind V3-PE15.1's rule to an observable reference. Routed to package 13 with an explicit organizer-confirmation requirement; the string is marked "conditional: organizer confirmation" in `docs/audits/v3-consolidated/ledger/22-strings.md` (§C2) rather than shipped as a guess.
- Displaying the signed-in account's actual name/email in the footer (rather than just the Sign-out/Sign-in state) would need a new credentialed browser-side call — no existing route returns it and no new API route or script asset is in this package's file scope. Noted in the ledger's "Considered and NOT changed" table (§C5) rather than built ad hoc.
