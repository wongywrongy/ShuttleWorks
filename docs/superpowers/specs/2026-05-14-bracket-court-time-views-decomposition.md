# Bracket Court×Time Views — Decomposition

**Status:** Decomposition record. Strategic shape agreed 2026-05-14 (brainstorming session). This is the *parent* of four sub-projects; each gets its own spec → plan → implementation cycle. Not itself an implementation spec.

**Goal:** The bracket (tournament) surface's Schedule and Live views become meet-style court×time Gantts — so an operator running the venue reads the bracket floor the same way they read the meet floor.

---

## Why

The bracket chrome was just unified onto the meet's top-tab model. The *content* of the bracket's Schedule and Live tabs is still divergent:

- **Bracket `ScheduleView`** is a static `<table>`/`colSpan` court×slot grid — already court×time *conceptually* (the solver assigns `(slot, court)` pairs; `AssignmentDTO` carries `court_id`/`slot_id`/`duration_slots`), but rendered as a table with no wall-clock times, no interaction, no state visualisation, no animation.
- **Bracket `LiveView`** is a flat list table — not a Gantt at all.
- The meet's Schedule (`DragGantt`) and Live (`GanttChart`) are flexbox court×time Gantts with the full operator vocabulary.

The user's framing — "served to courts on a time basis … the solver figures out the most efficient time use while the [draw] is predetermined" — describes what the bracket solver *already does*. The gap is the views, not the model.

## Decisions locked (brainstorming, 2026-05-14)

1. **Interactive Schedule.** The bracket Schedule Gantt is fully interactive like the meet's `DragGantt` — the operator drags matches between slots/courts, with live validation and re-solve. "Predetermined" refers to the *draw* (who plays whom, the round structure), not the court×time placement.
2. **Whole floor, all events.** The Gantt shows every event on shared physical court rows (a Men's Singles match and a Women's Doubles on the same court at different slots). The event selector in `BracketViewHeader` becomes a *highlight/dim* filter, not a hard filter. Matches the meet; matches how `schedule-next` already solves globally.
3. **Coordinated, not duplicated.** The shared `GanttTimeline` scaffold is extracted (the committed `2026-05-13-gantt-timeline-unification.md` plan); the bracket Schedule + Live become its 4th and 5th consumers. Rejected: duplicating ~1,000 lines of meet Gantt code into the bracket.

## Key constraint discovered

The bracket backend (`api/brackets.py`) has **no per-match validate, pin, or reschedule endpoint** — only `schedule-next` (round bulk-solve), `results`, and `match-action` (start/finish/reset). The meet's interactive drag depends on `/schedule/validate` + a pin-and-re-solve; the bracket has neither. Interactive drag (decision 1) therefore **requires new backend work** — it is not frontend-only.

---

## Sub-projects

| # | Sub-project | Depends on | Status |
|---|---|---|---|
| 2 | **`GanttTimeline` shared scaffold** — extract the court×time scaffold, migrate the meet's 3 Gantts (`LiveTimelineGrid`, `GanttChart`, `DragGantt`) onto it | — | **Plan exists** (`docs/superpowers/plans/2026-05-13-gantt-timeline-unification.md`), assessed execute-ready: the scaffold API is consumer-agnostic — the bracket consumers' needs match the meet consumers' (bracket Schedule ≈ `DragGantt`, bracket Live ≈ `GanttChart`); data-adaptation + chip-rendering stay consumer-side. That plan's "out of scope: bracket" / "revisit if a 4th consumer appears" notes are superseded by this decomposition. |
| 1 | **Bracket interactive-scheduling backend** — a per-match `/validate` endpoint + pin-and-re-solve, mirroring the meet's `/schedule/validate` + `pinAndResolve` | — | Needs brainstorm → spec → plan |
| 4 | **Bracket Live Gantt** — `LiveView` list → click-select court×time Gantt with bracket state visualisation; this is a full rebuild | #2 | Needs brainstorm → spec → plan |
| 3 | **Bracket Schedule Gantt** — `ScheduleView` table → interactive (drag / validate / pin) court×time Gantt, all events on shared courts | #1, #2 | Needs brainstorm → spec → plan |

## Build order

**#2 → #1 (overlaps #2) → #4 → #3.**

Rationale: #2 and #1 are independent foundations and can proceed in parallel. #4 (bracket Live) is read-only/click-select — it exercises the new scaffold on the bracket side with the least risk. #3 (bracket Schedule) is interactive and depends on *both* foundations — it is the hardest and goes last.

Each sub-project is brainstormed and planned independently. This document is the index; it changes only if the strategic shape changes.
