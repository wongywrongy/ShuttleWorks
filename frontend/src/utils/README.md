# utils/

Pure helpers — no React, no store, no axios. If a function reads from
the store or calls an API, it belongs in `../hooks/` or `../api/`
instead.

## Index

| File | Purpose |
|---|---|
| `dateUtils.ts` | Date helpers (same-day comparison, day diffs, formatters). |
| `matchUtils.ts` | `getMatchLabel()` and other formatting helpers that depend only on the match DTO. |
| `matchGenerator.ts` | Auto-generate matches from a roster + a generation rule (all-vs-all, etc.). Frontend-only — no round-trip. |
| `trafficLight.ts` | Per-match readiness light (green/amber/red) given roster + schedule + live state. `computeAllTrafficLights()` is the entry point. |
| `constraintChecker.ts` | Mirrors a subset of the backend hard rules so the frontend can reject obviously-invalid drags before `/schedule/validate`. Keep aligned with `backend/api/_validate.py`. |
| `scheduleProgress.ts` | Smooth solver progress events into a percent + label for the HUD. |
| `exporters.ts` | CSV / XLSX export of the schedule, roster, and matches. |
| `importers.ts` | CSV / XLSX import for roster + matches. |

## What lives elsewhere

- **Slot ↔ HH:mm conversion**, overnight wrap, current-slot math —
  `frontend/src/lib/time.ts` (config-aware).
- **Duration / status timestamps** — `frontend/src/lib/timeFormatters.ts`.
- **`cn()` + `INTERACTIVE_BASE`** — `frontend/src/lib/utils.ts`.
- **Active-assignment derivation** — `frontend/src/lib/getActiveAssignments.ts`.

## Conventions

- Pure functions only. If you find yourself reaching for `useAppStore`
  inside a util, the function probably wants to be a hook.
- Time/slot math: read `lib/time.ts`'s docstrings — overnight
  schedules and the live play-head have non-obvious edge cases that
  are already encoded.
- Constraint logic: the backend is the source of truth. Frontend
  duplication exists only for fast pre-validation; the solver still
  re-checks everything.
