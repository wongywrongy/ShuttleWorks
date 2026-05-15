# Session log — bracket entry + court-time views, audit, merge

**Status:** Complete. Merged + pushed to origin/main as `85b4c00` on 2026-05-15.

**Arc:** finished the #2 GanttTimeline scaffold plan → rewrote scope on user direction → designed and executed the bracket entry + court-time views in 3 phases → pre-merge bug sweep + audit → 4 inline fixes → visual sweep → merge dev2 → push.

---

## What was landed

### Phase A — bracket entry pattern alignment (9 tasks)

Gives the bracket-side the same Setup → Roster → Events entry flow as the meet. Decomposes the legacy `SetupForm` wizard. Backend adds the per-event status machine + 3 new routes; frontend adds 3 new tabs + lifts `useTournamentState` out of MeetShellHooks.

| # | Commit | What |
|---|---|---|
| A.1 | `14cef82` | Backend: `bracket_events.status` enum column + alembic migration + `is_event_started` predicate |
| A.2 | `2890629` | Backend: `BracketPlayerDTO` + `bracketPlayers` field on `TournamentStateDTO` + `restBetweenRounds` + camelCase config hydration with legacy snake_case fallback |
| A.3 | `9072279` | Backend: `TournamentDriver.generate_event(event_id, wipe)` with cross-event locked `previous_assignments`; the load-bearing test is the cross-event no-collision discriminator (proves the lock prevents court×slot overlap across events) |
| A.4 | `5022310` | Backend: 3 new routes (`POST /events/{id}` upsert, `POST /events/{id}/generate`, `DELETE /events/{id}`) + status writes wired through `record_match_result` + BYE auto-walkover result persistence + session.draws/events update after register_draw |
| A.5 | `52d54d4` | Frontend: extend `BRACKET_TAB_IDS` + `AppTab` union + `TournamentPage` URL mapping + `BracketTab` dispatcher (placeholder stubs); LIFT `useTournamentState()` from MeetShellHooks → shared SharedStateHooks; extend `tournamentStore` for `bracketPlayers` + `bracketRosterMigrated` |
| A.6 | `3889bdf` | Frontend: `SetupTab.tsx` hand-rolled sectioned form (Identity + Schedule & Venue) |
| A.7 | `78a3071` | Frontend: `BracketRosterTab.tsx` flat list with search + add/edit/delete + detail panel with derived `Events:` badges |
| A.8 | `06a5053` | Frontend: `EventsTab.tsx` full-width spreadsheet + `ParticipantPicker.tsx` in-grid picker (singles 1-step + doubles 2-step pair-select); per-row Status pill + Action button |
| A.9 | `34f56b3` | Frontend: first-load migration (`reconcileBracketRoster`) + `bracketRosterMigrated` flag + DELETE legacy `SetupForm.tsx` + `setupForm/` directory + re-home `playerSlug` to `lib/` + simplify `DrawView.tsx` |

### Phase B — bracket Live Gantt (4 tasks)

Turn `LiveView` into a `GanttTimeline` consumer with state-ring vocabulary and a right-rail operator panel.

| # | Commit | What |
|---|---|---|
| B.1 | `78a4cd3` | Rewrite `LiveView.tsx` as a `GanttTimeline` consumer (density=standard); placements derived from `bracket_matches`; empty-state CTA |
| B.2 | `212f048` | Chip state-ring vocabulary (scheduled/called/started/finished/late) + event-color fix (lookup discipline from `data.events`, not raw `event_id`) + match tooltip |
| B.3 | `405c831` | `MatchDetailPanel.tsx` right rail (match details + Start / A wins / B wins) + click-select sets `bracketSelectedMatchId` in store + hide single-select in BracketViewHeader on view=live |
| B.4 | (verify only) | tsc/build/lint/vitest end-to-end gate |

### Phase C — bracket Schedule Gantt (3 tasks)

Turn `ScheduleView` into a display-only `GanttTimeline` consumer with an EVENTS filter strip (highlight/dim per event).

| # | Commit | What |
|---|---|---|
| C.1 | `be4c4ba` | Rewrite `ScheduleView.tsx` display-only; placements aggregated from all generated/started events; event-colored chips; hover tooltip; no click handler |
| C.2 | `15bb3a8` | `EventsFilterStrip.tsx` per-event toggle; `uiStore.bracketScheduleEventFilter`; render in `BracketViewHeader` conditional on `view === 'schedule' | 'live'`; dim non-selected events' chips |
| C.3 | (verify only) | tsc/build/lint/vitest end-to-end gate |

### Pre-merge bug sweep (4 audits)

Four parallel audit agents (~120KB of findings, all backed by file:line references):

1. **Name-save bug investigation** (`opus` model) — direct response to the user's report "name is not consistent for saving. I've noticed it randomly changed." Root-caused to a 3-bug compound (race in `forceSaveNow` + uncontrolled `SetupTab` inputs + dashboard ↔ Setup name desync).
2. **Data integrity audit** (`opus`) — 7 Critical: meet-side PUT wipes `bracket_session`, no optimistic concurrency, `generate_event` not atomic, audit history loss on schedule regen, etc.
3. **Security audit** (`opus`) — 1 Critical (default `ENVIRONMENT=local` bypasses auth on public deployment), 4 Important (no body size limits, no rate limiting, stateless solver DoS, auth log token leak).
4. **Audit trail / observability audit** (`opus`) — sync_queue is replication-not-audit; hard tournament delete leaves zero trace; `match_state.py` PUT/DELETE bypasses `commands` audit table.

### 4 inline fixes (before merge)

| Fix | Commit | Surfaced by | What |
|---|---|---|---|
| **FIX-1** | `6a19cb9` | Audit A (user-reported) | (1) `useTournamentState.forceSaveNow` race chain follow-up saves; (2) `SetupTab` controlled inputs with `useEffect`-resync; (3) `create_tournament` seeds full `TournamentConfig` defaults (incl. name + date). 4 new vitest tests for the race; 4 new pytest tests for the seed |
| **FIX-2** | `27fd860` | Audit B | `commit_tournament_state` merges `bracket_session` from prior `tournament.data` instead of overwriting. Bracket assignments survive meet-side PUT /state. Pytest reproduces bug and verifies fix |
| **FIX-3** | `f2ea200` | Visual sweep | A.1 alembic migration declared `down_revision='f7a3c9b2e8d4'` but the actual head was `a8b2d5e9f1c3` — created two heads, migration never applied in deployments. Tests passed via SQLAlchemy `create_all` bypass. Repointed `down_revision` |
| **FIX-4** | `8554f77` | Visual sweep | BracketTab's `!data` short-circuit returned an empty-state CTA on tournaments with no events yet, blocking Setup/Roster/Events tabs from rendering. Scoped the short-circuit to Draw/Schedule/Live only. 6 new vitest tests |

### Audit findings tracking doc

Saved as `docs/superpowers/specs/2026-05-15-pre-merge-audit-findings.md` (621 lines):
- 7 Critical + 20 Important + 10 Minor findings
- Each with severity, file:line, scenario, fix suggestion, effort estimate (S/M/L)
- 5 follow-up plan buckets ready to spin into future brainstorms

| # | Bucket | Findings |
|---|---|---|
| 1 | Audit-log infrastructure | CRIT-2, CRIT-4, IMP-11, IMP-14-18, IMP-20 (single `audit_log` table; route → wrapper) |
| 2 | Transactional repository boundaries | CRIT-3, CRIT-5, CRIT-6, CRIT-7, IMP-7 (`commit=False` flag; route-level transaction) |
| 3 | Concurrency tokens | IMP-1, IMP-5, IMP-9 (Tournament.version; `If-Match` header) |
| 4 | Security hardening | CRIT-1, IMP-2, IMP-3, IMP-4, IMP-10, IMP-13, IMP-19 (env default; body size; rate limit; log redaction) |
| 5 | DB integrity small fixes | IMP-6, IMP-8, IMP-12 (SQLite `PRAGMA foreign_keys=ON`; FK cascades; length caps) |

---

## Final verify state (at merge commit `85b4c00`)

| Gate | Result |
|---|---|
| Frontend `tsc -b` | exit 0 |
| Frontend `vitest run` | **106/106 in 14 files** |
| Frontend `npm run build:scheduler` | clean |
| Frontend `npm run lint:scheduler` | zero errors in new files (pre-existing in others) |
| Backend bracket+tournaments pytest | **138/138 in 8 files** |
| End-to-end browser sweep | name save round-trip works; all 6 bracket tabs render; meet side unregressed |

Hard test gates that did **not** run (out of scope, documented):
- `make test-e2e` (Playwright) — pre-existing stale, every spec `goto('/')`s the old app shell.
- Visual sweep on a tournament with a generated draw — the test tournament was fresh; the chip-rendering paths are covered by Phase A/B/C vitest unit tests.

---

## Merge

| Action | Result |
|---|---|
| Branch | `dev2` (192 commits ahead of `main` at session start; +5 commits during audit fixes; +1 doc commit) |
| Merge | `git merge --no-ff dev2` → merge commit `85b4c00` on `main` |
| Tests on merged main | all gates re-run green |
| Branch cleanup | `git branch -D dev2` (force, because `--no-ff` makes `-d` refuse) |
| Push | `git push origin main` → `origin/main` now at `85b4c00` |

Pre-session HEAD on `main` was `345f87d` (the prior `dev2` PR merge). This session's push covers everything from `345f87d..85b4c00`.

---

## Open follow-ups (deferred, NOT in this merge)

### Bracket-specific UX polish

From the per-task code-quality reviews — all flagged as Important or Minor by reviewers, all deferred per user direction:

- **Picker pre-check existing participants on re-open** (A.8 code-quality I-2) — re-opening the participant picker on an event with existing participants shows zero checkboxes selected; requires event → participant_id DTO plumbing.
- **Inline editing on existing rows in EventsTab** — plan + spec disagreed; verbatim plan code was read-only on existing rows; spec said inline editable.
- **`window.confirm` → custom Dialog primitive** in EventsTab re-generate confirmation.
- **Call + Postpone actions for MatchDetailPanel** — `bracketClient.matchAction` only supports `start | finish | reset` today; Call + Postpone would need new backend routes.
- **Empty-state buttons to jump to Events tab** in LiveView/ScheduleView — needs a tab-switch callback prop.
- **EventsTab 3-component split** for test-without-provider consistency with A.7.
- **`useDragOrchestrator` extraction in DragGantt** (file is 611 lines vs target 250 — plan author miscount).
- **Scaffold props `blockTransition?` + `rowClassName?(courtId)`** to restore the two deliberately-accepted regressions from #2 (DragGantt re-layout glide; closed-court whole-row dim).
- **`useVisibleWindow` shared hook** across all 3 GanttTimeline adapters.

### Systemic (the 5 audit buckets above)

Audit-log infrastructure, transactional boundaries, concurrency tokens, security hardening, DB integrity. Each becomes its own brainstorm → spec → plan when prioritized.

---

## Repo state at session-end

- **Branch:** `main` (clean, up-to-date with origin)
- **Local-only branches:** `engine-only`, `feat/monorepo-consolidation`, `restore/pre-design-unification`, `tournament-prototype` (none of this session's work; orthogonal)
- **Working tree:** stash restored — `.gitignore` + `package-lock.json` carry pre-session churn; `products/scheduler/uv.lock` is auxiliary (untracked, from `uv pip` invocations during sub-agent work). None of these need attention this session.
- **Tag candidate:** worth tagging `85b4c00` as `bracket-entry-and-courttime-views-shipped` if you want a recoverable reference point before tackling the audit-follow-up buckets.

---

## How to resume after session clear

1. **Audit doc** is the entrypoint: `docs/superpowers/specs/2026-05-15-pre-merge-audit-findings.md`. Pick a bucket → brainstorm → spec → plan.
2. **Bracket spec + plan** for context on what shipped: `docs/superpowers/specs/2026-05-14-bracket-entry-and-courttime-views-design.md` + `docs/superpowers/plans/2026-05-14-bracket-entry-and-courttime-views.md`.
3. **This session log** at `docs/superpowers/progress/2026-05-15-bracket-entry-and-audit-session.md` — what you're reading now.
4. **GanttTimeline scaffold (#2)** that this session's work builds on: `docs/superpowers/plans/2026-05-14-gantt-timeline-scaffold.md` + the strategic plan `docs/superpowers/plans/2026-05-13-gantt-timeline-unification.md`.
5. `git log --oneline 345f87d..85b4c00` to see the full commit arc this session shipped.
