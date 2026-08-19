# SP-COURT-1 — Court policy: queue-run vs court-tied scheduling

**Type:** Program plan. Multi-session. Research complete; **no implementation has been done.**
**Status:** PLANNED — Phase 0 ruling owed by the owner before any code moves.
**Created:** 2026-08-19 (research session; nothing in the tree was changed for this program).
**Owning module:** Operations (Tier-2). The engine serves the policy; it does not own it.
**Companion documents:** `docs/reference/debt-log.md` (D1, D4, **D20**), `docs/explanation/architecture/data-flow.md`, `CODE_HEALTH.md`.

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

Queue mode is also the upstream feed for live ETA forecasting — a queue solve plus actual durations is exactly the re-forecast input — but ETA is a hard non-goal here.

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

**Correction (SP-COURT-1-REVISE, 2026-08-19): `closed_court_windows` is not a constraint plugin.** It is applied inline in `packages/scheduler-core/scheduler_core/engine/cpsat_backend.py:487-527`, *before* the plugin walk at `:530-537`, by reifying before/after BoolVars against `svars.is_on_court[(match_id, cid)]`. This sharpens Phase 2's problem rather than softening it: queue mode removes the per-court optional intervals, so `is_on_court` no longer exists and that block **silently becomes a no-op** instead of failing loudly. That is the D1 double-booking arriving by a second route, and it is the reason CP8 exists.

---

## 4. Sequencing constraint (hard)

**Phase 2 must not begin until debt item D1 is closed.** Queue mode *defers* court identity to run time, which makes bracket-occupancy correctness more load-bearing, not less — and `closed_court_windows` is the same seam D1 is about (`resolveClosedWindows` treating an unknown occupancy as "the bracket occupies no courts"). Shipping queue mode over a seam that can silently claim zero occupancy is how a double-booking becomes systemic instead of occasional.

Note also the third D1 site found on 2026-08-19: `OperationsProduct.tsx:114` passes `bracketOccupiedWindows(data)` into `generateSchedule`, and `useSchedule.ts:79` guards with `if (provided) return provided` — `[]` is truthy in JavaScript, so a null/not-yet-loaded bracket subscription short-circuits the fetch on the Operations Plan board.

---

## 5. Open rulings — Phase 0 **[USER SIGN-OFF]**

CP-prefixed rulings are local to this program. R-prefixed rulings are the global standing rulings and are never referenced by bare number here.

Nothing below may be decided by an implementing session.

- **CP1 — Shape.** Two modes plus a per-court override (recommended), or three top-level modes? Recommendation: two + override, because "everything queues except Court 1" is the common real case, and a third mode is the hybrid with a worse name.
- **CP2 — Default.** `pinned` (no behaviour change until asked) — recommended — or `queue` (matches how the day is actually run)?
- **CP3 — Scope of the policy.** Per workspace, per meet/draw, or per session solve?
- **CP4 — Plan board in queue mode.** Ordered call list with a court-count feasibility band (recommended), or keep a grid drawn from post-hoc colouring? A grid drawn from a queue solve is a fiction the day contradicts within one match.
- **CP5 — Lookahead.** How many matches of "on deck" does the desk publish (research says next 2–3, called ~10 min early), and does Display show it?
- **CP6 — Bracket interaction.** Does queue mode apply to bracket draws, meet only, or both? Bracket advancement already pre-resolves matches, so the queue is well-defined for both — but the Operations→Bracket advancement edge is deliberately **unwired** (contract-pinned), and this must not become the reason to wire it.
- **CP7 — ADR.** A `court_policy` decision record is owed (next number: **0015**). Not written yet, deliberately: the decision is CP1–CP3, and an ADR that records an undecided decision is worse than none. `docs/explanation/decisions/index.md` must be updated in the same commit (the docs build gates internal links).
- **CP8 — Closed-window semantics + order-on-the-wire.** (a) Phase 2 closed-window handling: v1 fallback-to-pinned or v2 capacity dummies — see Phase 2 for the full trade-off; recommendation v1. (b) Queue order on the wire: explicit `queue_position` field (requires SP-P7 allow-list additions if it ever reaches public serializers) or derived-from-start-times with the derivation rule documented in the wire contract docs; recommendation derived, revisit when the public call list ships.

---

## 6. Phases

### Phase 0 — Ruling **[USER SIGN-OFF]**
Owner answers CP1–CP8. Write ADR 0015 recording the decision and its consequences. Update `decisions/index.md`.
**Gate:** `npm run docs:build`. **STOP.**

### Phase 1 — `court_policy` on the config
Add `court_policy: "pinned" | "queue"` to `ScheduleConfig` (`packages/scheduler-core/scheduler_core/domain/models.py`), defaulting to the CP2 answer. Prior art for a string-enum mode on this exact dataclass: `compact_schedule_mode` (`"minimize_makespan" | "no_gaps" | "finish_by_time"`).
Plumb through `build_schedule_config` in `apps/api/src/shared/scheduling/params.py` — the single place scheduling params become a config. No engine behaviour change yet; `pinned` must be byte-identical to today.
**Gate:** full pytest; `lint-imports`; a test asserting `pinned` produces the identical model to pre-change. **STOP.**

### Phase 2 — Engine honours the policy
*(Entry conditions: D1 closed **and** CP8 ruled.)*

In `queue` mode, skip the per-court optional intervals in `engine/variables.py` and replace `court_capacity`'s per-court `AddNoOverlap` with a single `AddCumulative(capacity=court_count)`. Add a deterministic left-edge colouring step in `engine/extraction.py` so emitted assignments still carry `court_id` — the wire contract does not change shape.

**Closed-court windows (CP8 decides between exactly these two):**
- **v1 — fallback (recommended for this phase):** if the solve's `ScheduleConfig.closed_court_windows` is non-empty, the engine silently solves in `pinned` mode regardless of `court_policy`, and the emitted result records `effective_policy: "pinned"` so the UI can say why. Simple, correct, honest; hybrid arrives in Phase 5.
- **v2 — capacity-consuming dummies:** for each window closing *k* courts over `[t0, t1)`, add *k* fixed dummy intervals of demand 1 to the cumulative. The colouring step must then colour around the specific closed physical courts, not just any *k* courts — this materially complicates colouring and its negative control. Choose v2 only if a real fixture needs queue mode concurrent with bracket occupancy before Phase 5.

**Lock/pin interaction:** any match touched by `locks_and_pins` keeps its explicit per-court interval and is excluded from the cumulative pool (a pinned match is a promise — queue mode must not relocate it). `court_change_penalty` is meaningless for pool matches in queue mode and must be a no-op for them, asserted by test.

**Queue-order determinism (new contract):** the emitted match order in queue mode is part of the product's behaviour. Order is defined as: ascending solved start time, then ascending stable tiebreaker (NOT the random-UUID `id` alone — use the same tiebreaker the colouring step uses, documented in one place and imported by both). Whether order rides the wire as an explicit `queue_position` field or is documented as derived-from-start-times is CP8's second half; either way the rule lives in exactly one function.

**Tests:**
- Equal-objective property test: both encodings, same instances, equal makespan.
- **Negative control (CODE_HEALTH 3b):** the colouring step must be shown to fail when max overlap exceeds court count — remove the capacity constraint in the test fixture and assert colouring raises.
- **Order-determinism test:** two solves of the same instance emit the identical queue order; a solve of a permuted-input instance emits the same order (input-order independence).
- Under v1: a fixture with closed windows asserts `effective_policy == "pinned"` and byte-identical model to today's. Under v2: a fixture asserts no assignment lands on a closed physical court during its window — with its own negative control.

**Gate:** full pytest; determinism contract (`simulator/`) unchanged; `make check`. **STOP.**

### Phase 3 — Plan board renders the policy *(largest UI piece)*
Per CP4. In queue mode the Plan board shows an ordered call list plus a feasibility band, not a court×time grid. `boardPlacements.ts` (`buildPlanChips`) is the seam; it already separates Plan from Run rendering. Phase 3 is operator-console only; see Non-goals for the public tier.
**Gate:** vitest; depcruise (no new cross-module edges); interaction-smoke. **STOP.**

### Phase 4a — Run-time eligibility audit and hardening *(entry condition for Phase 4)*

Queue mode moves rest and player-conflict guarantees from solve time to run time: `nextEligible` and `computeAutoPull` become the enforcement point. This phase establishes whether they are fit to carry that.

- Audit `runtime/runModel.ts` (`nextEligible`) and `run/RunSurface.tsx` (`computeAutoPull`) for: player-busy checks (no player of the candidate match currently on any court) and rest-window enforcement between a player's consecutive matches. *(The SP-COURT-1-REVISE audit of 2026-08-19 found: **neither check exists, anywhere on the run path — and the gap is live today, not queue-mode-only.** `deriveQueue` (`apps/console/src/modules/operations/runtime/runModel.ts:117-122`) filters on `m.court == null` — a MATCH on a court is excluded, a PLAYER on a court is not. `nextEligible` (same file, :128-130) is `queue.find((m) => m.eligible && can(m.status, 'assign'))`, and `eligible` (:30-33) means "both sides known" / "feeders resolved" — an identity predicate, not an availability one. `computeAutoPull` (`apps/console/src/modules/operations/run/RunSurface.tsx:91-114`) does no filtering of its own: it checks the recorded match has a court and `lane.depth === 1`, then trusts `nextEligible` wholesale. The backend does not backstop it — `assign_court` (`apps/api/src/repositories/local.py:1986-2020`) guards only status-is-SCHEDULED and payload completeness. Meanwhile the solver DOES guarantee both properties, at PLANNED times: `engine/constraints/player_no_overlap.py` and `engine/constraints/rest.py:40` (`rest_is_hard` defaults True). Auto-pull assigns at `slotForAssign(...)`, not the planned time, so those guarantees are already void for every auto-pulled match: a player mid-rally on court 1 whose next match has both sides known sits in the queue, is `eligible`, and is auto-pulled onto court 3 the moment court 3 clears. Filed as **D20** in `docs/reference/debt-log.md`.)*
- If checks are missing: implement player-busy as a hard filter in `nextEligible` (a match whose player is mid-rally is not eligible, full stop) and rest as a **soft flag surfaced to the desk** — software flags, humans decide. The desk may override a rest flag; it may not override player-busy.
- If this pulls the deferred Participant rest/grace-timer work forward, record it in the ledger as a scope decision for the owner — do not build the Participant record inside this program.
- **Negative control:** a test that removes the player-busy filter and asserts the eligibility test fails.

**Gate:** vitest; interaction-smoke. **STOP.**

### Phase 4 — Run surface + honest drift signals
*(Entry condition: Phase 4a complete.)*

`deriveQueue` sorts by the solved queue order (the single documented rule from Phase 2) rather than `plannedSlot` in queue mode. Re-check the spurious `(moved)` tag as a consequence of the mode mismatch — it should disappear or become truthful, not be suppressed. Publish the CP5 lookahead (research: next 2–3, called ~10 min early). `computeAutoPull` changes only if Phase 4a found it deficient — confirmed by test either way.

**Gate:** vitest; interaction-smoke; viewer-role check (no write path reachable for `viewer`). **STOP.**

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

## 7a. Non-goals

- **Public call-list projection is out of scope for this program.** Public surfaces continue to render the coloured per-court timetable, which queue mode still emits (colouring guarantees `court_id`). Publishing an on-deck call list to entrants/Display is a follow-up program: it requires new fields, therefore new SP-P7 serializer allow-lists with key-set assertion tests, and a CP5-style ruling on how much lookahead is public. Nothing in Phases 1–5 may add fields to a public serializer.
- The two serializers this rule binds, confirmed 2026-08-19: **`apps/api/src/entries/entries_site.py`** — public draw cards carry `court` (`:152`, `:248`) and `scheduledTime`, populated at `:603-606` from `assignment.court_id` / `_slot_time(...)`; and **`apps/api/src/display/display.py`** — `_MEET_PROJECTION_FIELDS` (`:161-168`) carries the whole `schedule` blob, plus `/{token}/bracket` (`:215`). `entries_public.py` and `entries_me.py` carry no court/time fields and must keep carrying none.
- Note for CP8(b): `ScheduleAssignment` is a `StrictModel` (`apps/api/src/core/schemas.py:306-310`, console twin `apps/console/src/api/dto.ts:185-190`), so a `queuePosition` field is a two-sided contract change plus a `make generate-api` reconcile — not an additive field.
- **ETA / live re-forecasting** (see §1) is a hard non-goal. Queue mode is its upstream feed; building the forecaster is a separate program.

---

## 8. Evidence appendix (verified 2026-08-19)

- Operations already queues: `run/RunQueue.tsx`, `runtime/runModel.ts` (`deriveQueue`, `nextEligible`), `run/RunSurface.tsx` (`computeAutoPull`), `runtime/runActions.ts` (`assign_court`).
- Engine is current and already modern: OR-Tools 9.15.6755; `engine/variables.py` docstring records the earlier migration off the `O(matches × slots × courts)` boolean matrix to interval + optional-interval-per-court.
- Benchmark and colouring verification: **`packages/scheduler-core/benchmarks/bench_court_encoding.py`** (committed 2026-08-19 by SP-COURT-1-REVISE). Parameterized `(matches, courts)`, builds both encodings with identical player-conflict constraints and the same makespan objective, runs greedy left-edge colouring on B's solution and **validates** it (≤ C courts, zero overlaps), prints the §3 table. Deliberately **not** wired into pytest or CI — `testpaths = ["tests"]` and the filename does not match `python_files`, so it is doubly out of collection. Run it: `.venv/Scripts/python.exe packages/scheduler-core/benchmarks/bench_court_encoding.py [matches courts]`.
  - **Its instance generator is not the one the 2026-08-19 research session used** (those scripts were deleted). It reproduces §3's *shape* — B roughly an order of magnitude faster, makespan equal, colouring valid — but not §3's absolute A-times or speedup factors, which are instance-dependent. See the ledger for the 150/8 re-run.
- Mode-enum prior art: `ScheduleConfig.compact_schedule_mode`.

---

## 9. Ledger

Append one entry per session: phase, tasks + commits, gates run and results, deviations, exact next task.

### 2026-08-19 — research session
- **Phase:** pre-0 (research + planning only).
- **Done:** domain research (sources in §2); engine benchmark A vs B at five sizes (§3); left-edge colouring verified valid at five sizes; constraint audit for court-identity dependence; Operations audit establishing that FCFS-any-court already ships.
- **Code changed:** **none for this program.** Benchmark scripts were removed after use.
- **Deviations:** the program was initially framed as a CP-SAT encoding change. The owner corrected it to an Operations concern; the code audit confirmed the owner — `computeAutoPull` already implements the queue. This document reflects the corrected framing.
- **Next task:** Phase 0 — owner answers CP1–CP8, then ADR 0015.

### 2026-08-19 — SP-COURT-1-REVISE

- **Phase:** still pre-0. Documentation revision only; **no product code was changed.**
- **The six changes:**
  1. **Local rulings renumbered R1–R7 → CP1–CP7**, plus a note under §5 fencing the prefix. The collision was wider than reported: the global standing rulings in `docs/history/programs/SP-PROGRAM-1.md:44-105` run **R1–R14** (not R7–R15), so the old local numbering collided along its entire length. *R15 does not exist in the tree* — it is cited by two SP-P6-2 briefs and flagged as a phantom at `docs/history/superpowers/specs/2026-08-11-sp-p6-2-public-ia-design.md:65-69`.
  2. **Phase 2 replaced.** Closed-window semantics are now a decidable choice (v1 fallback-to-pinned, recommended, vs v2 capacity dummies); lock/pin interaction spelled out; the vague "matches concerned" language is gone; a **queue-order determinism contract** added with its own test requirement.
  3. **CP8 added** — closed-window semantics (a) and order-on-the-wire (b). Phase 2's entry condition now requires it.
  4. **Phase 4a inserted** (run-time eligibility audit + hardening) as Phase 4's entry condition, with the A1 finding embedded verbatim; Phase 4 rewritten to depend on it.
  5. **Non-goals section (§7a) added** — public call-list projection is out of scope, naming the two real serializers that carry court/time.
  6. **Benchmark script committed** at `packages/scheduler-core/benchmarks/bench_court_encoding.py`; §8 cites it instead of "re-create from the tables."
  - Plus two corrections the audit forced: **§3's constraint-audit claim** (`closed_court_windows` is *not* a plugin — it is inline in `cpsat_backend.py:487-527`, which is why queue mode would silently no-op it), and the **§1 ETA motivation line**.
- **The A1 finding, verbatim:** *neither a player-busy check nor a rest-window check exists anywhere on the run path — and the gap is live today, not queue-mode-only.* `deriveQueue` (`runModel.ts:117-122`) filters `m.court == null`: a MATCH on a court is excluded, a PLAYER on a court is not. `nextEligible` (`:128-130`) is `queue.find((m) => m.eligible && can(m.status, 'assign'))`; `eligible` (`:30-33`) means "both sides known" / "feeders resolved", an identity predicate. `computeAutoPull` (`RunSurface.tsx:91-114`) does no filtering of its own — recorded-match-has-a-court and `lane.depth === 1`, then it trusts `nextEligible` wholesale. The backend does not backstop it (`local.py:1986-2020`: status + payload only). The solver *does* guarantee both properties (`player_no_overlap.py`, `rest.py:40` — `rest_is_hard` defaults True) but only at PLANNED times, and auto-pull assigns at `slotForAssign(...)`. Net: a player mid-rally on court 1 whose next match has both sides known is auto-pulled onto court 3 the moment it clears.
- **Finding raised:** **D20** in `docs/reference/debt-log.md` (owner asked for the debt log rather than an F-number; F-* is a legacy id from `01-findings.md`, D-numbers are the live convention). Recorded, **not fixed** — this was a documentation-revision session.
- **D1 re-verified: still OPEN.** Its own cited path is stale pre-reorg (`products/scheduler/frontend/...`); live path is `apps/console/src/hooks/useSchedule.ts:83`. §4's two citations both still hold.
- **Gates:** `ruff check packages/scheduler-core/benchmarks/` clean. `npm run docs:build` **not applicable** — `docs/.vitepress/config.*:80-85` `srcExclude`s `history/**`, so this document is not in the built site. No product code touched, so no product gate applies.
- **Benchmark re-run, 150/8** (`.venv` python, OR-Tools 9.15.6755 confirmed installed; pinned at `apps/api/requirements.txt:10`, floor `>=9.8.0` in `packages/scheduler-core/pyproject.toml:7`):

  ```
  | Matches / courts | A explicit-court | B cumulative | Speedup | Makespan | Colouring |
  | 150 / 8          | 1.734 s          | 0.040 s      | 43x     | equal    | OK, 8/8 courts, 0.05 ms |
  |   model size     | 2780 constraints, 2701 vars | 223 constraints, 301 vars |
  ```

  **Shape reproduces; magnitude does not.** §3 records 0.239 s / 0.044 s / 5× at this point. The research session's generator was deleted, so this script's synthetic instances are not the same instances — B is an order of magnitude faster with an equal makespan and a valid colouring, which is the claim Phase 2 rests on, but the speedup *factor* is instance-dependent and §3's absolute A-times are not reproducible from this script. Recorded rather than reconciled: silently overwriting §3 with these numbers would fake a continuity that does not exist.
- **Next task:** unchanged — Phase 0, owner answers **CP1–CP8**, then ADR 0015. Plus the new open item: rule on **D20** (and whether it waits for Phase 4a).
