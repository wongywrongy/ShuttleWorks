# Package 02 report — state, schedule, identity and time contracts

2026-09-06 · baseline `f5ccfcef` · branch `feat/surface-book-remediation` · **documentation only, no product code changed, not committed**

## Files written

| File | Status | What it is |
| --- | --- | --- |
| `docs/reference/contracts/state-and-formatting.md` | new (846 lines) | Deliverable A + C. Nine domain sections (lifecycle, match readiness/play, schedule, conflicts, score, identity, time, connectivity, public visibility), each with canonical states + exact operator/public labels, missing-data rules with exact fallback wording, the single authority module per tier, and an implementation-delta table routing every D1–D20 site to a verdict and a package. Ends with a verification-of-the-code-map section and a 32-row test plan mapping plan §6 to concrete files. |
| `docs/explanation/decisions/0029-state-and-formatting-contract.md` | new | Deliverable B. One authority per domain; alternatives (per-surface vocabularies; one global enum per X5-as-written; backend-only contract; persisted disputes) and consequences. Status **Proposed**. |
| `docs/.vitepress/config.mts` | modified (+2) | Registered both pages in the sidebar. |
| `docs/explanation/decisions/index.md` | modified (+1) | ADR log row for 0029. |
| `docs/reference/contracts/index.md` | modified (+7) | Cross-links the vocabulary contract from the contracts index (it is not a seam page, so it is introduced as a fourth, different kind of contract). |

Files stayed LF, matching the rest of `docs/`. `git diff --stat` on the three modified files is `+10` total — proportionate.

## Rulings applied

Every ruling constraint in the brief is honoured and cited in-page: "On court" for the match state with "Live now" reserved for lifecycle/sections; public schedule state exactly "Scheduled" or "Time to be confirmed" as a separate field; three-value court occupancy with `disputed` as its own bucket and an actionable operator record; per-game winner only from completed games under configured rules, match winner from the authoritative outcome; structured sides with an explicit `UnresolvedSide` model (`bye`, `pending_member`, `winner_of`, `loser_of`, `undetermined`) and no slash assembly or parsing; one named-context date/time formatter in the tournament timezone with ISO confined to machine attributes/exports/diagnostics; four write-durability words separate from the four read-freshness words; public serialization bound to audience/content toggles and the ADR 0018 person allowlist.

## Code-map verification

A sample of D1–D20 was re-read in the tree before relying on the map. Confirmed: D1, D2, D3, D5, D6, D7, D8, D9, D11, D12, D15, D20. Two refinements found and recorded on the contract page:

1. `workspace_signals.py:_IN_PLAY` is `{"started", "playing"}` — it carries the legacy `started` spelling, so D4's alias problem reaches the **counting** path too, not only the routes.
2. The scoring configuration (`apps/api/src/workspaces/setup.py:139, 640`) has `scoringFormat`, `setsToWin`, `pointsPerSet`, `deuceEnabled` and **no point-cap field**, so plan §3's preferred "Win by 2 with the actual configured cap" copy is not renderable today. This became open question C3.

## Orchestrator to confirm

| # | Question | Recommendation | Blocks |
| --- | --- | --- | --- |
| C1 | Is a court dispute derived or persisted? | Derive the dispute from current match rows; persist only the **resolution**, on the existing idempotent command path (offline-queueable). A persisted dispute buys a durable `detectedAt` and cross-node ordering under ADR 0022 at the cost of a reconciliation path. | 03 |
| C2 | Does a disputed court hide both matches publicly, or only the court field? | Only the court field — both matches stay visible with no court. Current `_merge_live_bracket_courts` pops the court for both, which is already close; the question is whether the match itself should ever be withheld. | 04 |
| C3 | Is there a configured point cap? | Add a nullable `pointCap` to scoring configuration in package 13; until then render "Win by 2" with no cap claim. Do not hardcode 30. | 09, 13 |
| C4 | Does structured sides on the operator wire get its own slice? | Yes — split package 10 into 10a (DTO change + `make generate-api` + `dto.ts` reconciliation) and 10b (presentation). D17 is otherwise backend work hidden inside a frontend package. | 10 |
| C5 | What does the durability chip say in pure local mode? | "Saved on this device", with `tournament_backups` named as the recovery route; no *Syncing* / *Synced* offered at all. Treating a local commit as `remote` is the exact false claim package 19 exists to remove. | 19 |

## Gate results (verbatim)

`npm run docs:build` (node v24.11.0):

```
> cp-sat-scheduling-engine@0.0.0 docs:build
> vitepress build docs

  vitepress v1.6.4

- building client + server bundles...

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ building client + server bundles...
- rendering pages...
✓ rendering pages...
build complete in 13.14s.
```

**PASS** — `docs:build` fails on broken internal links, so every link added by the two new pages resolves.

`npm run docs:freshness`:

```
Docs freshness — docs/ vs the code they document (committed git history)

  STATUS  AREA                            DOCS @                  SOURCE @
  ------  ------------------------------  ----------------------  ----------------------
  BEHIND  API reference                   1f2454cf 2026-09-05     f5ccfcef 2026-09-06 *
  BEHIND  Backend structure & data flow   6fc7d826 2026-09-02     f5ccfcef 2026-09-06 *
  BEHIND  Workspace model                 654cf115 2026-08-28     f5ccfcef 2026-09-06 *
  BEHIND  State management                654cf115 2026-08-28     f5ccfcef 2026-09-06
  EDIT    Module contracts & overview     6fc7d826 2026-09-02     f5ccfcef 2026-09-06
  BEHIND  Modules                         aa6e02dc 2026-08-31     f5ccfcef 2026-09-06 *
  BEHIND  Extending (how-to guides)       7cc638c2 2026-09-05     f5ccfcef 2026-09-06
  BEHIND  Engine (ADR 0004)               654cf115 2026-08-28     d0fe95d4 2026-09-01
  BEHIND  Entrant tier (the public site)  1f2454cf 2026-09-05     f5ccfcef 2026-09-06 *
  BEHIND  Entries module                  aa6e02dc 2026-08-31     f5ccfcef 2026-09-06 *
  BEHIND  Developer verification, demo,   7cc638c2 2026-09-05     f5ccfcef 2026-09-06
  BEHIND  Design system                   7cc638c2 2026-09-05     f5ccfcef 2026-09-06 *

  * = source has uncommitted local changes (not yet in history)
  EDIT: 1 area(s) have uncommitted local doc edits (newer than HEAD).

  ⚠ BEHIND: 11 area(s) — source changed after the docs last did:
```

Informational, not a gate. Every BEHIND row is pre-existing and caused by the concurrent uncommitted code changes of other packages (`*` marks eight of them), not by this package. The single `EDIT` row — "Module contracts & overview" — **is** this package: it is the uncommitted `docs/reference/contracts/` edit, which is the expected signal.

## Notes for the orchestrator

- The ADR sidebar in `docs/.vitepress/config.mts` stops at **0024**; ADRs **0025–0028 were never registered** there (they are in the ADR log index, so `docs:build` stays green). 0029 was added after 0024, leaving that gap visible. Registering 0025–0028 is outside this package's file scope — flagging it rather than fixing it.
- The contract page's implementation-delta tables are the routing input for packages 03, 04, 07, 09–11, 12, 15, 17, 19 and 20. Each row names a `file:line`, a verdict (becomes authority / redirects to authority / deleted / kept as a documented view-local rule) and the owning package, so a package brief can be cut from them directly.
- Four divergences are ruled **kept as documented view-local rules** rather than removed: the board's wider "now" window (D19, parameterised into the authority), the two export-format side joiners (D14, file formats not UI strings), the bracket migration split-decoder (D15, a one-way legacy reader), and `conflict_metrics.py` (a metric, not a state source). Each gains a docstring saying so.
- The single largest change the contract implies is **D17**: the console's operator match model adopting the entrant tier's structured `persons[]` instead of pre-joined side strings. That is the C4 question.
