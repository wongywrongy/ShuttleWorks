# SP-DM-1 — Domain Data-Model Audit: program ledger

**ABSOLUTE RULE:** read this file at session start, update it at session end.

**Plan:** `docs/history/superpowers/plans/2026-08-24-sp-dm-1-domain-model-audit.md`
(committed `0e3f7914`), from the SP-DM-1 prompt (conversation-delivered; transcribed
verbatim as the plan's Appendix A).
**Branch:** `docs/dm1-audit`, worked in place (the repo is OneDrive-synced; this is a
docs-only, read-only program).
**SDD workspace:** `.superpowers/sdd/2026-08-24-sp-dm-1-domain-model-audit/` — per-task
briefs and reports plus the Task-1 `citations-pack.md`. None of it is committed.
**Deliverables (documents only, zero code changes):**
1. `docs/history/audits/2026-08-24-domain-model-audit.md`
2. `docs/history/superpowers/specs/2026-08-24-domain-model-unification-design.md`
3. this ledger.

## Pinned audit SHA — `e67633fe`

All evidence in both deliverables resolves against the tree **as of `e67633fe`**
(`test(e2e): the discovery evidence follows the calendar anchor (SP-P8 follow-up)`),
which is main's tip carrying the merged SP-P7 delta + SP-P8 season calendar. **This
supersedes the plan's "unmerged SP-P7/P8 stack on `feat/p8-season-calendar`" note
(Environment correction 2) — that stack has landed.**

Verified at Task 1, so no downstream task need re-ask it:

- `git merge-base --is-ancestor e67633fe HEAD` → true.
- `git diff --stat e67633fe HEAD` → **1 file, +225 lines: the plan doc only.**

So the working tree **is** the pinned SHA for every audited path. The plan doc and this
ledger are the only deltas.

The plan's other environment corrections stand unchanged: do **not** audit
`.claude\worktrees\p7-public-entrant` (stale pre-reorg snapshot, not a registered
worktree); re-resolve every scouted path through the translation table; commits are
path-limited (`git commit -- docs/...`), never `git add .`, never `git stash`.

## Tasks

Dependency graph: **1 → (2a ‖ 2b ‖ 2c ‖ 2d) → 3 → (4 ‖ 5) → 6 → 7 → 8 → 9.**

| # | Task | Size | Status |
|---|---|---|---|
| 1 | Prior-art citations pack + ledger init | S | **DONE** 2026-08-24 |
| 2a | Census — storage (`db/models.py`, `alembic/`) | M | **DONE** — `census-2a.md` |
| 2b | Census — backend DTOs + `scheduler_core` | M | **DONE** — `census-2b.md` |
| 2c | Census — operator frontend (`apps/console`) | M | **DONE** — `census-2c.md` |
| 2d | Census — entrant app (`apps/entrant`) | M | **DONE** — `census-2d.md` |
| 3 | Census merge into one 8-concept matrix | S | **DONE** — `matrix.md` (conflicts C-1..C-6 settled) |
| 4 | Identity trace (person keying, doubles, origin split) | M | **DONE** — `identity-trace.md` |
| 5 | Contract seams + singles/doubles end-to-end traces | L | **DONE** — `seam-trace.md` (TRACE A + B, 15 hops each) |
| 6 | Blast radius (grep counts) | S | **DONE** — `blast-radius.md` (13 areas) |
| 7 | Consolidation: `F-DM-*` register + exec summary | M | **DONE** — deliverable 1, `F-DM-01..77` |
| 8 | Unification plan doc + `R-DM-*` decision list | L | **DONE** 2026-08-24 — deliverable 2, `R-DM-1..13` |
| 9 | Spot-check verification (fresh context) + commit all three docs | S | verified; doc-only fixes applied, commit pending |

Findings-ID protocol: parallel workers emit `PF-<task>-<n>`; **Task 7** mints
`F-DM-01..N`; **Task 8** mints `R-DM-*`. No worker numbers its own `F-DM`/`R-DM`.

## Task record

### Task 1 — Prior-art citations pack + ledger init (2026-08-24) — DONE

Wrote `.superpowers/sdd/2026-08-24-sp-dm-1-domain-model-audit/citations-pack.md` (the
pack pasted into every downstream subagent prompt) and this ledger. No other writes; no
commit (Task 9 commits, path-limited).

**Path corrections vs the plan's hints** (the plan's scouted line refs were stale):

- R1–R14 live at `SP-PROGRAM-1.md:44-112`, not `:44-109` (and not `SP-COURT-1.md:234`'s
  `:44-105`).
- Entries-design "**§9.3**" is not a heading. F-E1's ownership statement is §9 ("Open
  questions for implementing agents", `:1703`) **item 3**, at
  `docs/history/superpowers/specs/2026-08-06-entries-design.md:1721-1729`.
- Everything else resolved where the plan scouted it.

**R15 grep verdict — CONFIRMED text-less.** `grep -rn "\bR15\b"` across `*.md/ts/tsx/py/
json` (minus `archive/`, `.claude/worktrees/`, `node_modules`): 24 hits, **zero ruling
text** — deferral markers, briefs citing it, and two explicit phantom flags
(`2026-08-11-sp-p6-2-public-ia-design.md:65-70`, `SP-COURT-1.md:234`). One unrelated hit
(`.superpowers/sdd/2026-08-07-phase6-entrant-app/task-5-report.md:33`) uses "R15" as a
*local phase-6 requirement ID* — different namespace, not the ruling. R15 becomes an
owner-supply `R-DM-*` item; it is never quoted.

**Discovered, not in the plan — an ID collision Task 4 would otherwise mis-cite.** The
plan's Task 4 says "cite defect D3 where `bracketMigration.ts` already owns it", but
debt-log **D3** is the depcruise cross-product-warns entry (`debt-log.md:29`), while
`apps/console/src/modules/bracket/bracketMigration.ts:11` cites a **bracket defect
series D3** (raw slugs rendered as player names on a doubles-only draw's roster). Two
registers, same number. Task 4 must cite the code comment by `path:line` and
disambiguate in the audit doc.

**Also flagged for downstream:** ADR 0003 is marked partially superseded by ADR 0012
(`0003-...md:3`) — its `sync_queue`/Supabase-mirror/Realtime language is dead and must
not be cited as current. All ADR bodies are pre-reorg (`products/…`, `services/…`,
`backend/…`) and need path re-resolution.

### Task 8 — Unification design doc + `R-DM-*` decision list (2026-08-24) — DONE

Wrote deliverable 2, `docs/history/superpowers/specs/2026-08-24-domain-model-unification-design.md`
(target model + phases + decisions). No commit — Task 9 commits all three docs
path-limited. Ledger row 8 flipped; no other file touched.

**Shape:** **ten phases P0–P9** — S×2 (P3 identity minting, P9 cosmetic sweep) ·
M×5 (P0 type mechanism, P1 standings, P2 blob versioning, P6 bracket person key,
P8 PlayerProfile v1) · L×3 (P4 people→competition key, P5 pair survives intake,
P7 event key + Meet Event). **Thirteen decisions `R-DM-1..13`.**

**Build-or-defer (R-DM-12):** five of SP-P7's seven inherited deferrals build now;
**highlight-player on the draw tree** and **global profiles (R15 v1)** defer past
P3+P4 — both are the first surfaces to *link* a public person identity, so both
would be built twice and would ship the forkable `personKey` onto new public URLs.
SP-P8 is unaffected by every phase.

**Most consequential decision: R-DM-2** — the mechanism linking the people spine to
the competition spine (five findings, two of them blocking; unblocks P4/P6/P7/P8).
R-DM-1/2/3/7 jointly remain the audit's "person-spine ruling"; R-DM-2 is its largest
*open* part because R-DM-1's core was ruled 2026-08-23 (see the Task-9 rework below).

**Ruled-decision cross-check (spec §5.4 gate).** Every `R-DM` was diffed against
`citations-pack.md`. Where a decision abuts a ruling, the ruled half is stated as a
constraint, not a question: R-DM-1 scopes *around* R7's soft-flag/no-hard-unique and
R-P7c's `person_key`; R-DM-2 does **not** ask whether `entry_players` is
TournamentPlayer (ruled) — only the link mechanism; R-DM-3 never quotes, paraphrases
or infers R15; R-DM-4 preserves I4 (flag, never resolve); R-DM-6 cites D7's closed
half and asks only the Phase-10 account-deletion half; R-DM-8 asks shape only (the
mandate is Appendix A §3); R-DM-11 leaves `bracket_event_id` FK-less per R2. Each
phase also carries a standing "may not re-decide" list (ADR 0006/0014, R2, R7/R13,
I4, D7).

**Housekeeping raised at Task 8, both now handled:** the ledger's stale 2a–7 rows are
backfilled above; the audit doc's two `…-unification-**plan**.md` cross-references
(`2026-08-24-domain-model-audit.md:5`, `:595`) belong to the parallel audit-doc fix
context — the written path is `…-unification-**design**.md`, per the plan's
Deliverables §2.

### Task 9 — Fresh-context verification + fix pass (2026-08-24)

**Verdict: sound after doc-only fixes.** ~78 citations resolved against the tree at
`e67633fe`; **6 failed, all with identified targets (~92%)**. Census matrix has no
silent blanks; TRACE A and TRACE B both reach a match with a key at every hop;
findings are terse. **One substantive re-ask found and fixed.**

Design-doc + ledger half of the fix-list applied in this context (the audit-doc half
ran in parallel; the audit doc was not touched here):

1. **R-DM-1 re-asked a ruled decision — reworked.** The minting rule was **ruled
   2026-08-23**: same account · same normalized name · same birth year, all present —
   "auto-link what is certain, flag the rest, never merge by guesswork"
   (`entries/submissions.py:280-294`, recorded in SP-P7's delta `4d5aca56`). Name-alone
   matching is explicitly rejected there (father and son under one club rep), and the
   operator merge tool is a ruled deferral (`debt-log.md:78`). The old R-DM-1 option
   (a) *was* name-alone matching — it is now marked as contradicting the STOP ruling
   and available only as an explicit override. R-DM-1 now asks only what the ruling
   left open, both verified in the tree this session: **(i)** `looks_duplicate` is
   scoped to *same event* + same name (`submissions.py:228-261`), so a birth-year-less
   person entering a second **event** fragments with **no flag at all** — the ruling's
   own "rides the advisory" promise does not reach there; **(ii)** `partners.accept()`
   never calls `same_person` and **takes no `birth_year` argument** at all
   (`partners.py:176-224`), so a partner-minted person is `birth_year = NULL`
   permanently and can never be the certain match in either direction. P3's goal and
   its four negative controls were rewritten to *preserve* the ruling rather than
   overturn it (NC 1 now asserts two rows + a flag, not one row).
2. ADR 0014's quote re-cited to `0014-workspace-vs-tournament-vocabulary.md:37`.
3. **Deviation series renamed `D1–D9` → `DV-1..DV-9`** throughout (diagram, table,
   mapping, phases, decisions) — the old tokens collided with debt-log **D7** and
   **D8** *inside this one document*. The foreign ids (`D-A2`, debt-log `D3/D7/D8`,
   the bracket defect series `D3`) are now qualified at every point of use, and the
   doc header states the two series explicitly.
4. F-DM-19 given a §2.3 row (ruled gap, cited not filed; survival pinned by P8 NC 2)
   — §2.3 now covers every blocking/structural finding without a phase home.
5. Terseness pass: phase goals and R-DM openers now point at the `F-DM` id instead of
   restating its evidence (the register carries it).
6. §3.1 corrected as a **consequence** of item 1 — with R-DM-1's core ruled, the
   largest genuinely-open part of the person-spine decision is **R-DM-2**. The audit's
   joint R-DM-1/2/3/7 framing is preserved and explicitly reconciled, so the two
   deliverables do not appear to disagree.

**Still uncommitted.** All three docs are untracked; the path-limited commit
(`git commit -- docs/history/audits/... docs/history/superpowers/specs/...
docs/history/programs/DM1_PROGRESS.md`) is Task 9's closing step. **STOP after that** —
Kyle reviews and issues the `R-DM` rulings.

## Prior art & ruled decisions (appendix draft for the audit doc)

Full text with verbatim quotes and per-item must/must-not notes:
`.superpowers/sdd/2026-08-24-sp-dm-1-domain-model-audit/citations-pack.md`. Summary of
what is **ruled and must be cited, never re-asked**:

| Item | Source | Ruling in one line |
|---|---|---|
| Person-in-tournament | `SP-P7-phase0-audit.md:64-76` | `entry_players (tournament_id, id)`; `person_key = entry_player_id`, never the name. Caveat: hand-added roster players and bracket participants have no `entry_player` row. |
| R13 chain | `docs/reference/modules/entries.md:9-26` | `entrant_accounts → submissions → entries → entry_players`; one person in three events is one row. |
| R1–R14 | `SP-PROGRAM-1.md:44-112` | Standing program rulings. Domain-load-bearing: R2 (`entry_events` Entries-owned), R7/R13 (player fields never mixed into contact fields — mandatory schema), R10 (account = submitter, not player), R12 (field policy, gender required). |
| R15 | — | **No text exists.** Owner-supply `R-DM-*`; never quoted. |
| D7 | `debt-log.md:33` | RULED 2026-08-21: entrant erasure = *scrub the PII, keep the rows*. Only the **Phase-10 account-deletion** half is open (must not be a bare `DELETE` over the live CASCADE). |
| D8 / F-E1 | `debt-log.md:34`; `2026-08-06-entries-design.md:1721-1729` | OPEN. Entry events map onto a **division** (MS), not a **slot** (MS1). Do not patch ad hoc; the spec owns the redesign. |
| F-E1-2 | `ENTRIES_PROGRESS.md:1186-1194` | **CLOSED** (`fc26f5a`, 2026-08-10) — roster rows key on `entry_player_id`. Cite the closure; never re-open. |
| D3 | `debt-log.md:29` **vs** `bracketMigration.ts:11` | Two different registers sharing a number — see the Task 1 record above. |
| L1 | `debt-log.md:51` | GDPR operator half open, incl. no story for PII on workspace state blobs. |
| ADR 0002 | `0002-...md:17` | Workspace control plane; the rename is confined to the UI facade. |
| ADR 0003 | `0003-...md:3,38` | Local store canonical — **partially superseded by ADR 0012**; the Supabase-mirror language is dead. |
| ADR 0006 | `0006-...md:53-59` | Match records deliberately **not merged**; no shared match/score value object — it would be dead, ornamental code. |
| ADR 0008 | `0008-...md:28` | One shared `ScoringFields`; field set identical by construction. |
| ADR 0009 | `0009-...md:32-41` | `Match` in `platform/domain/match.ts` is the one canonical cross-module match contract; the only engine-native→canonical seam is the two `opsBlock.ts` adapters. |
| ADR 0011 | `0011-...md:17` | Cross-product edges: classify, don't blanket-fix — accept / relocate / ratchet. |
| ADR 0014 | `0014-...md:35-54` | Fence it, don't rename. workspace ⟷ `tournaments` row ⟷ `/tournaments/{tournament_id}` ⟷ `tournamentStore`. Vocabulary is **not** a fragmentation finding. |

## Verification note

*(Task 9 appends the fresh-context spot-check result here.)*
