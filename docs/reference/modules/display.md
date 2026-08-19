# Display

**Tier-1, user-enableable module.** Display is the read-only public output: the venue TV / projector
view of live matches, the draw, and results for whichever engine is enabled. It writes nothing and
reaches every screen by polling; since SP-CLOUD-2 its public link is a **capability token**, and
the token-resolved `/display/{token}/*` projection routes are the only backend routes it owns.
This page is for engineers who need to know exactly what Display reads, what it owns, and the seam
that guarantees it can never become a writer.

## What it does

- Renders the standalone public surface at **`/display?token=<capability-token>`** (mounted
  *outside* `AppShell` — the token, not a session, is the credential) and the in-workspace
  **Preview** (`tv`) surface. Both render the same `PublicDisplayPage`. The raw
  `/display?id=<tournament-id>` form still works for the in-shell preview and local mode, but it
  hits the viewer-gated owner-side endpoints — a raw workspace UUID is deliberately **not** a
  public key.
- The token is per-workspace (`display_tokens` table, one row per tournament), minted on first
  ask at `GET /tournaments/{id}/display-token` and revoked by rotation
  (`POST …/display-token/rotate` — the old link dies the moment it returns). The Settings →
  Sharing tab surfaces mint/copy/rotate.
- `PublicDisplayPage` is a **kind-router**: `useDisplayKind` reads the workspace `kind` — from the
  unauthenticated `/display/{token}/summary` projection in token mode, or `getTournament` with
  `?id=` — and renders `MeetDisplayPage` for meet workspaces or `bracketDisplay/BracketDisplayPage`
  for bracket workspaces. It defaults to the meet display while the kind is loading, so existing
  meet workspaces are unchanged.
- The meet display offers three director-selectable views via `?view=`: **`courts`** (default —
  current / called match per court), **`schedule`** (upcoming matches), **`standings`** (school-vs-school
  leaderboard). The bracket display offers **`live`** (default), **`draw`** (the read-only tree, per
  `?event=`), and **`results`** (winners / champion per event).
- Provides a **Configuration** surface (`display-config`) so the operator can set up what the TV shows;
  the in-shell `DisplayProduct` exposes a "Configure display" shortcut (to `setup?section=display`) and
  an "Open fullscreen" affordance that opens the standalone display window.

:::warning Two query parameters: `?token=` (public) vs `?id=` (in-shell/local)
The standalone route resolves its data source from the URL: with `?token=`, the polling hooks
(`useDisplaySync`, `useDisplayKind`, `useBracketDisplaySync`, and the shared `useLiveTracking`
poll) switch to the unauthenticated `/display/{token}/*` projection routes and every mutator is
inert; with `?id=` they call the viewer-gated owner-side endpoints. With neither, every server
call no-ops and the page shows a "missing parameter" message rather than crashing.
:::

## What it owns

| Kind | Owned |
| --- | --- |
| **Nav surfaces** | Preview (`tv`) · Configuration (`display-config`) — both declared in `displayContract.ownedSegments` and rendered by the workspace shell |
| **Backend routes** | the public projection: `GET /display/{token}/{summary,state,match-states,bracket}` (`api/display.py`) — every route `GET`, resolved by capability token only, serving a strict field allowlist (the meet projection omits operator material like `scheduleHistory`); plus the owner-side `GET·POST /tournaments/{id}/display-token(/rotate)` |
| **`apiClient` methods** | owned: `getDisplaySummary`, `getDisplayState`, `getDisplayMatchStates`, `getDisplayBracket` (`displayContract.ownedEndpoints`); it *consumes* `getTournamentState`, `getMatchStates`, `getBracket` (`displayContract.consumedEndpoints`) |
| **Frontend code** | `modules/display/` — `DisplayProduct.tsx`, `PublicDisplayPage.tsx` (the kind-router), `MeetDisplayPage.tsx`, `bracketDisplay/`, the `publicDisplay/` view components + `useDisplaySync`, and the TV presets (`publicDisplay/displayPresets.ts`) |

The single source of truth for these claims is `platform/contracts/moduleContract.ts` (`displayContract`),
which is pinned by a colocated test. Its `produces` and `emits` are both `[]` — Display is the
read-only output module and can never silently grow a write path or a back-channel without that
descriptor (and its test) changing.

## What it consumes

Display reads **three DTOs** and reacts to live changes via its **own independent polls** — it never
subscribes to another module's store as a push source:

| DTO | Read via | Cadence | Owner |
| --- | --- | --- | --- |
| **`TournamentStateDTO`** | `getTournamentState` (`/state`), or `getDisplayState` in token mode, in `useDisplaySync` | ~10 s | Control plane (shared) |
| **`MatchStateDTO`** | `getMatchStates` (`/match-states`), or `getDisplayMatchStates` in token mode, in `useLiveTracking` | ~5 s | **Operations** |
| **`BracketTournamentDTO`** | `getBracket` (`/bracket`), or `getDisplayBracket` in token mode, in `useBracketDisplaySync` | ~10 s | **Bracket** |

The `MatchStateDTO` poll is the **[Operations → Display contract](/reference/contracts/operations-display)** —
**Seam D**, the `matchStateChanged` edge. The operator action that writes a `match_states` row *is*
that edge; Display reacts to it by re-fetching, not by being pushed to. The match state machine
(`scheduled → called → playing → finished | retired`) is owned by
[Operations](/reference/modules/operations); Display only renders its current value. See
[Universal Match Contract (ADR 0009)](/explanation/decisions/0009-universal-match-contract).

## Read-only by construction

Display's read-only guarantee is structural, not a convention:

- **No write path, no emitted edge.** `produces === []`, `emits === []`, and every route Display
  owns is a `GET` — the capability token grants no mutation anywhere (a property the isolation
  tests pin). The standalone page mounts outside `AppShell`, so the operator hydrators and command
  pipeline are not even in scope; the page runs only its own polling loops, and in token mode
  every store mutator is inert.
- **Its own poll, not a store subscription.** `useDisplaySync` (tournament state) and
  `useBracketDisplaySync` (bracket) re-fetch from the API on a timer; they hydrate React/Zustand state
  but **never call a mutating action and never POST**. The header comments are explicit: *"Writes are
  intentionally NEVER issued — the TV is a read-only mirror."*
- **The match-state read is a poll, too.** The meet display reuses the operations
  `useLiveTracking` hook for its ~5 s `/match-states` poll. That hook hydrates the shared
  `matchStateStore` from Display's *own* fetch, and `MeetDisplayPage` consumes only the read
  projection (`schedule`, `config`, `matches`, `matchStates`, `matchesByStatus`) — it never invokes
  the mutating commands (`updateMatchStatus`, `setMatchScore`, …). So Display reads the
  Operations-owned store as a mirror, but is not a cross-module *writer* of it and does not subscribe
  to Operations as a push channel.

:::info Why this matters
The contract pins the *guarantee* (`displayContract.emits === []`), so the public output can never
become a writer or develop a back-channel into another module without the contract — and its test —
changing first. The transport (the dual poll) is deliberately left as-is; a push-only, single-subscription
transport would be a cleaner future but is out of scope. See
[Operations → Display (Seam D)](/reference/contracts/operations-display).
:::

## The display dependency rule

Display is an **output**, not an engine, so the control plane enforces that it can only be enabled
when there is something to show: **enabling `display` requires ≥1 enabled operational module**
(`meet` or `bracket`). The backend computes `display_dependency_satisfied` and, on a violating
`PATCH …/modules/display`, returns **`409 MODULE_DEPENDENCY_UNMET`**
(`api/workspace_modules.py`; covered by `tests/unit/test_workspace_modules.py`). See
[Enable a module](/how-to/enable-a-module).

## Display configuration & TV presets

What the TV renders is driven by **UI-only fields on `TournamentConfig`** (preserved across `/state`
PUTs in `app/schemas.py`), set from the `display-config` surface — there is no separate display store:

| Config field | Effect |
| --- | --- |
| `tvPreset` | Full color substrate (`displayPresets.ts`). Defaults to `court` (dark); light presets `paper` / `chalk` / `daylight` / `sand` exist for sun-lit screens |
| `tvAccent` | Hex accent for the LIVE border / pill / progress bar (defaults to emerald) |
| `tvDisplayMode` | Court layout: `strip` (default) / `grid` / `list` |
| `tvGridColumns`, `tvCardSize`, `tvShowScores` | Grid density, card size + type scale, and score visibility |

The preset is applied as a `data-tv-preset` attribute that re-themes the subtree via CSS custom
properties, and it is **independent of the operator's app theme** — a venue can run a light TV while
the operator stays on a dark workspace.

:::tip Not hard dark-only anymore
Earlier docs described the display as "intentionally dark-only." That is stale: the default is the
dark `court` preset, but the director can pick a light preset per workspace. The display is
preset-driven, not theme-locked.
:::

## Known architectural debt

- **Thin backend surface.** Display's routes are pure projections of data other modules own —
  `/display/{token}/state` allowlists fields from the shared blob, `…/bracket` re-serves the
  bracket cache. Configuration rides on the shared `TournamentConfig` blob; a workspace-scoped
  display-config persistence is a possible future.
- **Triple independent polls, no push.** Tournament state (~10 s), match state (~5 s), and bracket
  (~10 s) each run on their own timer. This is simple and robust but makes freshness poll-bounded:
  the `matchStateChanged` seam is named without a push transport.
- **`matchStateStore` is shared infra.** The store the meet display hydrates lives in the global
  `src/store/`, not under `modules/operations/`. Display reads it as a mirror; see
  [State management](/explanation/architecture/state-management) for the ownership nuance.

## See also

- [Operations → Display contract (Seam D)](/reference/contracts/operations-display) — the `matchStateChanged` edge Display reacts to
- [Operations module](/reference/modules/operations) — produces `MatchStateDTO`; owns the match-state machine
- [Meet module](/reference/modules/meet) · [Bracket module](/reference/modules/bracket) — the engines Display renders
- [Data flow](/explanation/architecture/data-flow) · [State management](/explanation/architecture/state-management)
- [Signals API](/reference/api/signals) — the other read-only, poll-driven cross-cutting surface
- [ADR 0009 — Universal Match Contract](/explanation/decisions/0009-universal-match-contract)
