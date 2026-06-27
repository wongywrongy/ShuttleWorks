# Display

**Tier-1, user-enableable module.** Display is the read-only public output: the venue TV view of
live matches, the draw, and results for whichever engine is enabled. It requires no auth.

## What it does

- Renders the public `/display` view (e.g. `…/display?tournament_id=<id>`) with courts / schedule /
  standings modes, fullscreen, and theme-aware rendering. It is **intentionally dark-only** —
  the audience is a gym projection — so it has no theme toggle.
- Provides the in-workspace **Preview** (the `tv` surface) and a **Configuration** surface for the
  operator to set up what the display shows.

## What it owns

| Kind | Owned |
| --- | --- |
| **Nav surfaces** | Preview (`tv`) · Configuration (`display-config`) |
| **Backend routes** | **none** — Display is poll-only and writes nothing |
| **`apiClient` methods** | none owned; it *consumes* `getTournamentState`, `getMatchStates`, `getBracket` |
| **Frontend code** | `products/display/` (incl. `PublicDisplayPage.tsx`, the dark-only TV view); the in-shell `display-config` surface is rendered by the workspace shell |

## What it consumes

Display reads three DTOs and reacts to live changes via its **own independent poll** — it never
subscribes to another module's store:

- **`TournamentStateDTO`** — the persisted workspace state (poll of `/state`, ~10 s).
- **`MatchStateDTO`** — live match status (poll of `/match-states`, ~5 s). This is
  **[Seam D: Operations → Display](/contracts/operations-display)**; Display reacts to the
  `matchStateChanged` edge.
- **`BracketTournamentDTO`** — the bracket snapshot, for bracket events.

In cloud-mirror mode the public display reads from **Supabase Realtime** (no auth, sub-second), with
the poll as the fallback.

## The display dependency rule

Display is an **output**, not an engine, so the control plane enforces that it can only be enabled
when there is something to show: **enabling `display` requires an enabled operational module**
(`meet` or `bracket`). Attempting otherwise returns `409 MODULE_DEPENDENCY_UNMET`. See
[Workspace model](/architecture/workspace-model#server-enforced-transition-rules).

## Known architectural debt

- **No dedicated backend module.** Display owns no route — it composes existing read endpoints. A
  workspace-scoped "display config" persistence beyond the shared `/state` blob is a possible
  future; today the configuration rides in the tournament state.
- **Dual independent polls.** Reading `/state` and `/match-states` on separate timers is simple and
  robust but means Display's freshness is poll-bounded rather than event-driven; the seam is named
  (`matchStateChanged`) without a push transport. See
  [the Operations → Display contract](/contracts/operations-display).
