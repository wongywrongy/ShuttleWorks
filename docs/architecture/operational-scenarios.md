# Operational scenarios

Two real usage sequences — **Plan day** and **Run day** — that tie the modules,
seams, and state machine together as they actually play out for a director. The
mechanics of each piece live elsewhere (the [match state machine](/architecture/data-flow#the-match-state-machine),
the [command pipeline](/architecture/data-flow#the-command-pipeline-write-path),
the [seam contracts](/contracts/)); this page is the *narrative* that walks through
them in order, so a new contributor can see how a day flows end to end.

> **Load-bearing condition:** the software **flags and times; the operator decides.**
> Advisories (overrun, no-show) are *computed warnings*, never automated actions —
> nothing calls a match or records a result on its own. Every state change is an
> explicit operator command. Keep this in mind reading both scenarios.

---

## Scenario 1 — Plan day (pre-event, one-and-done)

The goal of Plan day is to turn rosters and formats into a laid-out floor. You run it
once, ahead of time; you do **not** re-run it live.

1. **Create the workspace.** In the [Hub](/glossary#control-plane-workspaces), create
   a workspace from a module template (Meet Day / Bracket / Hybrid / Blank). Enabling
   a module writes a `workspace_modules` row — real persisted state
   ([Enable a module](/how-to/enable-a-module)).
2. **Set the venue.** In [Settings](/modules/settings): courts, schedule window, and
   the parameters that become one [`ScheduleConfig`](/architecture/unified-configuration).
3. **Build the plan with an engine:**
   - **Meet:** assemble the roster and match config, then solve —
     `POST /schedule/stream` streams [SSE progress](/architecture/bracket-schedule-streaming)
     while CP-SAT works. Review advisories and any [proposal](/modules/meet), then
     commit. **The commit is [Seam A](/contracts/meet-operations):** the schedule lands
     via `tournamentStore.setSchedule` (`scheduleFinalized`) and the Operations **Plan**
     board seeds from it.
   - **Bracket:** define events + participants, generate each draw
     (`…/bracket/events/{eid}/generate` — first-round [BYEs auto-walk-over](/glossary#bracket)),
     then schedule the next ready round (`…/bracket/schedule-next/stream`) and commit the
     chosen candidate. Operations reads the resulting snapshot via the `getBracket` poll
     — **[Seam B](/contracts/bracket-operations)** (`drawGenerated`).
4. **Review and finalize.** On the Operations **Plan** board, drag to adjust
   (`…/schedule/validate` gives cheap feasibility feedback on a drag). When it looks
   right, finalize (`POST …/plan-finalized`). The floor is now laid out.

When both engines are enabled, their matches **interleave on one board** through the
uniform `OpsBlock` row ([Unified operations view](/architecture/unified-operations-view)).

## Scenario 2 — Run day (live floor, state-driven)

Run day is not slot-driven — there is no fixed clock advancing matches. It is
**state-driven**: the board reflects live match and court state, and the operator
drives every transition. The full lifecycle is the
[match state machine](/architecture/data-flow#the-match-state-machine); here is how it
feels on the floor.

1. **Boot the stack** (`make scheduler`). The director runs on the laptop; operators
   reach the Run surface over the LAN (or an optional tunnel — see
   [Quality attributes → Security](/architecture/quality-attributes#security)).
2. **Call a match to court.** Select a `scheduled` match → **Call**:
   `call_to_court` moves `scheduled → called`. The command flows through the
   **idempotent command queue** (`POST …/commands`) with optimistic UI — the pending
   badge shows instantly, then clears on the server ack
   ([command pipeline](/architecture/data-flow#the-command-pipeline-write-path)).
3. **Start play.** **Start**: `start_match` moves `called → playing`. The match is now
   a [`locked` status](/glossary#operations-and-the-match-lifecycle) — a re-solve pins
   its court + slot and will never reschedule live play out from under the floor.
4. **Record the outcome.** **Finish** (`playing → finished`) or **Retire**
   (`playing → retired`) — both terminal. For a **bracket** match, recording goes
   through the idempotent `POST …/bracket/commands` and
   [advancement](/glossary#bracket) resolves the next play-unit *intra-bracket* (this
   is why [Seam C stays unwired](/contracts/#the-four-descriptors-and-the-four-seams)).
5. **Auto-pull.** Recording empties the court's [lane](/glossary#operations-and-the-match-lifecycle);
   if a match is queued, the Run surface pulls it onto that court automatically.
6. **The public screen updates.** Every match-state write is the `matchStateChanged`
   edge — **[Seam D](/contracts/operations-display)** — so [Display](/modules/display)
   projects the change to the public TV (poll, or Supabase Realtime in cloud mode).
7. **Conflicts stay unblocking.** An illegal transition or a stale version returns
   `409`; the inline ConflictBanner shows the reason and the operator keeps working —
   no modal, no lost input.
8. **Network drops don't stop the floor.** If the director's machine goes briefly
   unreachable, operators' commands queue in IndexedDB; on reconnect the reachability
   hook flushes them, and the per-command **idempotency key** guarantees no
   double-apply ([Reliability](/architecture/quality-attributes#reliability-availability-local-first)).
9. **Hand adjustments without a re-solve.** `assign_court` / `postpone_match` (and the
   bracket `assign` / `unassign` analogs) move matches directly — **non-solver
   commands** that never invoke CP-SAT ([API reference](/api/#operator-command-vocabulary)).

## How the two scenarios connect

Plan day ends by finalizing a layout; Run day begins by operating it. The bridge is
the seam set: Plan day *fires* [Seam A](/contracts/meet-operations) /
[Seam B](/contracts/bracket-operations) (schedule / draw → Operations), and Run day
*fires* [Seam D](/contracts/operations-display) (match state → Display) on every
action. Nothing re-solves on Run day unless the director explicitly asks (a warm
restart or a repair) — live play is protected by the `locked` statuses.

## See also

- [Operations module](/modules/operations) — the Plan + Run surfaces and their runtime
- [Data flow](/architecture/data-flow) — the state machine + command write path mechanics
- [Module contracts](/contracts/) — the seams these scenarios traverse
- [Quality attributes](/architecture/quality-attributes) — the reliability/security stances behind Run day
- [Glossary](/glossary)
