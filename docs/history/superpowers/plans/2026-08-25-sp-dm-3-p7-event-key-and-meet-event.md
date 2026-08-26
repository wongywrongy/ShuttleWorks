# SP-DM-3 — P7: One Event key, and a Meet Event — detailed plan

**Status:** authored 2026-08-25 against `main` @ `cd6d12b1` (pushed, CI green). Alembic head
`y9e4f0a2b7c8`. Program plan: `docs/history/superpowers/specs/2026-08-24-domain-model-unification-design.md`
§P7. Rulings: `docs/history/programs/DM1_RULINGS.md` (R-DM-5, R-DM-10, R-DM-11). Ledger:
`docs/history/programs/DM3_PROGRESS.md`.

**P7 is the last implementation slice of SP-DM-3, and the only one the program plan bands
`L — program-scale`.** Its inputs are all resolved: R-DM-5/10/11 are ruled, P0 is merged (so the
wire diff is machine-checked), and **F-DM-25 was closed 2026-08-25** by owner ruling
(`docs/reference/workspace-keys.md`). No other program's window is open.

---

## The headline judgment call: P7 is three slices, not one

**Controller: this is the call to overrule if you overrule nothing else here.**

The card describes one phase that carries a migration, a new entity, a wire policy, a server-side
port of client-side match generation, and **an operator surface that does not exist yet**. The
program's own rule is that *every phase leaves the system shippable*. One phase carrying all of that
is shippable only at the end. Split three ways, each part is shippable on its own day:

| Slice | Content | Band | Blocked by |
|---|---|---|---|
| **P7a — constraints and one engine authority** | 4 `CheckConstraint`s (F-DM-37), delete the two `or "meet"` fallbacks (F-DM-34), make a **published** `eventCode` unrenameable (R-DM-11(b) → F-DM-24, F-DM-57) | **S** | nothing |
| **P7b — a Meet Event, and the mapping** | `meet_events` (or a division-keyed versioned blob section) + a real mapping column; retires the invented `groupId`; F-DM-33's Meet Draw (F-DM-23, F-DM-24's Meet half) | **M–L** | P7a |
| **P7c — Meet lineup on the server, and slot assignment** | F-DM-08's server half; removes the client-side lineup construction; the operator-side slot-assignment surface R-DM-5 requires | **L** | P7b |

**P7a closes four of P7's seven findings, carries one additive migration, changes no wire shape and
adds no UI.** It is the part whose content is entirely *ruled* and whose risk is entirely *bounded*.
P7b and P7c are where the design work still is. Each gets **its own detailed plan authored at phase
start against the then-current tree**, per the program's standing convention — this document details
P7a fully and scopes the other two.

## The second judgment call: R-DM-11 means (b), and P7 does NOT re-key the public tier

The P7 card's "Code moves" line still reads *"public projections key by a stable key with
`eventCode` demoted to a label (R-DM-11)"* — which is **option (a)**. R-DM-11 ruled **(b) now**, with
(a) *"only if and when P7 gives Meet a real Event"*. P7b does give Meet a real Event, so the trigger
arguably fires — and the ruling's own rationale is the tiebreak: (b) is **one constraint**; (a) is a
two-tier re-key plus a redirect story. **Ruling for this plan: P7 ships (b). The re-key stays
deferred until a consumer needs the conversion** — which is also where F-DM-31/32 already sit ("open
until a consumer needs it"). Overruling this roughly doubles P7 and reopens a public-URL migration.

---

## What the tree says, measured 2026-08-25 (produced, not predicted)

Per the program rule learned over P9's six gate episodes: every count below was produced by running
the pattern against `main` @ `cd6d12b1`, not read out of the audit.

- **`CheckConstraint` in `apps/api/src`: 0.** F-DM-37 is exactly true — the schema has none at all.
- **`or "meet"`: 2 sites** — `entries/entries.py:165` (`(tournament.kind or "meet") == "bracket"`)
  and `workspaces/workspace_signals.py:603` (`getattr(row, "kind", "meet") or "meet"`). The card's
  deletion gate (`→ 0`) is reachable and both sites are one line each.
- **The four named CHECK columns all exist and are all bare `String`:** `tournaments.kind`
  (`db/models.py:123`, `String(20)`, default `"meet"`), `entries.state` (`:1566`, default
  `"pending"`), `matches.status` (`:219`, default `MatchStatus.SCHEDULED.value`),
  `tournament_members.role` (`:404`). **~24 short-`String` columns** are enum-shaped candidates
  overall; the card's "~19" is the right order, and the exact list is P7a Task 1's own measurement.
- **`rankCounts`: 3 real sites** (`core/schemas.py:118`, `entries/entries.py:485,493`) once
  `__pycache__` is excluded — a far smaller surface than the card implies.
- **`eventCode` / `event_code`: 102 sites across 33 files** (api + console + entrant + packages).
  The card's "Area 12: 120 files / 414 sites" counts the broader event-key area, not this token.
  **Under the (b) ruling P7 touches almost none of these** — that number is the price of the (a)
  re-key we are not doing.

### The Meet disconnect, re-verified in code rather than inherited from P5's note

Meet's intake cannot reach Meet's generation, **for two independent reasons**. P7b/P7c must fix both
or neither matters:

1. **Rank level.** `_plan_meet` writes `"ranks": [event.code]` — e.g. `"XD"`
   (`entries/entries.py:456`). The generator expands `config.rankCounts` into **numbered** ranks:
   `expandRanks({XD: 3}) → ["XD1","XD2","XD3"]` (`RegenerateMenu.tsx:24-30`) and then filters
   `(p.ranks ?? []).includes(rank)` (`:87,90`). `"XD" !== "XD1"`, so no committed entry ever matches.
2. **Group level.** `_plan_meet` sets `"groupId": event.code` and creates a group row of that name
   (`entries/entries.py:454,470`). The generator only ever pairs **across** groups
   (`for i … for j = i+1 …`, `RegenerateMenu.tsx:82-84`). Every entrant of one event lands in one
   group, so even with matching ranks they could not be paired with each other.

**Meet match generation lives in the console, not the server** (`RegenerateMenu.tsx`, a `useMemo`
producing `MatchDTO[]`). That is what F-DM-08's "server-route half" means, and it is why P7c is
banded L: it is a port, not an edit.

### One thing the card asserts that the code argues against

The card's **NC 3** wants "an empty `rankCounts` no longer accepts every code". The seam's own
docstring (`entries/entries.py:481-491`) argues the opposite, deliberately: *"An empty or missing
vocabulary declares nothing to contradict, so it accepts — refusing there would make the seam
unusable on a workspace whose configuration has not been filled in yet, which is exactly when public
entries arrive."* **Do not encode NC 3 as written.** Once P7b gives Meet real Event rows the question
changes shape — the vocabulary becomes "the Events this workspace declared" and the fallback becomes
"no Events yet", which is the same argument one layer up. **P7b decides it; P7a does not touch it.**
Flagged rather than swept, per the working practices.

---

# P7a — constraints and one engine authority (S)

**Resolves:** F-DM-37 (in the four named columns), F-DM-34, F-DM-24 + F-DM-57 (via R-DM-11(b)).
**Leaves shippable:** yes — additive constraints, no wire-shape change, no UI.

## Task 1 — Measure, then constrain the four columns (S)

- **Measure first.** Produce the distinct values actually stored in each of the four columns before
  writing any constraint. A `CHECK` over a value already on disk is a migration that fails on a
  director's laptop, not in CI. Record the produced list in the ledger.
- Add the `CheckConstraint`s in `db/models.py` **and** the Alembic revision **in the same commit**
  (F-DM-11's standing rule), down-revision `y9e4f0a2b7c8`.
- **SQLite reality:** `ALTER TABLE … ADD CONSTRAINT` does not exist there — use
  `op.batch_alter_table(...)`, which table-rebuilds. Every migration this program shipped is
  **SQLite-verified only**; P7a adds to that caveat rather than clearing it.
- **NC 1:** `INSERT tournaments(kind='banana')` is **rejected**. It succeeds today.
- **NC 2:** that control runs against a **migration-built** schema, not a `create_all` one —
  F-DM-11's rule, because the two can disagree.

## Task 2 — Delete the two `or "meet"` fallbacks (XS)

- `entries/entries.py:165` and `workspaces/workspace_signals.py:603`. With the CHECK in place `kind`
  cannot be null-or-empty, so the fallback is dead code that also silently **swallowed** a bad value
  — which is the F-DM-34 finding.
- **Deletion gate:** `grep -rn 'or "meet"' apps/api/src` → **0**. Produced count today: **2**.
- `_board_kind`'s `"hybrid"` answer **stays** — R-DM-10 makes it a UI-only notion, not a workspace
  kind. Do not delete it, and do not let it reach `tournaments.kind`.

## Task 3 — A published `eventCode` becomes unrenameable (S)

- R-DM-11(b). The rule is **published**, not "exists": an unpublished draft event may still be
  renamed, or directors lose a legitimate correction path.
- Enforce it in the **service** that owns event updates, not only in a DTO validator — a rule on one
  wire shape leaves every other caller free. Find the single write path first
  (`grep -rn "entry_events" apps/api/src`, then follow the update) and put the refusal where all
  callers route through. This is the root-cause placement, and it is also the smaller diff.
- **NC 3:** renaming a **published** event code is refused with a typed error; renaming an
  unpublished one still works.
- **NC 4:** every public URL and projection that resolves today still resolves afterwards — the
  property R-DM-11 is actually buying. Assert it; do not assume it.
- `entry_events.bracket_event_id` stays FK-less (R2). Do not touch it.

## Task 4 — Gate, route out, close the ledger (S)

- Full `make check` — **with `.venv/Scripts` on `PATH`**, or `ruff` is not found and the target dies
  at exit 2 for a purely environmental reason (2026-08-25 episode). Never read a pipeline's `$?` as
  the suite's verdict (`pytest | tail` reports **tail's** status) — read the summary line.
- Baseline to match: console 204/1840, entrant 37/760, depcruise 16w/0e, import-linter 15/0, pytest
  1923 passed / 66 skipped **plus this slice's new tests**. P7a *does* add tests, so pytest's count
  must go **up**, by exactly the number added — state the number.
- Record every finding this slice touches and every one it routes out, with reasons, in the ledger
  and `docs/reference/debt-log.md`.

---

# P7b — a Meet Event, and the mapping (M–L) — scoped, not detailed

Its plan is authored at phase start. What it must settle, all already visible:

- **Storage:** a `meet_events` table **or** a division-keyed section of the versioned blob. P2
  shipped blob version discipline, so the blob option is now legitimate rather than a shortcut — but
  only the table gives the mapping a **real column**, which R-DM-5 names explicitly.
- **The mapping is division-level, never slot-level** (R-DM-5): entry events map onto `MS`, never
  `MS1`. Slot assignment is P7c's operator action, not intake's.
- **Retire the invented `groupId`.** Today `_plan_meet` puts every entrant of one event into one
  group named after the event — a value invented to satisfy a required DTO field. With a real Event
  the grouping comes from the Event, and the "one school" artefact goes away.
- **F-DM-33:** a Meet Draw makes `draws: []` distinguishable from "not generated" for the first time.
- **Re-decide `_rank_vocabulary`** (the NC 3 question above) with Events as the vocabulary source.

# P7c — Meet lineup on the server, and slot assignment (L) — scoped, not detailed

- Port `RegenerateMenu`'s `useMemo` lineup construction to the server (F-DM-08's half). Doing it
  there is also what lets the two disconnects above be fixed in **one** place rather than two tiers.
- Build the **operator-side slot-assignment surface** R-DM-5 requires. It does not exist today and is
  the largest piece of net-new UI left in SP-DM-3.
- `_plan_meet` gets the side construction analogous to `_plan_bracket`'s. P5 shipped the Bracket half
  only, and its Meet half was cut precisely because a Meet pair field would have had **no reader**
  until this slice exists.

---

## Inherited constraints (verbatim, from the program plan and prior slices)

- **Produced, not predicted.** Every gate count is produced by running the pattern against the tree;
  no gate may be satisfiable by rewording a comment; citation gates scope to **every directory the
  tier owns**; a permanent doc may cite only permanent sources (`git check-ignore` is the test).
- **F-DM-11:** a column change and its Alembic revision land in the **same commit**, with a negative
  control against a **migration-built** schema.
- **Refactors do not change behavior.** If a test would have to change to keep passing, **stop and
  flag it** rather than editing the test.
- **All migration evidence in this program is SQLite-only.** Postgres is untested. Say so; do not
  quietly widen the claim.
- **Workflow:** `superpowers:subagent-driven-development`, opus subagents, tight contexts, per-task
  review, whole-branch review, one fix wave, ff-merge, ledger updated at slice close.
