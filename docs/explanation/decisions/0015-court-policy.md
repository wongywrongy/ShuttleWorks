# ADR 0015 — Court policy: queue-run vs court-tied scheduling

**Status:** Accepted (2026-08-19, `feat/sp-court-1-queue-mode`, SP-COURT-1 Phase 0).

## Context

ShuttleWorks already runs first-come-first-served-any-court on the day. The
Operations Run surface works a global ordered queue, and auto-pull assigns the
queue head to whichever court just cleared — while the solver produces a
**court-pinned timetable** ("match M on court 3 at 10:40") that the first long
match makes fictional for the rest of the day. Every drift signal then compares
actual against a plan the product deliberately overrides.

Domain research (SP-COURT-1 §2) says real events are usually **both at once**:
a queue for the body of the draw, pinned courts for whatever is watched,
filmed, staffed or hour-rented. Engine research (§3) says the court-agnostic
encoding — one `AddCumulative(capacity=courts)` instead of per-court optional
intervals — is 4–40× faster at real sizes with equal makespan, and greedy
left-edge colouring always recovers a valid per-court timetable (interval-graph
theory: max overlap = chromatic number).

## Decision

The owner ruled CP1–CP8 on 2026-08-19:

- **CP1 — Shape:** two modes plus a per-court override.
  `court_policy: "pinned" | "queue"` at the top, and per-court
  `"pinned" | "pool"` overrides — "everything queues except Court 1" is the
  common real case and must be expressible from day one.
- **CP2 — Default:** `pinned`. No existing solve changes until a workspace
  asks; a default-constructed config is byte-identical to the pre-change model
  (pinned by test).
- **CP3 — Scope:** per workspace. The policy rides the existing workspace
  config blob (`courtPolicy` / `courtOverrides`); no migration.
- **CP4 — Plan board:** in queue mode the Plan board shows an ordered call
  list plus a court-count feasibility band, not a court×time grid — a grid
  drawn from a queue solve is a fiction the day contradicts within one match.
  The grid stays for pinned mode untouched.
- **CP5 — Lookahead:** the Run desk publishes a configurable **1–5** "on deck"
  matches (default 3; research says call 2–3 about ten minutes early). Public
  surfaces get nothing — the SP-P7 serializer freeze (SP-COURT-1 §7a) stands.
- **CP6 — Engines:** the policy applies to **both** Meet and Bracket. Both
  pre-resolve matches into the same solver through the same
  `build_schedule_config` seam, and a venue has one operating mode. The
  Operations→Bracket advancement edge stays unwired (contract-pinned).
- **CP7 — This ADR.**
- **CP8 — Closed windows + order on the wire:** (a) **v1 fallback** — a solve
  with any `closed_court_windows` (or legacy all-day closures) silently solves
  in pinned mode and reports `effective_policy: "pinned"` so the UI can say
  why; capacity-consuming dummies (v2) wait for the Phase 5 hybrid if a real
  fixture ever needs them. (b) Queue order is **derived from start times** —
  ascending solved start, then ascending match id (`sort_key` in
  `engine/court_pool.py`, the one definition) — not a new wire field; the
  `ScheduleAssignment` DTO keeps its exact shape.

One decision was **forced during implementation**, same spirit as CP8-v1: a
locked / drag-pinned / freeze-horizon match whose known court lies **inside
the pool** also forces `pinned`. This is soundness, not caution — a forced
court reserves a window the cumulative constraint cannot express, so the
cumulative can admit a solution no colouring realises. A kept match on a
pinned-**override** court (the show court, exactly the real-world case) keeps
queue mode.

## Consequences

- The engine solves pooled matches for time only; court identity is recovered
  by deterministic left-edge colouring in extraction. The wire contract does
  not change shape: every emitted assignment still carries `court_id`.
- `plan_pool` (`packages/scheduler-core/scheduler_core/engine/court_pool.py`)
  is the single place the effective policy is decided; `ScheduleResult`
  reports it as `effective_policy`.
- Determinism holds: same input + seed → byte-identical schedule, and a
  permuted input produces the same day (`sort_key` pins the tiebreak).
- Locks and pins remain exact promises; matches inside the freeze horizon
  keep their courts.
- Queue mode moves rest and player-conflict enforcement from solve time to
  run time. The run path was hardened first (debt D20, closed 2026-08-19):
  player-busy is a hard filter on the queue head; short rest is a soft flag
  the desk may override.
- D1 (the bracket-occupancy swallow) was a hard prerequisite and is closed:
  occupancy-unknown now blocks the meet solve instead of claiming none.

## Pointers

Program plan and evidence are maintained outside this site (research tables and phase ledger).
Benchmark:
`packages/scheduler-core/benchmarks/bench_court_encoding.py`.
