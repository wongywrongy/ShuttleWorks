# SP-COURT-1 — Court policy: queue-run vs court-tied scheduling

**Type:** Program plan. Multi-session. Research complete; **no implementation has been done.**
**Status:** PLANNED — Phase 0 ruling owed by the owner before any code moves.
**Created:** 2026-08-19 (research session; nothing in the tree was changed for this program).
**Owning module:** Operations (Tier-2). The engine serves the policy; it does not own it.
**Companion documents:** `docs/reference/debt-log.md` (D1, D4), `docs/explanation/architecture/data-flow.md`, `CODE_HEALTH.md`.

---

## HOW TO USE THIS DOCUMENT

Same protocol as the other program docs in this directory:

1. **Every session starts by reading:** this document → the ledger section at the bottom → `git log --oneline -20`. The tree outranks this document.
2. **One phase per session.** Never start a phase whose entry conditions are unmet.
3. **STOP gates are hard.** Phases marked **[USER SIGN-OFF]** need explicit owner approval recorded in the ledger.
4. **Audit before edit.** Every claim about current behaviour must cite a file path. The claims in this document were verified on 2026-08-19 and are cited; re-verify before relying on them.
5. **No implementation of Phase 2+ before D1 is closed** — see *Sequencing constraint* below.

---

## 1. The finding that reframes the program

**ShuttleWorks already runs first-come-first-served-any-court on the day.** This is not a feature to be added; it is a mode the product already operates in, without ever admitting it in the plan.

Verified in the tree:

| Behaviour | Where |
| --- | --- |
| "Global ordered queue of matches not yet on a court", position rendered `#1, #2, …` | `apps/console/src/modules/operations/run/RunQueue.tsx` |
| Queue derivation — unassigned, non-done, sorted by planned slot then key | `runtime/runModel.ts` (`deriveQueue`) |
| The assignable head of the queue | `runtime/runModel.ts` (`nextEligible`) |
| **Auto-pull: when a court's lane empties on a `record`, the queue head is assigned to *that* court** | `run/RunSurface.tsx` (`computeAutoPull`) |
| Runtime court assignment commands, both engines | `runtime/runActions.ts` (`assign_court`, `bracketApi.assignCourt`) |

So the desk already works a queue. What the solver produces is a **court-pinned timetable** — match *M* on court 3 at 10:40 — and the first long match makes that fiction permanent for the rest of the day.

**The program is therefore not "add a queue mode". It is "let the plan tell the truth about how the day is actually run."**

### Consequence already visible in the debt log

Every signal that compares *actual* against *planned* is comparing against a plan the product deliberately overrides. The debt log's cosmetic entry — *"a `(moved)` tag on an in-progress match that was never moved (trigger looks like command-path court/slot writes differing from the schedule assignment)"* — is the predicted symptom of exactly this. It should be re-checked as a **consequence of the mode mismatch**, not fixed as a rendering bug.

---

## 2. Research — what real tournaments do

The domain evidence is about **variance**, not taste.

- A best-of-three to 21 runs **15–45 minutes**. Organiser guidance is explicit: run a match queue ("next on court 3"), **not** fixed kick-off times, because organisers who survive the day "don't fight the variance." One court clears **14–16 matches/day**. ([Score7 — organising a badminton tournament](https://kb.score7.io/blog/guides/how-to-organize-a-badminton-tournament/))
- Multi-category events need a **central desk** that assigns courts, calls players, and absorbs walkovers and delays. ([Score7](https://kb.score7.io/blog/guides/how-to-organize-a-badminton-tournament/))
- **Call matches ~10 minutes early**, and display the *next* match on each court before the current one ends — to keep players warm and courts from idling. ([Score7](https://kb.score7.io/blog/guides/how-to-organize-a-badminton-tournament/))
- Don't hold a free court waiting for the slowest one. ([PickleballTournaments — managing courts](https://pickleballtournaments.com/blog/manage-courts-for-your-pickleball-tournament))

**Where fixed courts remain correct** — this is not a legacy practice:

- Show courts and finals, where the **court is the product**: Wimbledon publishes an Order of Play *by named court* because ticket holders buy a court. ([Wimbledon Order of Play explained](https://ticket-compare.com/wimbledon-order-of-play-explained/))
- Streaming/filming rigs, which are physically bound to a court.
- Umpire and official rostering.
- Venues where courts are **shared with lessons or rented by the hour**, so specific courts disappear at specific times. ([Score7 — organising a tennis tournament](https://kb.score7.io/blog/guides/how-to-organize-a-tennis-tournament/))
- Category-dedicated courts (a common desk practice for keeping an age group together).

**Conclusion for the product:** a real event is usually **both at once** — a queue for the body of the draw, pinned courts for the parts that are watched, filmed, staffed, or time-boxed. A binary mode is the wrong final shape; a default policy plus per-court override is the right one.

---

## 3. Research — engine evidence

Measured 2026-08-19 on this machine, OR-Tools **9.15.6755** (current). Same instances, same objective (minimise makespan), same time limit, identical player-conflict constraints. **A** = today's encoding (interval + optional interval per court + `AddNoOverlap` per court). **B** = court-agnostic (`AddCumulative(capacity=court_count)`).

| Matches / courts | A explicit-court | B cumulative | Speedup | Makespan |
| --- | --- | --- | --- | --- |
| 40 / 4 | 0.057 s | 0.013 s | 4× | equal |
| 80 / 6 | 0.121 s | 0.030 s | 4× | equal |
| 150 / 8 | 0.239 s | 0.044 s | 5× | equal |
| 300 / 12 | 2.992 s | 0.074 s | **40×** | equal |
| 600 / 16 | 6.163 s | 0.199 s | **31×** | equal |

Model size at 600/16: **11,167 → 952 constraints; 10,801 → 1,201 variables.**

**Realisability was verified, not assumed.** Greedy left-edge colouring of every cumulative solution produced a valid per-court timetable: **≤ C courts used, zero overlaps, < 0.3 ms** for 600 matches. This is interval-graph theory — maximum overlap equals chromatic number, and `AddCumulative` enforces exactly "no more than C overlap at any time." **Court assignment is a post-processing step, not a search dimension.**

The official OR-Tools scheduling docs document the optional-interval pattern for machine choice but give **no performance guidance**; the numbers above are the missing half. Community reports independently note that optional intervals inflate variable counts substantially. ([OR-Tools scheduling docs](https://github.com/google/or-tools/blob/stable/ortools/sat/docs/scheduling.md))

### What genuinely needs court identity

Audited across `packages/scheduler-core/scheduler_core/engine/constraints/`:

| Needs court identity | Does not |
| --- | --- |
| `locks_and_pins` (fixes slot **and** court) | `rest` |
| `objective` — `court_change_penalty` (repair/warm-restart stability) | `availability` |
| `closed_court_windows` (bracket occupancy — `ScheduleConfig.closed_court_windows`) | `stay_close` |
| | `game_proximity` |

Anything in the left column forces `pinned` for the matches it touches, or must be excluded from the queue pool.

---

## 4. Sequencing constraint (hard)

**Phase 2 must not begin until debt item D1 is closed.** Queue mode *defers* court identity to run time, which makes bracket-occupancy correctness more load-bearing, not less — and `closed_court_windows` is the same seam D1 is about (`resolveClosedWindows` treating an unknown occupancy as "the bracket occupies no courts"). Shipping queue mode over a seam that can silently claim zero occupancy is how a double-booking becomes systemic instead of occasional.

Note also the third D1 site found on 2026-08-19: `OperationsProduct.tsx:114` passes `bracketOccupiedWindows(data)` into `generateSchedule`, and `useSchedule.ts:79` guards with `if (provided) return provided` — `[]` is truthy in JavaScript, so a null/not-yet-loaded bracket subscription short-circuits the fetch on the Operations Plan board.

---

## 5. Open rulings — Phase 0 **[USER SIGN-OFF]**

Nothing below may be decided by an implementing session.

- **R1 — Shape.** Two modes plus a per-court override (recommended), or three top-level modes? Recommendation: two + override, because "everything queues except Court 1" is the common real case, and a third mode is the hybrid with a worse name.
- **R2 — Default.** `pinned` (no behaviour change until asked) — recommended — or `queue` (matches how the day is actually run)?
- **R3 — Scope of the policy.** Per workspace, per meet/draw, or per session solve?
- **R4 — Plan board in queue mode.** Ordered call list with a court-count feasibility band (recommended), or keep a grid drawn from post-hoc colouring? A grid drawn from a queue solve is a fiction the day contradicts within one match.
- **R5 — Lookahead.** How many matches of "on deck" does the desk publish (research says next 2–3, called ~10 min early), and does Display show it?
- **R6 — Bracket interaction.** Does queue mode apply to bracket draws, meet only, or both? Bracket advancement already pre-resolves matches, so the queue is well-defined for both — but the Operations→Bracket advancement edge is deliberately **unwired** (contract-pinned), and this must not become the reason to wire it.
- **R7 — ADR.** A `court_policy` decision record is owed (next number: **0015**). Not written yet, deliberately: the decision is R1–R3, and an ADR that records an undecided decision is worse than none. `docs/explanation/decisions/index.md` must be updated in the same commit (the docs build gates internal links).

---

## 6. Phases

### Phase 0 — Ruling **[USER SIGN-OFF]**
Owner answers R1–R7. Write ADR 0015 recording the decision and its consequences. Update `decisions/index.md`.
**Gate:** `npm run docs:build`. **STOP.**

### Phase 1 — `court_policy` on the config
Add `court_policy: "pinned" | "queue"` to `ScheduleConfig` (`packages/scheduler-core/scheduler_core/domain/models.py`), defaulting to the R2 answer. Prior art for a string-enum mode on this exact dataclass: `compact_schedule_mode` (`"minimize_makespan" | "no_gaps" | "finish_by_time"`).
Plumb through `build_schedule_config` in `apps/api/src/shared/scheduling/params.py` — the single place scheduling params become a config. No engine behaviour change yet; `pinned` must be byte-identical to today.
**Gate:** full pytest; `lint-imports`; a test asserting `pinned` produces the identical model to pre-change. **STOP.**

### Phase 2 — Engine honours the policy
*(Entry condition: D1 closed.)*
In `queue` mode, skip the per-court optional intervals in `variables.py` and replace `court_capacity`'s per-court `AddNoOverlap` with one `AddCumulative`. Add a deterministic left-edge colouring step in `extraction.py` so the emitted assignments still carry a `court_id` — the wire contract does not change.
Force `pinned` (or exclude from the pool) whenever `locks_and_pins`, `court_change_penalty`, or `closed_court_windows` are live for the matches concerned.
**Tests:** equal-objective property test across both encodings; a **negative control** proving the colouring step fails when overlap exceeds court count (CODE_HEALTH 3b — this is a safety property).
**Gate:** full pytest; determinism contract (`simulator/`) unchanged; `make check`. **STOP.**

### Phase 3 — Plan board renders the policy *(largest UI piece)*
Per R4. In queue mode the Plan board shows an ordered call list plus a feasibility band, not a court×time grid. `boardPlacements.ts` (`buildPlanChips`) is the seam; it already separates Plan from Run rendering.
**Gate:** vitest; depcruise (no new cross-module edges); interaction-smoke. **STOP.**

### Phase 4 — Run surface + honest drift signals
`deriveQueue` sorts by solved order rather than `plannedSlot` in queue mode (`runtime/runModel.ts`). Re-check the spurious `(moved)` tag as a consequence of the mode mismatch. Publish the R5 lookahead.
`computeAutoPull` should need little or no change — confirm by test, do not assume.
**Gate:** vitest; interaction-smoke; a viewer-role check (writes must still not leave the browser). **STOP.**

### Phase 5 — Per-court override (the hybrid)
Mark each court `pinned` (show court, streamed, rostered, hour-rented) or `pool`. Pinned courts keep explicit intervals; the pool uses cumulative with capacity = pool size. This is the shape real events need and where the research says the value is.
**Gate:** full `make check`; a mixed-fixture test (≥1 pinned + a pool). **STOP.**

---

## 7. What must not regress

- **The wire contract.** Emitted assignments keep `court_id`; Display, the entrant tier and any self-hosted client are consumers.
- **Determinism.** The simulator's determinism contract is a gate; colouring must be deterministic (sort by start, then a stable tiebreaker — `id` is a random UUID, so `created_at`-style ties are not deterministic on their own).
- **The unwired Operations→Bracket advancement edge**, pinned by the console contract test and by `apps/api/.importlinter`.
- **Viewer read-only.** No new write path may become reachable for a `viewer`.
- **Locks and pins** must remain exact: an operator pin is a promise, and queue mode must not quietly relocate it.

---

## 8. Evidence appendix (verified 2026-08-19)

- Operations already queues: `run/RunQueue.tsx`, `runtime/runModel.ts` (`deriveQueue`, `nextEligible`), `run/RunSurface.tsx` (`computeAutoPull`), `runtime/runActions.ts` (`assign_court`).
- Engine is current and already modern: OR-Tools 9.15.6755; `engine/variables.py` docstring records the earlier migration off the `O(matches × slots × courts)` boolean matrix to interval + optional-interval-per-court.
- Benchmark and colouring verification: run ad hoc in the research session; **the scripts were deleted and are not in the tree.** Re-create from the tables in §3 if the numbers need re-confirming.
- Mode-enum prior art: `ScheduleConfig.compact_schedule_mode`.

---

## 9. Ledger

Append one entry per session: phase, tasks + commits, gates run and results, deviations, exact next task.

### 2026-08-19 — research session
- **Phase:** pre-0 (research + planning only).
- **Done:** domain research (sources in §2); engine benchmark A vs B at five sizes (§3); left-edge colouring verified valid at five sizes; constraint audit for court-identity dependence; Operations audit establishing that FCFS-any-court already ships.
- **Code changed:** **none for this program.** Benchmark scripts were removed after use.
- **Deviations:** the program was initially framed as a CP-SAT encoding change. The owner corrected it to an Operations concern; the code audit confirmed the owner — `computeAutoPull` already implements the queue. This document reflects the corrected framing.
- **Next task:** Phase 0 — owner answers R1–R7, then ADR 0015.
