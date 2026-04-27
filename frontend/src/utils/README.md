# utils/

Pure helpers — no React, no store, no axios. If a function reads from
the store or calls an API, it belongs in `../hooks/` or `../api/`
instead.

## Index

| File | Purpose |
|---|---|
| `timeUtils.ts` | Slot ↔ HH:mm conversion, overnight-schedule handling, current-slot calc, `getRenderSlot()` for the live play-head, status-pill colour helper. |
| `dateUtils.ts` | Date helpers (formatting, today/tomorrow, etc.). |
| `matchUtils.ts` | `getMatchLabel()` etc. — formatting helpers that depend only on the match DTO. |
| `trafficLight.ts` | Per-match readiness light (green/amber/red) given roster + schedule + live state. `computeAllTrafficLights()` is the entry point. |
| `courtFill.ts` | Find candidate matches that can fill an empty court slot. |
| `constraintChecker.ts` | Mirrors a subset of the backend hard rules so the frontend can reject obviously-invalid drags before /schedule/validate. Keep behaviour aligned with `backend/_validate.py`. |
| `scheduleProgress.ts` | Smooth solver progress events into a percent + label for the HUD. |
| `exporters.ts` | CSV / XLSX export of the schedule, roster, and matches. |
| `importers.ts` | CSV / XLSX import for roster + matches. |

## Conventions

- Pure functions only. If you find yourself reaching for `useAppStore`
  inside a util, the function probably wants to be a hook.
- Time/slot math: read `timeUtils.ts`'s docstrings — overnight
  schedules and the live play-head have non-obvious edge cases that
  are already encoded.
- Constraint logic: the backend is the source of truth. Frontend
  duplication exists only for fast pre-validation; the solver still
  re-checks everything.
