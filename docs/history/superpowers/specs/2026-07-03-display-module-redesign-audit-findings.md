# Display module redesign — audit-and-stop findings

**Status:** discovery complete — STOPPED before implementation, per the spec's mandatory audit-and-stop phase.
**Date:** 2026-07-03
**Companion to:** `2026-07-03-display-module-redesign-design.md` (the discovery spec)
**Read this before writing any implementation code.** Three findings change the shape of the work; one is a hard conflict with an absolute rule.

---

## TL;DR — what changes the plan

1. **The display-layout config already exists** on the workspace tournament `config` (the `tv*` fields), in both the frontend DTO and the backend schema — but **no UI sets it**. So most "customization" work is building the *editor* (Configuration UI + preview), not the board rendering, which largely exists.
2. **The "raw error toast on the public board" is (almost certainly) the in-shell `/tv` preview, not the standalone `/display`.** The global toast host mounts only inside AppShell; `/display` is outside it. The standalone board's only connection surfacing is a Display-owned pill (raw error confined to its tooltip).
3. **Standings already exist as a client-side computation on the board — which directly conflicts with the absolute rule** "do not build a parallel scoring/ranking computation; source from Meet's computed pool standings." And **that Meet source does not exist** (no meet pool-standings computation in `scheduler_core` or the backend). This is a contradiction to resolve *before* implementing standings.

---

## Audit done-conditions

- [x] Error/reconnect/alert code paths traced — ownership + shared-vs-local documented (§1)
- [x] Confirmed home for persisted display-layout config — existing workspace config (§2)
- [x] Reasoned answers to open questions 1–9, flagged for review (§4)
- [x] Conflicts with the absolute rules surfaced explicitly, not resolved (§3)

---

## §1 — Error / reconnect / alert code paths (traced)

### 1a. Operator advisory leaking onto the public board — **CONFIRMED, rule violation**
`products/display/MeetDisplayPage.tsx:330` renders `<AdvisoryBanner readOnly />`. That is the **shared** `components/status/AdvisoryBanner`, also used by the operator Run surface (`products/meet/MatchControlCenterPage.tsx:33`). On the TV, `readOnly` filters to `severity === 'critical'` only (`AdvisoryBanner.tsx:51`) — but a critical operator advisory (e.g. an escalated overrun) still renders on the public board.
- **Ownership:** the *component* is shared with Operations; the *render on the board* is Display-local (MeetDisplayPage owns line 330).
- **Fix shape:** Display-local — stop rendering `AdvisoryBanner` on the board. Do **not** touch the shared component (Operations depends on it).
- **Rule:** violates "Display must never originate/surface an operator alert."

### 1b. RECONNECTING / Offline badge — **Display-owned, well-built, but operator-voiced**
`products/display/publicDisplay/useDisplaySync.ts` polls `getTournamentState(id)` every **10 s** (read-only; never writes), and derives `liveStatus` from the age of the last *successful* sync: `live` < 25 s → `reconnecting` ≥ 25 s → `offline` ≥ 60 s. `LiveStatusPill.tsx` renders it.
- The **raw error string is only in the pill's `title` (tooltip)**, not visible text (`LiveStatusPill.tsx:35`). So it is not "printed" to spectators on the standalone board.
- The graceful degradation (keep last-good data on a flaky poll) is correct and worth preserving.
- What's off: the **labels** ("Reconnecting…", "Offline") are operator/technical, not spectator-calm — this is the redesign target (a "live / delayed" freshness dot). Display-local change.

### 1c. "No response from server" TOAST — **not on the standalone board**
`api/client.ts:261` throws that message; `useDisplaySync` catches it into `syncError` (→ pill tooltip only). The global toast host **`ToastStack` mounts only in `AppShell` (line 235)**, and `/display` is a top-level route **outside** AppShell (`app/App.tsx:111`).
- **Therefore the standalone `/display` never renders the global toast stack** → the raw "No response…" toast cannot appear there.
- It **does** appear in the **in-shell `/tv` preview** (`DisplayProduct` wraps the board inside AppShell, whose `AppShell.tsx:135–155` re-surfaces API errors as sticky toasts), along with the advisory.
- **→ Flag for the spec author:** problem #1's "raw toast on the public board" screenshot was very likely the **preview**, not the venue board. This splits the fix in two:
  - **Board (standalone):** replace the operator-voiced pill with a calm freshness treatment (§4-Q1/Q2/Q3). No toast to remove — there isn't one.
  - **Preview (`/tv`, in-shell):** it inherits AppShell's operator chrome (toasts + advisory). If the concern is the preview, decide whether the preview should suppress operator chrome (it's meant to mirror the public board, so arguably yes) — a *different* change from the board fix.

---

## §2 — Persisted display-layout config home (confirmed)

**The layout config already lives on the workspace-level tournament `config` object**, as `tv*` fields present in **both** layers:
- Frontend DTO `api/dto.ts:70–90`: `tvDisplayMode` (`strip|grid|list`), `tvPreset`, `tvGridColumns` (`1|2|3|4|null`), `tvCardSize` (`auto|compact|comfortable|large`), `tvShowScores`, plus `tvAccent` (read in `MeetDisplayPage`).
- Backend schema `app/schemas.py:94–105`: the same fields (`tvGridColumns` validated `ge=1,le=4`, etc.).

This satisfies the absolute rule (workspace-level, persisted, survives refresh/reconnect). **The natural extension point for the new capabilities is this same `config` object** — add `courtOrder?: number[]`, `hiddenCourts?: number[]`, `tvShowStandings?` / a `standingsMode` enum. It is a JSON config blob on the tournament; the control-plane redesign added fields here without Alembic migrations — same pattern applies. **No new table/column needed.**

**But — the load-bearing gap:** **no UI sets any `tv*` field.** Only `CourtsView` / `MeetDisplayPage` *read* them. `DisplayConfig.tsx` (the `/display-config` Configuration tab) is **Feeds (read-only, follows enabled modules) + the public link only** — no layout controls, no preview. So the rich layout model exists in data + rendering with **no editor**.
- **Implication:** the bulk of "customization" work is **building the Configuration editor + live preview to drive the existing `tv*` fields**, then adding the new fields (order/hide/standings). The rendering side (strip/grid/list, columns, card size, presets, scores) is already implemented on the board — verify it still works, don't rebuild it.
- The board's own comment (`MeetDisplayPage.tsx:263–265`) already codifies intent: *"The picker UI lives in the Public-display settings card (admin TV tab) — never on the standalone /display window."* That picker isn't present in the current code — it's the thing to build (answers Q5).

---

## §3 — Conflicts with the absolute rules (surfaced, NOT resolved)

### CONFLICT A — standings source (**hard; blocks the standings feature**)
Absolute rule: *"If rankings/standings ship, they source from Meet's computed pool standings. Do not build a parallel scoring or ranking computation."*
- **There is no Meet pool-standings computation** in `scheduler_core` or the backend meet services (grep: only Bracket has standings — `services/bracket/standings.py`, Swiss). Meets are school-vs-school dual/tri matches grouped by event — "pool standings" isn't a native meet-engine concept the way it is for Bracket round-robin.
- **The board already contains a parallel client-side computation** — `MeetDisplayPage.tsx:190–206` derives per-group wins/losses from finished matches. That is exactly the "parallel ranking computation" the rule forbids, and it is the *only* standings logic that exists.
- **The contradiction:** the rule points at a Meet source that doesn't exist, while forbidding building one — yet standings can't ship without *some* computation.
- **Options (for the spec author to choose — do not resolve silently):**
  1. Add a proper Meet standings computation in the engine/backend and have the board consume it (violates the letter of "do not build a parallel computation," but is the only way to have a real backend "computed" source).
  2. Bless the existing client-side computation as the source of truth (fast, but it's client-side, duplicated per viewer, and not "Meet's computed" standings).
  3. Drop standings from Meet Display until a Meet standings source exists elsewhere (respects the rule; ships less).
- **Also correct spec problem #5:** it says "no rankings/standings option today" — **inaccurate.** A Standings tab + `StandingsView` exist (via the local computation). The real gap is that it's not configurable and rests on the forbidden parallel computation.

### CONFLICT B — advisory on the public board (**straightforward**)
Covered in §1a. Currently violated by `MeetDisplayPage.tsx:330`; fix is Display-local.

---

## §4 — Reasoned answers to the open questions

Each flags where the answer carries real architectural cost.

**Q1 — Clock times vs. relative lanes.** The board shows wall-clock "Next · 09:30" (`CourtsView.tsx:112,357`); Operations already models relative roles `now | next-later | queued` (`RunSurface.tsx:290`, `RunInspector.tsx:59`). **Answer: relative lanes primary (Now / Next / Later), with a de-emphasized "planned" clock as secondary metadata only on Next/Later — never on the live "Now" court** (it's happening; no time needed). The drift is real (board reads 09:30 at 11:18) because planned slot→clock times don't move when reality slips; Operations solved this with roles. **Architectural cost / flag:** the board must consume Operations-style relative ordering rather than raw `schedule.assignments` slot times. Operations has no public read model — the board polls `getTournamentState` (schedule + match_states). Deriving now/next-later on the board risks the *same "parallel computation" trap as standings* → **prefer a shared pure helper (used by both Operations and Display), not a re-implementation.** Flag this coupling before building.

**Q2 — Freshness threshold.** The board *polls* (10 s), not pushed. Keep the threshold as a **multiple of the poll cadence (~2.5×, ≈25 s)** so one flaky request doesn't flip it — which is already the current design. Don't hard-code a wall-clock independent of the poll interval. Change the *labels/visual* to spectator-calm ("Live" / "Delayed"), keep the timing. Low cost.

**Q3 — Extended outage.** **Three states: Live → Delayed (brief; quiet dot, keep last-good data) → a longer-outage "may be out of date" state (minutes).** After ~3–5 min stale, dim the court tiles and show a calm band like "Reconnecting — results may be out of date," with **no** blame and **no** "server/backend" wording. Reason: the real risk (spec's own) is silently trusting stale data at an empty court; the long state should degrade *confidence* (dim + caveat), not throw an error. Low cost (one more threshold + a calm overlay). Flag: final wording is a voice decision for the product owner.

**Q4 — Side panel vs. rotation for standings.** **The answer changes with court count: persistent side panel at low counts (≤~6), timed rotation at high counts (8+)** — because the court grid is primary and can't spare width on a busy board. Make it config-driven (off / side panel / rotate) with a default keyed to court count. **Blocked on Conflict A** (needs a standings source first). Low-moderate cost once A is resolved.

**Q5 — Where layout is edited.** **The Configuration tab with a live preview is the canonical (and only) editor.** Do **not** make the standalone venue TV editable in place — it's public, chrome-free, and has no auth context on `/display`; an editable unattended TV is a footgun. This matches the Settings IA *and* the board's own comment ("never on the standalone /display window"). The `/tv` in-shell preview is the place to host the live-preview editing experience. Low cost (config home exists; build the UI). **This is the bulk of the work.**

**Q6 — Manual order vs. default.** **Manual order *layers on top of* a live default.** `courtOrder` reorders the courts it names; a court not listed (e.g. a newly-added one) falls back to default position (court-number order) appended after the ordered ones, with a subtle "new" cue — it must **not** silently vanish or land somewhere unchosen (the spec's worry). Default (no manual order) = **court-number order**, *not* Operations-informed reordering: a passive spectator board favors **stable positions** ("court 3 is over there") over cleverness; tiles jumping as matches start/finish is disorienting. Low cost. Flag: confirm "new court appended + cue" vs "inserted by number."

**Q7 — Column count fixed vs. responsive default.** **Both:** a responsive default keyed to **court count + viewport width** (venue TVs vary in aspect — a real axis even though phone/tablet is a non-goal), overridable by the director's `tvGridColumns`. The current code defaults to a static `2` (`MeetDisplayPage.tsx:307`) — naive for a 12-court venue; derive the default (≤3→1–2, 4–6→2–3, 8+→3–4) and keep the existing `md/lg/xl` breakpoint clamping. Low cost.

**Q8 — Bracket's equivalent surface.** Per the spec's own non-goal, this surface is **Meet-courts-only**; the existing read-only Bracket Display (`bracketDisplay/`, SP-B3) is separate and out of scope. **On a hybrid workspace, bracket matches that Operations has scheduled onto courts already appear as court tiles** — Operations unifies meet+bracket onto one court plan (the unified Ops board shows M/B source squares). So the public courts board should mirror that: a bracket match on court 3 is a court-3 tile. **Recommendation:** show a small **M/B source indicator** on tiles (consistent with Operations) so mixed boards read clearly — small, and it answers "how do they coexist." Bracket-only content (tree/standings) stays in the separate Bracket Display. Low cost.

**Q9 — Hidden-court re-enable semantics.** **Hidden stays hidden until manually restored.** The absolute rule says hiding is presentation-only and must never be touched by scheduling — so Operations assigning a match to a hidden court must **not** un-hide it on the public board. Surface the situation only in the **Configuration editor** (operator context): e.g. "Court 4 (hidden) has a live match — show it?" so the director restores it deliberately. Never auto-reappear on the public board. Low cost. Flag: this means a hidden court with a live match is invisible to spectators — that's the intended consequence of "presentation-only," but confirm it's acceptable and that the editor nudge is enough.

---

## §5 — Corrections to the spec's problem statements (for accuracy)

- **Problem #4** ("no way to control court arrangement"): partially inaccurate — `tvDisplayMode` (strip/grid/list) + `tvGridColumns` already exist and render; **court *order* and *hide-court* are the genuinely-missing pieces** (plus the editor UI for everything).
- **Problem #5** ("no rankings option today"): inaccurate — a Standings tab + view exist (via the forbidden client computation). The gap is configurability + the source (Conflict A).
- **Problem #3** ("Configuration is two toggles + a link"): accurate — but the *board* already supports far more than Configuration exposes.

---

## Recommended shape (for the follow-up SP prompt — not yet implemented)

1. **Board hygiene (Display-local, no rule conflicts):** remove `AdvisoryBanner` from the board; recast the freshness pill to calm "Live / Delayed / (long-outage)" states; decide the preview's operator-chrome handling.
2. **Configuration editor + live preview:** build the UI that drives the *existing* `tv*` fields; add `courtOrder` / `hiddenCourts` (+ Q6/Q9 semantics) and column-default logic (Q7).
3. **Relative lanes on the board (Q1):** via a *shared pure helper* with Operations, not a re-implementation.
4. **Standings — BLOCKED on Conflict A.** Do not implement until the source question is answered by the spec author.
