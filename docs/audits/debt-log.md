# Debt Log

The **visible backlog** the code-health practice feeds (`CODE_HEALTH.md` #6):
when a change spots debt outside its own scope, it lands here instead of being
silently fixed (scope creep) or silently dropped. Each entry: **what · where ·
why it matters · rough size**. Add rows as debt is found, move rows to
**Closed** as it is cleared, and keep it honest so "the log growing faster than
it shrinks" stays a real signal — that is the trigger to run another bounded
program, per `CODE_HEALTH.md`.

**Keep entries short.** An entry earns its length only when the *decision* is
hard to state; the narration of how it was found belongs in the commit or the
audit doc it came from. A log nobody reads is the same as no log.

**Reconciled 2026-08-11.** Every open entry was re-checked against the code:
16 were already fixed and had never been closed, 1 described a file that no
longer exists, and 5 were fixed in that pass (`83e3b96`, `512996a`, `330f069`).
The rest were tightened and grouped. Before: 1,329 lines. After: this.

---

## Open — needs an owner decision

These are decisions to make, then execute. Nothing here is blocked on effort.

| # | What | The decision owed | Size |
| --- | --- | --- | --- |
| D1 | **`resolveClosedWindows` swallows every bracket-occupancy failure** — see the full entry below; it is the one open item with a live correctness cost. | Fail the solve, warn the operator, or distinguish unknown-from-none at the seam | S + a product call |
| D2 | **`matchStateStore` ownership** (F-ARCH-3) — stays in shared `store/` or moves to Operations. Moving it *creates* new `no-cross-product` violations (Meet + Bracket also consume it). Two reasonable options, no code-driven winner. `01-findings.md §F-ARCH-3`, ADR 0011. | Where it lives | Decision, then S |
| D3 | **The `no-cross-product` warns — 14 of them, in three clusters** (measured 2026-08-11; the log's older "the last 2" claim was stale). *ops→bracket*: `OpsDetailRail→MatchDetailPanel`, `OperationsProduct→BracketScheduleModal`, `opsBlock→bracketLabels`. *workspace→display*: `displayConfig/DisplayPreview` → `publicDisplay/{CourtsView,displayPresets,courtLayout,tvSizing}` and `DisplayLayoutEditor→courtLayout` — the config board reuses the public board's real renderer for visual fidelity. *workspace→settings*: `WorkspaceShellSurface` → the four settings tabs it hosts, which is an aggregator edge. Same question for all three: accept them as legitimate consumer/aggregator edges, or relocate the shared pieces to a neutral home (the `SourceChip` precedent). Clearing them is the blocker to ratcheting that rule warn→**error**. | Accept or relocate, per cluster | Decision, then S–M |
| D4 | **The Run nav item is two different surfaces.** Meet-only workspaces get the legacy meet Live page (Director/Disruption/Re-optimize/XLSX, score entry); hybrid workspaces get the SP-G1b unified board (queue/inspector/zoom, no meet tools). Same label, disjoint affordances — an operator moving between workspaces re-learns the page. The F-ARCH-3 neighbourhood. | Converge or keep two | L (decision first) |
| D5 | **`seen_version` is optional on `POST /bracket/results`** — declared `Optional[int]`, guarded only `if not None`, so any caller that omits it is silently unprotected: a fail-*open* optimistic-concurrency check. SP-CLOUD-4 closed the identical defect on `PUT …/state` by making `If-Match` mandatory (412 when absent). The frontend already sends the token. | Tighten to mandatory (a public API shape change) or document the fail-open | S |
| D6 | **Two conflict dialects for one concept.** `PUT …/match-states/{id}` answers **412** on a stale version; `PUT …/state` answers **409** with the current state in the body. Both are defensible alone — 412 is strict HTTP, 409-with-state lets a client reconcile in one round trip — but a codebase should not teach two answers to one question. Converging means changing a shipped, tested path with a working client counterpart (`MatchVersionMismatch`). | Which dialect wins, and accept the break | M |
| D7 | **The entrant-account CASCADE pre-decides E2's erasure question.** `submissions.account_id` and `entry_players.account_id` both FK `entrant_accounts` with `ondelete=CASCADE` (migration `s3d8f2b5c0e1`), so deleting one entrant account would erase every submission and entry it ever made — including entries a director has confirmed. No delete path exists yet, but E2 builds withdraw-and-erase, and the schema has already answered its hardest question in the most destructive direction. Alternatives: `ON DELETE SET NULL` + tombstone; soft-delete the account; PII-scrub while keeping rows. **A ruling is owed BEFORE E2.** | Entrant erasure right vs organiser's records | S now, M after E2 ships against the cascade |
| D8 | **The Meet mapping targets a rank *slot*, not a division.** `rankCounts: {MS: 3}` declares MS1/MS2/MS3 with one player per school per singles slot (`useRankValidation.ts`), but Seam A maps every entrant of entry event "MS1" onto that same slot in the same seam-created group — so the roster's normalization stripped `ranks[]` from all but the first committed player on the next autosave. Division-level mapping or seam-side slot assignment; not a patch. Spec §9.3 owns the redesign. | Which mapping | M |
| D9 | **8 of the 10 e2e spec files are stale and fail against the current UI.** `00-sanity`, `02`–`08` and `99-baseline-screenshots` were last touched 2026-05-11 and predate the Hub/workspace redesign: they assert `toHaveTitle(/schedul\|tournament/i)` and `getByTestId('tab-setup')` (the vestigial TabBar). `make test-e2e` reports 19 failures that are all rot, so a real regression would be indistinguishable from the noise. Only `interaction-smoke.spec.ts` runs in CI. | Repair against the sidebar nav, or delete and let interaction-smoke be the e2e surface | M |
| D10 | **`comingSoon` keeps retired vocabulary alive in the contract.** `ModuleCountsDTO.comingSoon` and the `coming_soon` module status still exist in the backend schema, `dto.ts`, `dto.generated.ts` and ~8 fixtures, but nothing renders it — `modulesFromDto` maps the value to `available`. Dead weight that invites someone to resurface it; removing it touches the DTO contract on both sides. | A contract call | S |
| D11 | **Bracket `POST /events/{id}/generate` ignores the session solver config** — builds `TournamentDriver` with no `solver_options` (`brackets.py:2245`), silently dropping the session's time_limit/deterministic/seed. Fixing it changes solver inputs on a shipped path. | Whether generate should honour the session budget | S |
| D12 | **Self-hosted first-run provisioning is throttled at four operator accounts per hour per IP.** `registration_max_per_ip` is 5 and the lock fires at `failures - max >= 0`, so the fifth registration succeeds and sets a 300s lock with doubling backoff — an admin standing up an instance for six clubs from one office gets four accounts, then a five-minute wall, then ten. The throttle is doing its job (SEC-03 counts successful registrations deliberately) and the budget is configurable; the gap is that there is *no* provisioning path other than public self-service — no admin create-user route, no CLI, and invite-accept needs an already-registered user. The demo works around it with `REGISTRATION_MAX_PER_IP=20`. | An owner-authenticated "create operator" route, or document the knob in the self-host runbook | S |
| D13 | **`test_list_recent_is_bounded_and_stably_ordered` is flaky in a REQUIRED CI gate** — ~1 in 8 runs on Windows. `solve_jobs.list_recent` orders by `created_at DESC, id DESC` (the repo idiom, correctly applied) but `SolveJob.id` is a random UUID, so the tiebreaker is *deterministic* without being *insertion-ordered*; when two `created_at` values land in the same coarse Windows tick the winner is whichever UUID sorts higher. The query is right and the assertion claims something it never promised. | Assert set membership + a bound (XS, weakens the ordering claim to nothing), or give the table a monotonic tiebreaker (S + a migration) | XS–S |
| D14 | **Should a scheduled — not per-PR — e2e job exist?** `products/scheduler/e2e` is in no eslint project (only `lint:scheduler`/`lint:entrant` exist, and neither covers it), and CI runs only `interaction-smoke.spec.ts`. That was tolerable while e2e held one spec; it is less so now that `10-entrant-r11-evidence.spec.ts` is the sole successor to three dropped R11 viewport claims — so R11 went from "held by the design system and by review" to "a control that exists and can be run", not to "enforced", in a file that is not even type-linted. Two separable fixes: an eslint project + `lint:e2e` (XS), and the CI job (a gate-policy call CLAUDE.md says not to make casually). | The gate policy | XS + M |
| D15 | **`--status-started` (sky) reads as interactive next to the azure accent, and `--module-meet` is the accent hex.** The "one accent" rule is literally satisfied and perceptually broken: a *scheduled* chip and a clickable control are both blue on the Ops board. A token-mapping change, but it moves colours on a shipped operational surface. | Belongs with the palette direction decision | S |
| D16 | **The `ready` / `live` / `complete` Overview panels are minimal.** SP-UI-1 shipped `setup` fully and gave the other three honest versions built only from data that already exists (`signals.matches`, `signals.nextUp`) — structure over faked richness. They want real content: live court occupancy, per-event progress, a results/export summary. | What each phase owes | M |

### D1, in full — the double-booking swallow

> **2026-08-11 · A dropped bracket-occupancy fetch tells the meet solver the bracket occupies
> no courts, and the schedule it returns can double-book them.**
> `useSchedule.resolveClosedWindows`
> (`products/scheduler/frontend/src/hooks/useSchedule.ts:83`) catches *every* failure of
> `apiClient.getBracket` and returns `[]`. The comment defending it is reasonable read on its
> own — "a broken bracket poll must never block a meet solve" — and it is correct about the
> case it was written for: a meet-only workspace answers 404, and 404 really does mean no
> bracket occupancy. It is wrong about every other failure. A timeout, a 500, a dropped
> connection and an expired session all land in the same `catch` and produce the same `[]`,
> and `[]` is not "unknown" — it is the positive claim *the bracket is using no courts at no
> time*. `closedCourtWindows` is the only channel Meet has for bracket occupancy
> (`lib/bracketOccupancy.ts`), so the engine takes that claim at face value and is free to
> place meet matches on courts the bracket is already running on. All three meet solve entry
> points route through it (`useSchedule.ts:233` generate, `:251` warm-restart, `:295` repair),
> and the same swallow is hand-written a second time at `useLiveOperations.ts:243`, where the
> stakes are highest: that is the live-day re-solve, running while both engines are actually
> on court. Nothing in the product distinguishes the two schedules afterwards — a double-booked
> court looks like a normal solve until two matches are called to it. Three honest options, and
> picking between them is the reason this was left rather than fixed: **fail the solve** when
> occupancy cannot be read on a workspace that has a bracket (safest, and turns a degraded
> network into a blocked solve — exactly what the comment was trying to avoid); **solve and warn
> the operator** that the schedule was computed without bracket occupancy (keeps the solve
> unblocked, moves the judgement to the person who can see both boards); or **distinguish "no
> occupancy" from "unknown occupancy"** at the seam — let `resolveClosedWindows` return `null`
> for unknown and `[]` only for a genuine 404, and let each of the four call sites decide. The
> third is the enabling change for either of the first two and is the smallest real fix; on its
> own it changes nothing. Any of them changes what a solve does when the network is bad, which
> makes this a design call rather than cleanup. Size S (the `null`/`[]` distinction + threading
> it through four call sites) + a product decision on the response. *(Found in the closing
> review of the demo session.)*

---

## Open — genuinely large

| # | What | Size |
| --- | --- | --- |
| L1 | **GDPR/export/delete tooling is a pre-launch requirement** — account deletion, data export, and a story for the PII carried on workspaces. Explicitly deferred by the SP-CLOUD-2 prompt. | L |
| L2 | **`upsert_data`'s compare-and-swap is identity-map-scoped, so it does not detect a cross-session concurrent write.** `get_by_id` is `session.get`, which answers from the identity map, and `SessionLocal` sets `expire_on_commit=False` (`database/session.py:97`) — so the re-read the CAS performs "immediately before the mutation" returns *the version this session last saw*, not the row's. Two writers on one session are caught; two writers on different sessions (what real concurrency looks like) are not, and the stale write is accepted. The HTTP `PUT /state` path is unaffected in practice (fresh session, one read); the exposure is any in-request code that reads, works, then writes with `expected_version` — the shape of the Entries commit seam, which is why that seam expires its own snapshot instead of trusting the guard. Characterized in `tests/test_concurrent_state_writes.py` with a negative control. Fix: expire inside `upsert_data`, or move the compare into `UPDATE … WHERE state_version = :seen` (the `services/members.py` correlated-subquery pattern). Shared load-bearing write path. | M |
| L3 | **`DESIGN.md` still enforces the retired brutalist direction.** §1.2/§1.3/§1.8.b/§1.9/§1.10/§1.11 describe Signal-Orange, 90° corners and hard-offset-only shadows, none of which ship. The 2026-08-06 review added a superseded banner and flipped §10 precedence to `tokens.css` → `DESIGN_COLOR.md` → `DESIGN.md`, but left the rule bodies intact: they are load-bearing for agents and a blind rewrite risks loosening rules that are still correct. The follow-up is restating each rule against the current token ladder. | M |
| L4 | **50 raw `<input>` elements remain outside `TextField`** across ~24 files, each re-deriving its own border/radius/focus treatment. Not broken (they mostly use `border-border` correctly) — drift-prevention, and a wide mechanical sweep best done as its own slice. | M |
| L5 | **Viewer read-only vocabulary — the surfaces that still render enabled and then no-op.** The *correctness* half is closed: no viewer write leaves the browser (`useProposals`, `api/bracketClient` refuse client-side; `platform/domain/permissions.ts` fails closed on an unknown role), and the backend already required `operator` on all of it. What remains is vocabulary — a control should say "you can't" before it is pressed, not after. Still ungated: **Meet roster** (`PlayerDetailPanel`, `positionGrid/*`); **Meet matches** (`MatchesSpreadsheet` row event input, `PlayerCellEditor`, `RegenerateMenu`); **Bracket** (`BracketDrawsTab`, `BracketDataSection`, `BracketRosterTab`, `BracketPlayerFields`, `BracketEngineSection`, `DrawView`, `ParticipantPicker`, `BracketScoreEntry`, `BracketViewHeader`); **Workspace/admin** (`SharingTab`, `SyncBackupsTab`, `ModulesSettingsTab`, `VenueScheduleTab`, `displayConfig/`). Each is S and mechanical: fold `useCanEdit()` into the file's existing `locked`/`disabled` expression (copy `MatchDetailsPanel`), or self-gate an always-mutating control (copy `ConfirmDeleteButton` / `WinnerButton`). **The unit suite cannot prove this** — it mocks `useBracketApi` and the store seams, which is exactly how an ungated bracket write path survived a green 1,100-test suite; the real check is the viewer flow in `e2e/tests/interaction-smoke.spec.ts`, which asserts zero `POST/PUT/PATCH/DELETE` leave the browser as a viewer. | M (sum of many S) |
| L6 | **The documented remote worker is not deployed.** `docs/how-to/add-a-worker.md` describes `neo` as a remote compute host and the SP-CLOUD-3 env matrix has a `neo (worker)` column, but neo runs no ShuttleWorks container — all solve work is carried by cayde's `EMBEDDED_WORKER=true`. A runbook describing a host that isn't running the thing is how an operator loses an hour during an event. | M (deploy) / S (doc) |

---

## Open — small and unscheduled

Mechanical, each independently shippable. Grouped only so the list stays scannable.

**Backend / API**
- **`GET /tournaments` loads all rows and filters in Python** against the caller's memberships (`api/tournaments.py:309`). Fine at solo scale, wrong shape for multi-tenant cloud. Move the filter into SQL — `ix_tournament_members_user` exists. S.
- **`GET /tournaments/{id}/state` recomputes meet standings per call** (`_meet_standings_for`: catalog lookup + an extra `match_states` read + `compute_meet_standings` over all matches) and the debounced 500 ms PUT rewrites a blob whose `scheduleHistory` grows unboundedly (each PUT also snapshots a backup row). Not today's lag source; both scale with tournament size. Memo standings on a results version; cap/compact `scheduleHistory`. S–M.
- **Bracket writes advance `state_version` without returning it.** `api/brackets.py` bumps the concurrency token through `upsert_data` but returns bracket payloads with no `ETag`, so a client that acts on the bracket and then saves meet state gets one spurious 409. It self-heals (the recovery re-reads and re-syncs) but is a visible hiccup. Threading a token through ~21 call sites was judged disproportionate; the alternative is a response hook stamping the ETag centrally for any route under `/tournaments/{id}/`. M.
- **A worker that loses its lease keeps solving to completion.** The heartbeat ownership guard stops a ghost from *extending* a lease and `_record_outcome` discards its result, but nothing tells the ghost's child to stop — it burns a core, then throws the answer away. `solve_runner`'s `heartbeat` param is `Callable[[], None]`, so the signal has nowhere to go: widen that type, or fold the check into `cancel_check` (already kills the child, already called on the same 2s tick). Cost of not fixing: one wasted solve per lease loss, bounded and rare. S.
- **Nothing enforces "a streaming generator must not touch the repository".** The repo-closing middleware runs when `call_next` returns, which for a `StreamingResponse` is *before* the body streams — the session returns to the pool while the generator is still yielding. The one live streaming route is safe only because `_hydrate_session` materializes everything first; a future route that lazy-loads inside its generator would fail in production under a shape unit tests don't reproduce. Verified safe 2026-08-04 — the gap is the unguarded invariant. Candidate check: assert no `StreamingResponse` route both depends on `get_repository` and references it after the first yield. S.
- **`/health/metrics` is a full-table aggregate** — `GROUP BY` over every `solve_jobs` row including terminal ones retained for `JOB_RETENTION_DAYS` (30). The obvious narrowing is **wrong**: `succeeded`/`failed` are part of the published response. The right fix is an index on `solve_jobs.status` if volumes ever make the scrape visible; not doing it now costs a migration for an unmeasurable scan. S.

**Entrant tier**
- **`POST /e/api/quote/{slug}` echoes the whole posted body into its 303 `Location`, so entrant PII lands in a URL.** `_echo_redirect` (`api/entries_json.py`) builds `f"/e/{slug}?{urlencode(echoed)}"` from `form.multi_items()` minus `_ECHO_DROP`, so `playerName`, `club`, `birthYear` and free-text `remarks` cross into the address bar — nginx access logs, browser history, any intermediary. Junior events collect a birth year, so this is personal data of minors in logs never scoped to hold it. The entrant tier cannot fix it alone (a native form posts every field; only events are priced; the typing must survive the round trip). Shape of the fix: answer **307** to `/e/{slug}` so method and body are preserved, with only `totalCents`/`refusalCode`/`refusalSubjects` in the query, plus an `action` on `routes/entry.tsx` reading the re-posted body into the existing `FormEcho` (holds no credential, makes no upstream call — R8-D untouched). Second consequence of the same line: the target is always the bare `/e/{slug}`, so a recalculation drops the `/signed-in` variant. The in-tier half is pinned by `entry.quote.test.ts`'s "recalculates by POST". S (backend) + XS (entrant).
- **A THROTTLED entrant sign-in still paints raw JSON.** The wrong-credentials branch is fixed (`d3684ef`); the throttle branch is not — both `throttle_check` hits raise `_throttled(...)`, which is `api/auth.py`'s 429 shape verbatim, and a native `<form method=post>` is a navigation, so that object is the whole document. Reachable ordinarily: the same address typed wrong a few times, or one venue's phones behind one NAT sharing the `eip:` bucket. **It cannot be folded into `/e/login/failed`** — "check the address and password" said to someone whose password is right costs them the entry. Needs its own path (`/e/login/wait`) carrying the wait, which is the only number safe to show. **Whatever renders it must not become an enumeration oracle**: the throttle is keyed on the address as well as the IP, so distinguishing "this address is throttled" from "wrong password" would tell a caller which addresses have accounts. One copy for both keys, no mention of which bucket tripped. S.
- **The entrant tier derives its own public origin from the client's `Host` header**, so `/e/sitemap.xml` and `/e/robots.txt` are Host-header injectable: `routes/{sitemap,robots}.tsx` build absolute URLs from `new URL(request.url).origin`, and `frontend/nginx.conf` is the only `server` block on `listen 8080` — the implicit default server — so `server_name localhost` constrains nothing. Verified: `curl -H 'Host: evil.example' /e/sitemap.xml` emits `<loc>http://evil.example/…</loc>`. **Bounded, not harmless**: nginx rejects anything outside the host grammar, so the injected value can only be an authority, and nothing caches it — the poisoned document goes back to whoever forged the header. The durable fix is the one the backend already has: **be told** the origin (`PUBLIC_APP_ORIGIN`, already set on `api` in the self-host stack) instead of deriving it. Not done here because it is worse half-applied — an env fallback to the request origin is a defence absent in every stack that forgets the variable, and a *wrong* value is a silently wrong sitemap in production. A `server_name` allowlist cannot substitute: `nginx.conf` is `COPY`'d into the image while the hostname arrives at compose time, so the list would need templating across all six stacks. S (entrant + two compose files) or M (with the templating).
- **The CSRF `compare_digest` comparison is duplicated** — `api/entries_json.py`'s `require_form_csrf` and `app/form_csrf.py::form_csrf_proves` each independently encode-and-compare a presented token against the same two cookie-derived candidates. (A third copy in `api/entries_public.py` is gone.) Both are correct today, but the same non-ASCII `TypeError` defect — an accented character turning a 403 into a 500 — had to be fixed in each copy separately, in different passes. One shared helper the two call sites delegate to. S.
- **The receipt page is unverified.** `app/routes/receipt.tsx` renders for ANY well-formed submission UUID, because node holds no entrant credential and must not grow one (spec §3). The 404 shape is uniform across entrant B, entrant A and a stranger, so there is no enumeration oracle and nothing of A's is disclosed — but a receipt page is not evidence of anything: a stranger handed `/e/{slug}/receipt/{any-uuid}?totalCents=99999` gets it rendered as the organiser's branded receipt. Existence and ownership confirmation belong to the browser-side "my entries" fetch, which holds the cookie this route deliberately does not. Name Phase 7 as the consumer that closes it. S.
- **`find_for_account` has zero production callers.** `services/submissions.py:175` was the mitigation for a real defect (a submission read scoped by `(tournament_id, key)` alone returned another entrant's receipt on an id collision), but nothing routes a submission read through it — `session.get(Submission, id)` still compiles, and nothing structural stops a future call site, the way the OpenAPI-derived tenancy test enforces `require_tournament_access`. Exercised only by its own unit test. Phase 7's "my entries" fetch is the named consumer. S.

**Frontend**
- **`useBracketDisplaySync` still cannot see a revoked token.** The poll now stops on a terminal error (`83e3b96`), but `apiClient.getDisplayBracket` passes `validateStatus: s === 200 || s === 404` and returns `null` on 404 — the deliberate "no draw configured yet" contract — so a revoked capability never surfaces as an error at all. (It is unreachable today anyway: `useDisplayKind` `.catch(() => setKind('meet'))`, so a revoked token renders the *meet* board and this hook never mounts.) Splitting the two meanings — a distinct code for a revoked capability, or a `getDisplaySummary` failure that surfaces instead of defaulting — is a display-contract change. S.
- **`matchStateStore.liveState` is fully dead.** Nothing reads it; `buildLiveState` rebuilds it on every `setMatchStates`/`setMatchState`/`applyOptimisticStatus`, and `setLastSynced` rebuilds it every 5s in two hooks for a value nobody consumes. Delete `liveState`/`buildLiveState`/`setLastSynced`/the `LiveScheduleState.currentTime` DTO field together; the `useLiveTracking.clock.test.tsx` perf guard is written against `liveState` and needs re-pointing at the property that still matters (no 1s write cadence). S.
- **`RunSurface`'s inspector column is not on `DetailDock`** (`RunSurface.tsx` ~382–436) — the last rail still hand-rolled instead of the shared host every other detail pane uses. It does NOT exhibit the push-on-click bug (it is persistent, so width never changes on selection), which is why it was deferred; aligning it would unify the primitive and give it the narrow-viewport overlay fallback. S.
- **`DetailDock`'s overlay fallback keeps docked semantics.** In the narrow fallback the pane COVERS the table yet stays `role="complementary"` with no outside-click dismissal (children are hardcoded `variant="docked"`). Right fix: the dock exposes its mode to children so overlay mode re-acquires the dialog role + outside-mousedown close. M.
- **The Venue & schedule lock signal is meet-only.** The LockRibbon and its confirm-unlock guard read the meet store flag; a bracket-only lock (committed bracket schedule, draw in play) shows nothing, because bracket lock state needs data not loaded at workspace level. Backstop today: the server 409s (`CONFIG_LOCKED`/`DRAW_STARTED`). M.
- **Hard-lock read-only is visual, not semantic.** `LockedFieldset`'s `sw-readonly` restores full contrast but controls stay natively `disabled` — not keyboard-focusable, values not selectable. True per-control `readOnly`/`aria-readonly` means touching Toggle/Select/Slider individually. M.
- **`OverflowMenu` disabled items still close the menu.** Activation is blocked in the click handler, but Headless UI closes on select regardless, so clicking a disabled item dismisses the menu while doing nothing — it reads as a dead control. Needs an `onClose` guard or a non-`MenuItem` render for disabled entries. S.
- **`Eyebrow` uppercases its text in JS as well as in CSS**, so `<Eyebrow>Details</Eyebrow>` puts `DETAILS` in the DOM while `<span className={EYEBROW_CLASS}>` puts `Details`. Visually identical; screen readers may spell out an all-caps string, and the component and the class constant disagree about DOM text. Six call sites; removing it changes DOM text tests may query. S.
- **The shell identity bar can disagree with the Overview about a workspace's name** — a `ready` workspace whose Overview header read "Interaction smoke" showed `Untitled` in the shell top bar. The two read different sources (`WorkspaceIdentity` vs the fetched summary) and one lags. Belongs to the identity seam. S.
- **Overview rail has no "last backup" row.** Specified, then dropped: it needs a second list fetch on every workspace landing to render a glance-only fact, and the Overview otherwise makes exactly one extra call. Add it when the summary payload or a cheap head endpoint can carry `lastBackupAt`. S.
- **`minContentWidth={760}` on `BracketDrawsTab` is a hand-summed magic number** (fixed-cell total with Format collapsed). If `DRAW_COLUMNS` changes width it silently drifts; derive it or pin it with a test. S.
- **Gantt header time-labels may bleed** onto the following label-less column since the `overflow-visible whitespace-nowrap` clipping fix; at extreme zoom-out two labels could touch. Cosmetic. S.
- **Standings and columns use different court-count bases.** `MeetDisplayPage` drives `defaultColumns()` from the *visible* court count but `standingsPlacement()` from the *raw* `config.courtCount`, so hiding courts down to ≤6 shrinks the grid without flipping a large venue's standings from `rotate` to `side`. Both are operator-overridable defaults; pick one base if unified behaviour is wanted. S.
- **Design-polish residuals** (2026-07-09 design-skills audit, all S unless noted): the same advisory renders as both the top banner *and* an error toast (two Review buttons) and is error-red for what is an operational nudge — render once, demote to amber (S–M); the repair strip's "0 min finish, 0 moves" has no unit or direction and `Apply` with 0 moves invites "apply what?"; Run's OUTLINE legend uses orange for both Resting and Late and blue for both Selected and Impacted ("colour is status" violation); the Display preview shows shell `COMPLETE` beside board `LIVE` (freshness) — spectator-calm vocabulary is deliberate on the TV but misreads in the operator preview; Generate/Re-plan/Re-optimize/Apply are all visible with no destructiveness hierarchy (only Generate carries the live-day guard) and ties into D4 (M).
- **Cosmetic shortlist**, from the same passes: a `(moved)` tag on an in-progress match that was never moved (trigger looks like command-path court/slot writes differing from the schedule assignment); Score "Save" disabled-state styling reads as enabled; `Solutions: –`/`Score: 50`/`Time: 0ms` solver jargon in the Plan header; unlabeled green `Idle` health chip; unlabeled red check-in dots on Plan rows; standings `0L` in red; `COURT 1 —` dangling dash and duplicate fullscreen affordances; 12h clock on Display vs 24h axis on Run; hybrid board strikethrough reads "cancelled" for done; the DE round selector R1–R6 doesn't say which bracket it scopes; bracket draw cards leak the internal event id (`ev-de`) as a label chip; a Radix Select controlled→uncontrolled warning on Hub/Display config; `DetailDock` close-retention shows a deleted entity's pane for ≤450 ms (accepted); `previewByCourt` computes lanes for busy courts that don't consume them; `actualCourtId ?? courtId` inlined 3× in `MeetDisplayPage`; `Optional[list[int]]` vs `typing.List` style in `schemas.py`; standings rotation dwell 15s and side-panel `w-96` magic numbers.
- **Cleanup shortlist** from the 2026-07-16 review, each S: a shared date-format helper (`fmtDate` is the ~7th private copy); LockRibbon's inline SVG → phosphor `LockSimple`; a shared `prefersReducedMotion()` (2 copies); `DetailPanel.width` is a dead API; dead `::-webkit-scrollbar` rules on Chromium ≥121, and thin scrollbars silently applying to the TV display; `useContainerWidth` setState per resize (wants a threshold/hysteresis + an initial sync measurement); the ops board lacks column-priority degradation when the Courts dock takes width.

**Docs & measurement**
- **`dto.generated.ts` freshness is on the honour system.** Nothing gates it, and it had silently drifted since before SP-CLOUD-2 Phase 3 (missing every `/auth/*` and `/display/{token}/*` route) until regenerated in `bb29b21`. A CI step that regenerates and diffs would catch it. S.
- **Schema-vs-model drift is unchecked, and we know it exists.** Removing `sync_queue` surfaced that migration `e2a5f3b8c1d6` created `ix_sync_queue_created_attempts` while the model never declared it — ORM metadata and real schema had silently diverged, caught only because writing a downgrade forced reproducing the true schema. No reason to assume it was the only table. Proposed: on a scratch DB run `alembic upgrade head`, then diff against `Base.metadata` (or autogenerate and assert the migration is empty). Cheap, dual-dialect. S.
- **`docs:freshness` tracked globs are too coarse.** Four areas reported BEHIND after the mirror removal purely because an unrelated symbol left `models.py` and a comment changed in `useBracket.ts`; none of those pages mentioned the mirror. A signal that cries wolf gets ignored. Narrow the globs (per-symbol or per-directory rather than whole files like `database/models.py`, which every slice touches), or teach it to ignore commits that only remove content the docs never referenced. S.
- **VitePress docs don't yet cover SP-CLOUD-2** (auth model, tenancy seam, display capability link) — `backend/README.md` is the current source; fold into `architecture/` + `contracts/`. S.
- **Engine coverage tail**: `scheduler_core/engine/live_ops.py` 40%, `extraction.py` 68%. Light characterization wins when touched. S.
- **Frontend complexity is unmeasured** — `radon` is Python-only. Add ESLint `complexity` as a report-only `warn`, or run `npx ts-complex` ad-hoc, and record the FE tail here.
- **The operator SPA autosaves the state blob and re-normalizes seam-written data** through Meet's domain rules (observed as `state_version` bumps v3/v4 after the seam's v2). Any future seam-written roster field needs either a snapshot round-trip test (as `sourceEntryId`/`remarks` have) or a shape that survives normalization. One characterization test in E2. S.

---

## Recorded deliberately — not defects, not scheduled

Kept so a future reader doesn't rediscover them as bugs.

- **Same origin fuses the entrant and operator blast radii** (ACCEPTED RISK). Ruling R8-A puts the entrant app, the operator SPA and `/api/` on one public hostname, so a script with a foothold anywhere reaches all three: it can read the `_csrf` hidden field out of the DOM (double-submit is same-origin-readable by construction) and, worse, attach `X-ShuttleWorks-CSRF: 1` itself and drive `/api/*` with the httponly `sw_session` — that header proves "a same-origin browser sent this" and nothing more. **In-phase mitigations shipped**: the SSR tier ships zero client JavaScript (so `script-src 'self'` is strict rather than decorative), a per-response nonce is minted by node (R8-D), no user-supplied HTML appears in any loader output. **Named exit: Phase 11's origin split** — `play.*` on its own hostname is what actually fixes this, and R8-A defers the subdomain to that cut-over deliberately. Size M, and the size is Phase 11's.
- **The origin trusts `challenges.cloudflare.com` on `/e/signup`, and only there.** The scoping (an nginx `map` on `$uri`, not a wider snippet) is what keeps the operator console out of the risk above. Phase 11's origin split remains the real exit.
- **No in-product off-site durability in local mode.** `tournament_backups` rows live in the same database as the data they protect, so a lost disk loses both. Local mode is one operator on their own machine, where off-site copies are their responsibility exactly as for any desktop application, and `install-local.md` says so. Cloud mode has a real answer in `install-selfhost.md` (`pg_dump` + `pg_dumpall --globals-only`, encrypted, off-host, monthly restore drill). Revisit only if local mode stops being single-operator.
- **The entrant tier has no password-visibility affordance, deliberately.** `TextField` gives every `type="password"` a "Show password" toggle driven by `onClick`; on a tier that renders no client JavaScript that shipped a control that did nothing. Now opted out with `revealable={false}` rather than made to work, because making it work needs a script budget the tier does not have (a blocking 4 KB gate against a measured 2.5 KB of HTML and zero JS). The prohibition is derived, not spelled: `login.test.ts` fails any `<button type="button">` in the login, signup or entry documents. Revisit if Phase 11 re-opens the JS question.
- **The CSRF form channel depends on a Starlette internal.** `app/form_csrf.py::form_csrf_proves` reads the request body inside the middleware, and the only thing keeping the downstream route from receiving an **empty** form is `starlette.middleware.base._CachedRequest.wrapped_receive` replaying `request._body`. A private attribute of a private class, verified against Starlette 1.3.1. If a future upgrade changes that replay branch, every urlencoded route behind the middleware silently receives a blank body — the entry form would accept submissions with no players. Mitigation in place: `tests/test_form_csrf_channel.py` asserts an eight-player ~20 KB submission on **stored rows**, so the breakage is a red test rather than quiet data loss. **Grep for `wrapped_receive` before bumping Starlette.**
- **`bracket_results.reason` is not mirrored anywhere** — obsolete rather than fixed. The Supabase mirror was removed entirely in SP-CLOUD-3 (ADR 0012); `sync_service.py` is deleted and `sync_queue` was dropped in migration `p9a3b7c1d5e6`. Local SQLite persists `reason` (migration `k4a7b1c9d3e5`) and the UI reads the local API, so nothing was ever user-visible. Recorded so the entry's disappearance does not read as a silent fix.
- **`DISPLAY_PRESETS` / `getPreset` / `DisplayPreset`** are kept for the future venue-preset picker (product decision 2026-07-01). knip keeps flagging them; expected.
- **`slotToTime` / `formatSlotTime`** is an intentional alias (~20 call sites each). Renaming is cosmetic churn with no behaviour benefit.
- **8 dto types read "unused" to knip and are kept on purpose** — `CourtClosure`, `SoftViolation`, `AvailabilityWindow`, `PlayerImpact`, `SchoolImpact`, `MetricDelta`, `ProposalKind`, `SuggestedAction`. They are present in `dto.generated.ts`, so deleting them would create reconcile drift. The mirror-vs-private split was decided by name-matching against the generated contract; a hand-written name that had diverged could in principle have been misclassified and deleted. Types are compile-time only and tsc-verified, so the worst case is minor reconcile drift — flagged so a future `generate-api` reconcile isn't surprised.
- **Grid-mode column default is responsive on the real board.** Task 7's `defaultColumns` replaced the hard `GRID_COLS[2]` fallback, so the public board auto-picks 2/3/4 columns by court count instead of always 2. Intended, inside the Display blast radius.

---

## Open incident

- **2026-08-11 · OPEN INCIDENT — 118 × HTTP 500 under ordinary concurrency, never explained,
  and it has not reproduced since.** This is not a defect entry; it is an unexplained
  production-shaped incident, kept open deliberately. **If you are reading this because you
  just saw it again, that is new evidence — go straight to `docker logs` and capture the
  traceback, which the first occurrence did not leave.**

  **What was observed** (2026-08-10, full-scale browser pass against the seeded cloud-mode
  demo stack): nginx's access log recorded **118 responses with status 500**. In each
  concurrent batch roughly **two requests succeeded and every other one failed instantly** —
  about 15 ms, not a timeout. The SPA fans out to 4–6 requests per page load, so it fired on
  ordinary navigation rather than under load; the container was idle at 0.18% CPU and 145 MB
  of 1 GB, and the connection pool is 20. It was **path-independent and data-independent**,
  reproduced identically against the backend's published port and through nginx (so neither a
  proxy nor a browser artefact), and hit public surfaces too (`/display/{token}/summary`).
  Every failing route was **synchronous, DB-backed, and resolved through `get_repository`**;
  `/health` — the one dependency-free `async` route — never failed once. The response body was
  a bare `Internal Server Error` as `text/plain`: an unhandled exception, not a deliberate
  rejection. Ramping concurrency on a single endpoint showed a hard ceiling of two.

  **What has been ruled out.** A dedicated diagnosis pass could **not reproduce it**: ~1,300
  requests across parallel bursts against the current tree, all clean. It established that the
  container serving the 500s was running an **older image** — and that rebuilding *that* tree
  did not reproduce it either. A later sustained soak against the live container (below) did
  not reproduce it. No change has been made that would explain the original behaviour, so
  **nothing here is a fix** and the incident must not be recorded as closed.

  **The soak, since "latent state in a long-lived process" is the leading reading and short
  bursts against a fresh container are exactly the test that would miss it** (2026-08-11):
  **25 minutes** of continuous browser-shaped load against the live demo container — a 15-minute
  segment, a two-minute idle probe, then a 10-minute segment — driven by four concurrent
  drivers (two authenticated sessions across one meet and three bracket workspaces, plus an
  anonymous driver on the public display and entrant surfaces), hitting ~30 distinct DB-backed
  routes rather than one route repeated, direct to `:8600` **and** through nginx `:8090`, up to
  24 requests in flight at ~46 req/s. **68,619 requests, zero non-200 responses**, and zero
  tracebacks in the container log. Mean latency flat across the whole run (segment 1 by
  3-minute bucket: 61.9 / 58.9 / 62.6 / 54.2 / 56.8 ms; segment 2 by 2-minute bucket: 68.8 /
  67.0 / 65.6 / 76.3 / 59.0 ms — noise, no trend), threads 37–49 under load returning to 30 at
  idle, file descriptors 50–63, TCP connections 4–19. RSS rose ~20 MB over the first ten
  minutes (161 → ~180 MB) and then **plateaued** (~184 MB at the end of a further ten), and did
  not return to baseline when the load stopped — consistent with allocator/pool warm-up rather
  than a leak, but it is the one number worth re-checking on a run measured in hours. The soak
  was **read-only** (the demo data was in use), so a concurrent *write* mix over hours is the
  one shape still unexercised outside the test suite. Harness: a shell loop plus `curl -Z`, no
  new dependency; scripts were scratch, not committed.

  **What now exists to catch it.** (1) The backend **logs again** — `alembic/env.py` called
  `fileConfig` without `disable_existing_loggers=False`, so running migrations at startup
  switched off every logger uvicorn had configured *for the life of the process*. That is why
  hundreds of 500s left no access log and not one traceback, and why this took a browser to
  find rather than a log tail (`efeb08c`). (2) `products/scheduler/tests/test_concurrent_requests.py`
  (`7cae310`) fires genuinely parallel requests at the **whole** `app.main:app` over
  file-backed SQLite — reads, writes, a read/write mix, and the uniform-404 seam — with a
  negative control asserting the burst really overlaps and the DB has not gone in-memory
  (`StaticPool` would silently remove the concurrency under test). Before it, the ~1,580-test
  suite and the ~2,000-request simulator were both strictly sequential, so this entire failure
  class was invisible to every gate.

  Size: unknown by construction — it is an investigation, not a task. *(Recorded in the
  closing review of the demo session; walkthrough §11 D1 carries the same account for the
  non-engineering reader.)*

---

## Measurement snapshot — 2026-07-01

**Cyclomatic complexity** (`radon cc 6.0.1`, `scheduler_core` + backend
`app/adapters/services/repositories/api`, tests/migrations excluded): **690 blocks,
average `A` (3.94)** — healthy in aggregate; this is a *targeted* backlog, not a
systemic problem. **54 blocks rank `C`+** (>10). Re-run:

```
python -m radon cc scheduler_core products/scheduler/backend/{app,adapters,services,repositories,api} -nc -s --total-average -e "*/tests/*,*/migrations/*,*/alembic/*"
```

**Engine coverage** (`pytest --cov=scheduler_core`): 80% total.

### High complexity but well-covered — decompose *when touched*, never speculatively

| Function | Location | Complexity | Coverage |
| --- | --- | --- | --- |
| `find_conflicts` | `scheduler_core/engine/validation.py:71` | **F (68)** — worst single score | 83% |
| `generate_event_route` | `backend/api/brackets.py:1624` | **F (41)** — worst backend | ~81% (API-tested) |
| `Objective.apply` | `scheduler_core/engine/constraints/objective.py:68` | E (36) | 85% |
| `_slice_for` | `backend/api/schedule_repair.py:103` | E (35) | — |
| `compute_impact` | `backend/services/schedule_impact.py:77` | E (32) | — |
| `_hydrate_session` | `backend/api/brackets.py:442` | D (29) | — |
| `on_solution_callback` | `scheduler_core/engine/cpsat_backend.py:124` | D (23) | 94% |
| `process_command` | `backend/repositories/local.py:1504` | D (21) | — |

Moderate watch: `extraction.py:extract_solution` C(18) @ 68%.

### Enforcement gaps

| Gap | Status |
| --- | --- |
| **Broad ruff deferred** | Gate is `select=["F"]`; the `E,I,B,UP` set is ~1506 findings (mostly stylistic, plus `B008` FastAPI `Depends()` false-positives). Owner gate decision — see `pyproject.toml` + CLAUDE.md's lean-gate philosophy. |
| **Stale gate ratchets** | `no-cross-product` is `warn`, blocked on D3; a complexity gate (`radon`/`xenon` threshold) is not wired. Both are owner decisions, logged as candidates rather than tightened unilaterally (`CODE_HEALTH.md` #5). |

---

## Closed

Newest first. One line each — the commit carries the detail.

**2026-08-11 (log reconciliation)**
- Bracket display poll storms a revoked token forever → stops on a terminal error (`83e3b96`).
- `/e/` was a soft-404 (HTTP 200, empty body); bare `/e` fell through to the operator SPA → index route + `location = /e` redirect (`512996a`).
- The `useAdvisories()` call in `MeetDisplayPage` (dead on both routes), the tracked frontend `package-lock.json` (379 KB, nothing reads it), and "Node 20+" in five prerequisite docs (wrong since `rollup-plugin-visualizer@7.0.1`) → deleted/corrected (`330f069`).
- A workspace the caller cannot see, and an unrecognised workspace segment, both left the SPA on a spinner or a guessed Configuration form → honest not-found pages (`9dbf79e`, `67dbab5`).
- Members were unmanageable over HTTP and rendered as UUID chips → member management routes + real identity in the members list (`b3a140f`, `44dcd2f`).
- `/health/deep` never touched the database and `_enforce_cloud_secrets` demanded API-only settings of a worker → real readiness check + role-aware validation (`08876f2`).
- `docker-compose.release.yml` set no `DATABASE_URL`, so the release image fell back to a CWD-relative SQLite file on a read-only rootfs (`feba243`).
- Hub "Next up" listed already-finished meet matches → `_meet_match_signals` excludes anything that left `scheduled` (`1cec926`).
- The backend CSV importer (`csv_importer.py` + `RosterImportDTO`) was unreachable dead code, and the reason SEC-16 was closed not-exploitable → removed (`3836b64`).
- The entrant footer offered "Sign out" in the same document that told the reader to sign in; a refused sign-in painted raw JSON; `DEFAULT_NEXT` sent a destination-less sign-in back to a page that said nothing (`367fba8`, `d3684ef`).
- The docked-pane interaction-smoke scenario had never been executed — `interaction-smoke.spec.ts` now runs in CI (`ci.yml`), which is the only gate on real container-query reflow.
- `403`-before-`404` on a deleted tournament — closed by SP-CLOUD-2's uniform 404 seam (`require_tournament_access`).
- **Deleted, not fixed:** "api/README.md still documents an EventSource SSE flow" — that file no longer exists. (`unscheduledMatches` remains a contract field nothing renders; not worth an entry.)

**2026-08-10** — Entrant page weight: the 100 KB budget was unachievable under React Router 7 SSR (a 98.8 KB framework floor), raised to 123 KB by ruling R8-F, then made moot — `security-headers.conf` sends `script-src 'self'` with no nonce while `<Scripts/>` emits inline scripts, so the app had **never hydrated in production**. `<Scripts/>` dropped, prod and dev now agree, measured **2.5 KB all-HTML**, budget re-derived at 4 KB, still blocking (`bd4d55a`). · Turnstile's script was blocked by our own CSP, so **no entrant could sign up in any deployed stack**; the owner's ruling was to allow it, scoped by an nginx `map $uri` to `/e/signup` and nowhere else, with `frame-src` spelled out so `default-src` was not widened (`1c3452f`). · `/e/robots.txt` was inert until the origin root mapped at it — `location = /robots.txt` now proxies to it, one body, held by `ingress.test.ts`.

**2026-08-04/05** — `_player_matches()` iterated hash-ordered sets: `get_player_ids` now returns a sorted list, so constraint emission order follows from the input alone (six `PYTHONHASHSEED` values, one model fingerprint). All three compensations removed together — the child's seed pin, its refusal to run unpinned, and `services/determinism.py` — replaced by a test that double-solves *unpinned*. · `GET /invites/{token}` was a token-existence oracle → one uniform 404 on both resolve and accept, timing equalized structurally (`7e62f0c`). · The Supabase mirror was removed entirely, taking its tenancy gap with it (`d3a46b6`, ADR 0012). · `make dev-postgres` was added rather than the comment reworded. · The deploy runbook's `/opt/shuttleworks` was the wrong case on a case-sensitive host — 26 occurrences corrected across five files.

**2026-08-03** — `test_backup_create_and_list_newest_first`'s created_at-tie flake: the query already carried `, id DESC`, but `id` is a random UUID, so the tiebreaker is deterministic, not "newest"; the *test* was the bug, fixed by stamping strictly increasing `created_at`.

**2026-07-15/16** — `GET /tournaments/{id}/bracket` rebuilt the whole session per request → bounded-staleness in-process cache (`response_cache.py`, 2.0s TTL under the 2.5s poll), invalidated by every mutating bracket route incl. the command path and `?clearSchedule=true`; suite green with the cache live rather than disabled in tests. · Bracket contingency: `record_result` carries `reason: walkover|retired|forfeit`, persisted end-to-end; product ruling **BYE-downstream-only** (a retired/forfeit loser routes like a walkover for the loser feed only; `walkover=False` is preserved, winner advancement unchanged, no automatic withdrawal from other draws). · `_bracket_solver_options` never let `config.solverTimeLimitSeconds` override the session budget — behaviour was already right, the guard was missing.

**2026-07-09/14** — Full-flow UI audit fixes (`65d9edd`, `bf8309b`, `1cec926`): DrawView score guard, deleted-workspace poll stop, Run-board axis extent, PanZoomCanvas drag crash, `useSmoothedAssignments` hydration deadlock, Display-preview freshness, the `signals.phase` lifecycle seam across Hub/shell/inspector/draw-card (Overview and the Hub facets followed in SP-UI-1), live-aware `nextUp`, one naming dialect, the live-day Generate guard, Run eyebrow alignment.

**2026-07-01/02** — Phase 7 unlocked both locked engine functions: `GreedyBackend.solve` **E37→A5** and `SchedulingProblemBuilder.build` **C19→A2**, characterized first (19%→97%/96%, 28 golden-master tests, `caf5275`) then decomposed along intake → engine → emit (`d09396c`, `1534756`), largest new unit B9, behaviour-equivalence verified line-by-line by an independent review. Two latent bugs found while characterizing were fixed after: `bridge.build`'s config field-drop → `dataclasses.replace` on both rebuilds, and a stale `examples/badminton_event_setup.py`. Neither had a production caller. · Phase 5 backlog: unused **exports 37→3**, **exported types 60→9**, **11 unused deps** removed, knip unused-deps → 0, verified by a real `vite build`. · Loose-ends sweep: the 409 toast's raw UUID, the Plan zoom-bar doubled hairline, the dormant `StatusPill` pulse, bracket drag-validate ignoring roster availability (`player_extras` threaded into `validate_bracket_move`), participant seeds dropped on upsert echo, the Meet Matches row-click dead zone, and error toasts stacking without dedupe. · Live-ops: commands didn't write through to `match_states`, so a command-applied call vanished on reload and a retried Call 409'd forever — the apply branch now mirrors the transition in the same transaction.
