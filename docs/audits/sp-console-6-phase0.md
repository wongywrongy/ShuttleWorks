# SP-CONSOLE-6 — Phase 0 audit

**Date:** 2026-09-03 · **Status:** complete, rulings taken (ADR 0025) · **Scope:** read-only

Named `SP-CONSOLE-6`, not `SP-CONSOLE-2` as the originating brief had it — see ADR 0025 R-NAME-0.

Inputs: `docs/screenshots/ui-review/operator-console-surface-book.{pdf,html,manifest.json}`
(33 surfaces, captured 2026-09-03), `docs/explanation/console-naming.md`, the console source,
and the Figma library `XoYB2mvcA8Mw5IpbjvIQ4d`.

## 0.0 Premises that did not hold

| # | Brief said | Repository says |
|---|---|---|
| B1 | `docs/audits/operator-console-audit-2026-09-03.md` is the oracle | Does not exist — absent from the working tree, `git log --all -- docs/audits/`, every branch, stash and untracked files. Successor: `docs/explanation/console-naming.md`. |
| B2 | Phase 3 maps components via Code Connect | Code Connect requires a Dev/Full seat on Organization or Enterprise; this account is Professional. Not executable. |
| B3 | The program is SP-CONSOLE-2 | SP-CONSOLE-2 completed 2026-08-17 (`ab117e56`). SP-CONSOLE-3, 3A, 4, 5 and REFINE followed. |
| B4 | Code at `products/scheduler/`; ADRs in `docs/decisions/`; ledger `REFACTOR_PROGRESS.md` | `apps/console` + `apps/api` + `packages/design-system`; `docs/explanation/decisions/`; no ledger — CLAUDE.md directs open work to `docs/reference/debt-log.md`. |
| B5 | `/roster`, `/matches`, `/setup` reachable unguarded in bracket workspaces | All three render the guard. See 0.1. |

## 0.1 Route census

Top level (`apps/console/src/app/App.tsx`): `/login`, `/invite/:token`, `/display`,
`/tracking`→`/`, `/live-ops`→`/`; under `AuthedLayout`: `/`, `/new`, `/settings`,
`/tournaments/:id/bracket` (redirect), `/tournaments/:id/settings` (redirect),
`/tournaments/:id` (redirect), `/tournaments/:id/*` → `TournamentPage`, `*` → `/`.

**The module guard is already uniform and central.** One call site — `AppShell.tsx:287`
rendering `<ModuleUnavailablePanel>`. One predicate — `AppShell.tsx:73`:

```ts
if (active && isModuleEnterable(active.status)) return { kind: 'outlet' };
```

That is module status driving the gate, which is what a uniform guard means. Surface-book
entries S30–S33 corroborate: `/entries`, `/setup`, `/roster` and `/matches` each render a
guard in a bracket workspace. `ModuleOutlet` only mounts; it does not gate.

Guard copy carries two vocabulary problems: "isn't available in this **workspace**" and
`REASON_COPY.disabled` = "This **module** is turned off, but its data is preserved."

## 0.2 Field-owner census

| Field | Reads / writes | Verdict |
|---|---|---|
| Name | Setup · General (`SetupProduct.tsx:169`, "Tournament name") **and** Workspace settings (`GeneralSettingsTab.tsx:82`, label "Name") | **Two writers — defect** |
| Date | Setup · Dates (S07) **and** Workspace settings (`GeneralSettingsTab.tsx:88`, label "Date") | **Two writers — defect** |
| Venue / courts | Setup · Venue (S08) | Single writer |
| Visibility / public link | Setup · Public information (S13, incl. "Public slug"), Publish · Site (S20), Publish · Links (S23), `SharingTab` | Spread across three surfaces |
| People | Setup · Staff (S12), Administration · Team (S25) / `PeopleAccessTab` | Two surfaces |

Confirms the brief's cut-list item "Name and Date fields on Workspace settings".

## 0.3 Name-rendering census

A formatter exists: `apps/console/src/lib/names.ts` — BWF "SURNAME Given", presentation-only,
applied at read sites. Exports `formatPlayerName`, `formatSideName`, `sideNameLines`,
`sideSurnameLine`.

Callers (5): `meet/matches/MatchesSpreadsheet.tsx`, `operations/run/RunCourtGrid.tsx`,
`display/publicDisplay/CourtsView.tsx`, `bracket/BracketMatchesTab.tsx`,
`bracket/BracketPlayerFields.tsx`.

The venue board deliberately differs — `CourtsView` uses `sideSurnameLine`, documented in
`names.ts`: a doubles card printing every player's full name spends four lines on two sides,
which halves the type size the 1-inch-per-10-feet rule requires.

The entrant tier has a separate `PersonRef` (ADR 0018) which the console does not import.
Two identity systems, one per tier, by design (ADR 0025 R-ID-1).

## 0.4 Score-entry census — 8 submitters

Bracket: `DrawView.tsx`, `BracketScoreEntry.tsx`, `BracketMatchesTab.tsx`, `BracketRunControls.tsx`.
Operations · Run: `RunFinished.tsx`, `MeetMatchControls.tsx`, `ScoreEditor.tsx`, `RunSurface.tsx`.

Two API paths are both live in `apps/console/src/api/client.ts`:
`recordResult` → `POST /bracket/results` (line 1656, legacy) and
`recordResultCommand` → `POST /bracket/commands` (line 1849, canonical per CLAUDE.md).
`BracketMatchesTab.tsx:536` uses the command path; the others use the legacy one.

Target: one score sheet, one submitter.

## 0.5 Figma inventory

Account `kyle` / "Kyle Wong's team" (`team::1635792425890684766`), tier **professional**.
File `XoYB2mvcA8Mw5IpbjvIQ4d` accessible. 18 pages (15 with content, 3 empty).

| Collection | Modes | Variables |
|---|---|---|
| Primitives | Value | 53 |
| Color | Light, Dark | 102 |
| Scales | Value | 51 |
| Tokens | Value | 25 |

Styles: 9 text, 16 effect, 0 paint. Component sets: 9.

**Unbound-paint audit, every content page — 1,696 nodes, 0 unbound:**
Cover 5 · Getting Started 27 · Foundations Color 970 · Type 59 · Scale 137 · Elevation 85 ·
Button 111 · Button (Icon) 59 · StatusPill 55 · Card 25 · TextField 43 · Select 37 ·
Notice 43 · Separator 13 · EmptyState 27.

Publish state is not determinable through MCP on a Professional seat — the probe tool is
itself plan-gated. Treated as unpublished.

## 0.6 Vocabulary grep

| Hits | String | Location |
|---|---|---|
| 1 | `live domain records` | `modules/setup/SetupProduct.tsx:388` |
| 3 | `Data impact:` | `modules/settings/ModuleCatalogRow.tsx:111,113,114` |
| 1 | `derived from match state` | `modules/settings/GeneralSettingsTab.tsx:115` |
| 1 | `IANA` | `modules/setup/SetupProduct.tsx:172` |
| 1 | `Eligible to restore` | `modules/settings/SyncBackupsTab.tsx:278` |
| 1 | `surface owns` (user-facing) | `modules/workspace/WorkspaceShellSurface.tsx:152` |
| 1 | `Public slug` (field label) | `modules/setup/SetupProduct.tsx:335` |
| 0 | `DOWNSTREAM IMPACT` | already removed |
| 5 | `ENGINE` | all code comments / constant names; none user-facing |

**Identifier leak:** `modules/bracket/BracketMatchesTab.tsx:282` —
`cellTitle: ({ pu }) => pu.id` renders a match id into a title attribute.

`ENGINE` and the two non-UI `surface owns` hits are code comments and are out of scope:
the rule governs what an operator can read, not what a maintainer can.

## 0.7 Viewport evidence (R-A1)

`tools/surface-capture.mjs:284` declares `["mobile", 390, 844]`; the book captures every
surface at desktop 1440×900 **and** mobile 390×844. All 33 surfaces × 2 viewports report
`ok: true`, `httpStatus: 200`, and `consoleErrors: []`. Zero capture errors.

Two consequences. The Done condition "console errors = 0" is already satisfied as captured.
And the brief's "9 broken surfaces" cannot be named — no artifact in this repository
identifies them.

## 0.8 Not verifiable in this pass

The runtime defects in the brief's §4.1 — the Backups 404 on load, `[object Object]` on
Matches mobile row headers, and the readiness predicate reporting Ready on an empty rules
format — do not appear in the manifest, which records no console errors anywhere. The
book's `baseUrl` is a tailnet host (`100.68.168.126:8090`) not reachable from this
environment. They can be pursued by reading code, but cannot be confirmed as observed
defects until the stack is running.
