> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# Bundle 5 — Bracket Setup chrome parity (design)

**Date**: 2026-05-15
**Status**: design / approved (chat 2026-05-15)
**Source**: user complaint "the formatting on the tournament side is a little off. it's like non functional. … if u go through it visually the setup is not as comprehensive. … meet side has a perfect user flow that maximizes screen space with functionality — how can we turn this for tournament side". Originally flagged in the 2026-05-15 audit ("not everything is full screen"); deferred from Bundles 2 and 3.

## Goal

Bring the bracket Setup tab to visual + functional parity with the meet Setup tab by replacing today's narrow centered form with the same `SettingsShell` sidebar+content chrome the meet uses, and adding the missing Tournament-data and Share sections that meet has.

## Non-goals

- Bracket Roster overhaul (Bundle 6).
- Bracket Events overhaul (Bundle 7).
- Appearance section on bracket Setup (user scoped out — per-device, low value).
- Engine section on bracket Setup (no solver for bracket draws — doesn't apply).
- Public-display section on bracket Setup (bracket has no TV view by design).
- Backend bracket data ops beyond what already exists (no new import/backup/reset endpoints — Exports only).
- Touching `BracketViewHeader`, the event-selector row that sits above the bracket sub-views.
- Any other bracket tab (Roster, Events, Draw, Schedule, Live).

## Architecture

Replace `BracketTab`'s Setup branch with a `SettingsShell`-based composition. The existing form becomes the inner content of the "Tournament" section; two new sections drop in around it.

```
BracketTab.Setup:
  <SettingsShell sections={...} defaultSectionId="tournament" />

sections = [
  { id: 'tournament',  label: 'Tournament',      icon: Sliders,  render: BracketTournamentSection },
  { id: 'data',        label: 'Tournament data', icon: Database, render: BracketDataSection },
  { id: 'share',       label: 'Share',           icon: Share,    render: ShareSettings },
]
```

`SettingsShell` (`products/scheduler/frontend/src/features/settings/SettingsShell.tsx`, ~129 LOC) already exists, is the chrome (sidebar with numbered items + content pane), and is tournament-kind-agnostic. `ShareSettings` (~222 LOC) is also tournament-kind-agnostic — it talks to the shared `/members` and `/invites` API. Both reuse with zero modification.

## Components

### `BracketTournamentSection` (rename of today's `SetupTab.tsx`)

Path: `products/scheduler/frontend/src/features/bracket/BracketTournamentSection.tsx` (new file; old `SetupTab.tsx` deleted in the same commit).

Wraps today's bracket Setup form fields — name, date, courts, slot duration, start time, end time, rest between rounds — in `SettingsPrimitives.Section` chrome so it visually matches meet's `TournamentConfigForm`. The form logic stays unchanged; this is presentation refactor only.

The existing test file `SetupTab.test.tsx` renames to `BracketTournamentSection.test.tsx`. The assertions on field render + save behavior stay; only the rendered component import name changes.

### `BracketDataSection` (new)

Path: `products/scheduler/frontend/src/features/bracket/BracketDataSection.tsx` (~40 LOC).

Three `<a href download>` Export buttons (JSON / CSV / ICS) using `apiClient.bracketExportJsonUrl(tid)` / `bracketExportCsvUrl(tid)` / `bracketExportIcsUrl(tid)`. Same URL builders Bundle 2 used in `BracketScheduleHeader`. Tournament id from `useTournamentId()`.

No import, no backup, no reset. (Out-of-scope decision documented above; Bundle 5 ships Exports only.)

Layout: `SettingsPrimitives.SectionHeader` + a `Row` per export button, mirroring meet's `DataSettings.tsx` shape.

### `ShareSettings` — reused as-is

No new file. Bracket Setup imports `ShareSettings` from `products/scheduler/frontend/src/features/settings/ShareSettings.tsx`. Zero modifications. The component already handles members + invite-generation against tournament-kind-agnostic endpoints.

### `BracketTab.tsx` — Setup branch rewire

The `view === 'setup' && <SetupTab />` branch becomes:

```tsx
{view === 'setup' && (
  <SettingsShell
    sections={bracketSetupSections}
    defaultSectionId="tournament"
  />
)}
```

where `bracketSetupSections` is built (likely as a memoized `useMemo`) inside `BracketTab` from the three section definitions above. Icons reused from meet's `@phosphor-icons/react` imports.

`SetupTab` is no longer referenced anywhere after this commit. The old file is deleted; the rename + content stays in `BracketTournamentSection`.

## Data flow

- **Source of truth for Tournament section**: `useTournamentStore` (the shared store `SetupTab.tsx:13` reads today — `config` + `setConfig`) — no change. The store is kind-agnostic at the config level; brackets store their setup config there same as meet does.
- **Source of truth for Data section**: `useTournamentId()` for the tid; static URL builders.
- **Source of truth for Share section**: `ShareSettings` reads from the shared `/members` and `/invites` endpoints — unchanged.
- **Active section**: driven by `SettingsShell`'s URL-backed `?section=` query state if Bundle 3's URL routing already plumbs that through; otherwise local state inside `SettingsShell` (verify on implementation pass).

## Error handling

- **`SetupTab.tsx` → `BracketTournamentSection.tsx` rename**: preserve existing error states (failed save toast, validation errors). No new error surface.
- **Export buttons**: plain `<a href download>` links. No JS error handling needed — the browser handles failed downloads. If `tid` is missing (shouldn't happen since `BracketTab` only mounts inside `/tournaments/:id/*`), the URL builders produce a malformed URL that 404s; an existing axios interceptor toast surfaces it on the user's first attempt.
- **Unknown `?section=`**: `SettingsShell` already handles this — falls back to `defaultSectionId`. Verify behavior holds for `?section=display` (which exists on the meet but not on bracket — should harmlessly snap to `tournament`).

## Testing

- **`BracketTournamentSection.test.tsx`** — rename of `SetupTab.test.tsx`. Existing assertions on field render + save behavior stay green; only the component import name + file location change.
- **`BracketDataSection.test.tsx`** — new (~30 LOC). Renders the three Export `<a>` elements; asserts each `href` matches the bracket export URL pattern (e.g. `/tournaments/t1/bracket/export.json`). Mirrors `BracketScheduleHeader.test.tsx`'s Export-button assertions.
- **`BracketTab.test.tsx`** — extend with one new assertion: mounting at `bracket-setup` renders the three section nav items (`Tournament`, `Tournament data`, `Share`). The existing `BracketTab — fresh tournament (data === null)` tests for the bracket-setup tab continue to pass against the new shell (the inner form is the same).
- **`ShareSettings`** — no changes; existing tests cover it.

## Risks / unknowns

- **`SettingsShell` URL ↔ section sync**: meet's `TournamentSetupPage` reads `?section=...` from the URL to drive which sidebar item is active (the "Configure display" button on TV uses this to deep-link). Verify Bundle 3's URL routing changes didn't break the `?section=` query string preservation for `bracket-setup`. If broken, fix as part of this bundle; if fine, defer the audit's separate "Configure display lands on wrong section" finding to Bundle 4 as planned.
- **Section ordering vs operator habit**: meet's Setup order is `Tournament → Engine → Public display → Appearance → Tournament data → Share`. Bracket Setup gets `Tournament → Tournament data → Share` (Engine/Display/Appearance dropped). The Tournament-data section moves from position 5 to position 2. Acceptable — operators learning bracket-side aren't yet anchored to meet's positions; the section's label is self-explanatory.
- **Existing `SetupTab.tsx` consumers**: `BracketTab.tsx` is the only importer per the `find products/scheduler/frontend/src -name "*.tsx" | xargs grep -l "from.*bracket/SetupTab"` smoke check. Confirm on implementation; if anything else imports it, those callers update at the same time.
- **Tests in the existing `__tests__/SetupTab.test.tsx`** assume the component name `SetupTab`. The rename to `BracketTournamentSection` updates the import + the `describe` label; assertions stay.

## Acceptance criteria

The bundle is done when:

1. The bracket Setup tab renders the meet-style sidebar+content shell (left sidebar with numbered items; content pane on the right) instead of the centered narrow form.
2. The sidebar shows three items: `01 Tournament`, `02 Tournament data`, `03 Share`. Icons match meet's (Sliders / Database / Share).
3. Clicking each sidebar item swaps the content pane and updates the URL `?section=` query string.
4. The Tournament section renders the same fields the bracket Setup form has today (name / date / courts / slot duration / start / end / rest between rounds) and saves identically.
5. The Tournament data section renders three Export buttons (JSON / CSV / ICS) that link to the existing bracket export URLs.
6. The Share section renders the existing meet `ShareSettings` component unchanged — members list, generate invite link, role dropdown all work for the bracket tournament.
7. The `BracketViewHeader` (event selector + Reset) above the sub-views is unchanged.
8. URL `/tournaments/:id/bracket-setup` still routes here; `/tournaments/:id/bracket-setup?section=share` deep-links to the Share section.
9. All other bracket tabs (Roster, Events, Draw, Schedule, Live) are unchanged.
10. All existing tests pass. New tests added per the Testing section pass.

## Out-of-scope reminder

Bundles 6 (Bracket Roster overhaul) and 7 (Bracket Events overhaul) are separate brainstorming cycles. The smaller polish items in `docs/audits/2026-05-15_bundle-4-candidates.md` are still Bundle 4 — Bundle 5 doesn't pull from that list.
