# SP-PERF-1 Phase 0 — dead-code register + performance baseline

**Status: awaiting sign-off. No code changed.**
Branch `perf/hygiene`, cut from `main` @ `5f75085` (`v0.2.0` + SP-REPO-1 ledger).

Two deliverables: a classified dead-code register (0.A) and a measured
performance baseline (0.B). Both are deliberately conservative — the brief's
Rule 3 is that "dead" means *provably* unreferenced, and Rule 2 is that no
performance change ships without a before/after number.

The most useful results here are the **negative** ones: two of the three
things that looked like obvious wins are already done, and one of the
tool's "unused" verdicts would have broken the build.

---

## 0.A — Dead-code register

Source: `knip` (3 unused files, 19 unused exports, 20 unused exported types),
then a grep pass over every candidate. The grep pass changed the
classification of **more than half** of them.

### REMOVE — verified unreferenced

| Item | Evidence |
|---|---|
| `src/products/meet/roster/hooks/useBulkOperations.ts` | Zero references repo-wide outside its own definition; no test, no barrel, no dynamic import |
| `src/products/meet/roster/hooks/usePlayerSelection.ts` | Same |
| `backend/services/csv_importer.py` + `RosterImportDTO` | Zero references; already logged during SP-SEC-1 Phase 1 as the reason SEC-16 was closed not-exploitable |

Estimated removal: ~3 files, a few hundred lines. Small, and that is the
honest size — the tree is not carrying much genuinely dead code.

### KEEP-WITH-REASON — the tool is wrong

**`src/types/fonts.d.ts` — removing this breaks `tsc`.**
knip reports it unused because nothing *imports* it. That is how ambient
declaration files work. It declares `@fontsource-variable/geist` and
`@fontsource-variable/jetbrains-mono`, which `src/main.tsx:6-7` imports for
side effects. Delete it and the type-check fails on two untyped module
imports. This is exactly the failure mode Rule 3 exists to prevent, and it was
the top item on the tool's list.

**`isLastOwner`, `ownerCount`, `ROLE_ORDER` — used, inside their own module.**
All three are called from `memberActions.ts` itself (lines 73, 84, 124, 125).
knip is flagging an unnecessary `export` keyword, not dead code. The correct
action is to *narrow the export*, not delete the symbol — and the distinction
matters: `SEC_PROGRESS.md` records that stubbing `isLastOwner` fails exactly
three frontend tests, so it is load-bearing behaviour.

### UNCERTAIN — left in place, logged

- **~20 "unused exported types" in `src/api/dto.ts`.** This file is
  hand-reconciled against `dto.generated.ts` after every backend schema
  change (see `CLAUDE.md`). An unused DTO type is more likely to be a wire
  contract awaiting a consumer than debris, and removing one silently widens
  the drift between the two files. Needs a per-type check against the backend
  schema, not a bulk delete.
- **Barrel re-exports from `src/components/control-plane/index.ts`** —
  `EVENT_CATEGORIES`, `COL_PRIORITY_CLASS`, `allowedToBlocked`,
  `blockedToAllowed`, `normalizeWindows`, `timeToMinutes`, `minutesToTime`.
  A barrel is a published surface; several of these are re-exports of symbols
  that *are* used via their defining module. Needs per-symbol tracing.
- **`getPreset`, `sortBadges`** — grep shows zero references, which puts them
  close to REMOVE, but both live beside sibling exports that are used, which
  is the shape of a partially-adopted API rather than debris. Cheap to
  confirm; not confirmed yet.
- **`computeMirroredBracketLayout`, `applyCourtPushback`, `DISPLAY_PRESETS`,
  `badgeForEvent`, `EVENT_COLORS`** — 1–2 references each, all needing a
  per-symbol trace to distinguish "used once" from "defined and re-exported".

**Not yet run:** `jscpd` duplication, `vulture` (not installed — the brief
says report, do not add as a permanent dep without asking), superseded-docs
sweep, stray-artifact sweep.

---

## 0.B — Performance baseline

### Frontend bundle — measured

`npm run build`, production mode. Total `dist/` **2.5 MB**.

| Chunk | Raw | Gzipped |
|---|---|---|
| `exceljs.min` | 936.99 kB | 270.75 kB |
| `ui-vendor` | 254.45 kB | 73.48 kB |
| `index` (entry) | 209.79 kB | 66.02 kB |
| `TournamentPage` | 136.52 kB | 41.39 kB |
| `BracketTab` | 92.53 kB | 26.37 kB |
| `react-vendor` | 49.63 kB | 17.57 kB |

**The obvious win is already taken.** `exceljs` is 3.7× the next chunk and
would be the headline finding — except it is already loaded via
`await import('exceljs')` in both export modules, imported as a *type* only
elsewhere, and `grep -c exceljs dist/assets/index-*.js` returns **0**. It is
not on the critical path. Lazy-loading it is a change that has already been
made; "reduce the bundle by 271 kB gzipped" is not available.

What remains is ordinary: the entry chunk at 66 kB gzipped and `ui-vendor` at
73 kB are unremarkable for a React SPA of this size. **No bundle finding.**

### Hub batched signals — verified, no regression

The audit trail says this path was batched once; the brief asks whether it
still holds. It does.

`GET /tournaments` (`api/tournaments.py:283-300`) issues:
- one query resolving every `(tournament_id, role)` pair for the caller
- one query for all module rows
- `_counts_for(ids)` — **9–10 grouped queries for any number of tournaments**,
  documented in its own docstring as "no per-row DB round-trips"

Query count is constant in N, not linear. **No N+1. No finding.** This is a
verification result, not a fix.

### Not yet measured

Stated plainly rather than implied complete:

- **Endpoint latency under realistic load.** The brief asks for a 50–100
  tournament seed and a profile of the actually-slow endpoints. Not run.
- **Database index coverage** on read paths added since the job queue's
  partial indexes — tenancy filters, member lookups, the new
  `count_active_for_user` join from SP-SEC-1.
- **Solve rail** memory guard and worker concurrency under load.

---

## Prioritized fix list

Short, because the measurements did not support a long one.

1. **Remove the three verified-dead items** (2 frontend hooks, 1 backend
   service + its DTO). Low risk, small win, one commit per kind.
2. **Narrow three exports** in `memberActions.ts` from `export` to
   module-private. Not a deletion; behaviour-identical.
3. **Add a CI orphan/unused-export check.** `knip` is already a script and
   already finds real debris. Report-only first (the lean-gate philosophy),
   ratcheted later. This is the item with the most durable value: nothing
   currently gates re-accumulation, which is how `dto.generated.ts` rotted.
4. **Finish the UNCERTAIN tracing** before touching any of it.
5. **Run the load-based measurements** (0.B remainder) before proposing any
   query or index change. There is currently no evidence for one.

---

## Overlap with SP-SEC-1

Per the brief's §Coordination, SEC owns validation models, auth/session,
output encoding, headers, error handling.

- **`RosterImportDTO`** sits in `app/schemas.py`, which SEC-1 Phase 1 rewrote
  wholesale (62 request models onto `StrictModel`). Its removal is PERF's
  finding but touches SEC's file. **Deferred until SP-SEC-1 merges**, then
  done as a rebase on top — not resolved in parallel.
- **`src/api/dto.ts` types** likewise mirror models SEC has been changing.
  Another reason the UNCERTAIN classification stands.
- No other overlap: the dead hooks, the bundle, and the Hub query path are
  untouched by SEC-1.

---

## STOP conditions — status

- No "dead" code whose removal changes behaviour was removed — nothing was
  removed at all. One candidate (`fonts.d.ts`) *would* have broken the build
  and is reclassified.
- No performance change proposed that could alter determinism or results.
- One overlap with SP-SEC-1 identified and deferred rather than
  force-resolved.
