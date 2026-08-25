# SP-DM-3 P5 — Pair survives intake

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** R-DM-4(a) — a doubles pair that two humans agreed to, and that the intake chain already recorded as a real mutual key (`entries.partner_entry_id`), stops being destroyed at the commit seam. `_plan_bracket` emits **one `TEAM` participant with real `member_ids`** for a both-halves-confirmed pair instead of two unrelated singletons; `partnerEntryId` reaches the operator wire (F-DM-35); the six answers to "is this event doubles?" collapse to one per tier (F-DM-13); and the doubles participant picker stops wiping the draw's existing participants — which is what would otherwise undo this slice on the operator's first click.

**Architecture:** One function changes shape. Everything downstream of `bracket_participants` **already round-trips a TEAM**: all three engine-`Participant` constructions in `bracket/brackets.py` (`:810`, `:1504`, `:2231`) carry `member_ids`, both persist paths write it back, and `ParticipantIn`/`ParticipantOut` have carried `members` since before Entries existed. The console picker mints TEAMs by hand today and the draw renders them. **The only thing in the product that refuses to build a team is the commit seam.** So P5's backend half is a pre-pass over `_plan_bracket`'s candidate loop and nothing else — no migration, no new table (R-DM-4 chose (a) over the `entry_pairs` table), no `brackets.py` edit, no re-key.

**Tech Stack:** FastAPI + SQLAlchemy (`apps/api/src`, sys.path root — imports are `from entries import …`), pytest (repo root, repo `.venv`), React+Vite console, vitest, React Router 7 SSR entrant tier.

**Spec:** program card §C5 (`docs/history/superpowers/plans/2026-08-24-sp-dm-3-domain-unification-program.md:56-57`) · ruling R-DM-4 + R-DM-4.x (`docs/history/programs/DM1_RULINGS.md:78-101`) · design doc §2 P5 (`docs/history/superpowers/specs/2026-08-24-domain-model-unification-design.md:153-161`) · audit F-DM-03/07/08/12/13/14/35/36 (`docs/history/audits/2026-08-24-domain-model-audit.md:450-489`).

**Branch:** `dm3/p5-pair-intake` off `main` @ `621325ab` (P4 merged; the branch already exists).

**Line numbers anchor to `621325ab`.** Re-anchor by symbol if the tree has moved.

---

## Global Constraints (inherited — read them, they bind every task)

The program plan's Global Constraints (`…-domain-unification-program.md:13-22`) apply verbatim. The ones that actually bite in P5:

- **I4: flags, never resolutions.** `pair_conflict` stays a `pending_reasons` member, never a 409, never an auto-resolve. Nothing in this slice merges, un-pairs, or re-pairs anything on its own. Where the seam cannot build a team it **declines to build one** — which is today's behavior, i.e. a refusal, not a decision.
- **Director manual pairing STAYS** (R-DM-4's ruling note). The picker path, `BracketPlayerFields.confirmPair`, and the hand-added TEAM are all load-bearing for half-accepted and hand-added pairs. Nothing here deletes them.
- **StrictModel same-commit rule.** A DTO field and the payload write that fills it land in the **same commit** (otherwise the seam's `_valid(...)` refuses the key and every commit becomes `INVALID_PLAYER`), with `make generate-api` regen in that commit, then `apps/console/src/api/dto.ts` reconciled **by hand**.
- **Parity ratchet cap stays 19.** `apps/console/src/api/__tests__/dtoParity.allowlist.json` is untouched; raising the cap (`dtoParity.test.ts:209`) is a ruling, not an implementation detail. P5 adds the same key to both sides of each pair, so no allow-list entry is created.
- **F-DM-11:** any FK reaching `models.py` lands with its migration in the SAME commit, negative control against **migration-built** schema. **P5 adds no FK and no migration** — R-DM-4(a) explicitly chose the no-table option. If a task starts to want one, STOP and report.
- **R2** (no FK on `entry_events.bracket_event_id`), **ADR 0006** (no match merge), **ADR 0014** (no renames), **R7/R13** (no hard contact unique index), **D7** (scrub, keep rows), **R-DM-7(a)** (no re-key of `bracket_participants.id`) — all stand untouched.
- Path-limited commits (`git commit -- <paths>`), never `git add .`. Gate the specific suite per task; `make check` at slice end (~15 min, both tiers).
- Backend list queries need the stable tiebreaker `created_at DESC, id DESC` (P5 adds no list query; the seam's `_candidates` already uses `submitted_at ASC, id ASC` and is not touched).
- **Standing program caveat:** all migration and FK evidence in this program to date is **SQLite only; Postgres is untested.** P5 carries no migration, so it adds nothing to that debt — but the ledger keeps saying it.

**Run commands:** backend `.venv\Scripts\python.exe -m pytest <path> -q` from the repo root (or `pytest` with the venv active). Console `npm --prefix apps/console run test:run -- <path filter>`; type gate `npm --prefix apps/console run build`. DTO regen: `PATH="$(pwd)/.venv/Scripts:$PATH" make generate-api`. Slice end: `make check`.

---

## Judgment calls this plan makes (controller: these are the ones to overrule if you disagree)

1. **The Meet half is cut to the `isDoubles` collapse. `_plan_meet` gets no "side construction" and no pair field.** This is the biggest deviation from the card and the one to overrule first if you disagree. Three legs, in ascending order of force:
   - The design doc's own resolve-lists put **F-DM-08 under P7**, not P5 (`…-design.md:153` P5 resolves F-DM-03/07/12/13/14-minting/35/36; `:191` P7 resolves F-DM-08/23/24/33/34/37/57). P5's prose mentions removing the client-side pairing; P7 owns the finding.
   - **`_plan_meet` writes a ROSTER, not sides.** There is no side in it to construct. A Meet side is `MatchDTO.sideA/sideB`, produced in the browser by `RegenerateMenu`. Moving that server-side needs the Meet Event that P7 builds (F-DM-23/33) — it is a new route, a new engine-discriminator, and a new server-side test surface, i.e. a second L-sized slice hiding inside this one.
   - **A pair field on the Meet roster would have no possible reader.** `_plan_meet` writes `groupId = event.code` and `ranks = [event.code]` (`entries/entries.py:418-419`), e.g. `"XD"`. `RegenerateMenu.expandRanks` (`:23-29`) only ever produces **numbered** ranks `XD1..XDn` from `config.rankCounts`, and the generator filters `(p.ranks ?? []).includes(rank)` (`:91,94`). `"XD" !== "XD1"`, so **no committed Meet entry can appear in a generated Meet match at all today** — paired or not. See "What the tree says that the card does not" §4; it is pinned in Task 1 and filed as a P7-owned debt row in Task 7.
   - **Under this scoping, "pair survives intake" is delivered for Bracket only.** Say that plainly in the ledger.
   - **Cost if overruled:** an additive optional `PlayerDTO.partnerPlayerId` written by `_plan_meet` from `partner_entry_id`, plus `RegenerateMenu` preferring the recorded partner over `.slice(0, needed)` filter order. ~S on top of this plan, no migration, no version bump — and **dead until P7 fixes the rank mapping.**

2. **A seam-built TEAM row carries `members[0]`'s person key, not two.** This keeps P4's ruled shape (ledger: "a doubles team row carries only `members[0]`'s key") rather than reopening it. It costs nothing here because for a **seam-built** team both `member_ids` entries are `roster_id(person)` strings (`entry-{personUuid}`), so **both person keys are recoverable from `member_ids` by construction** — the second half is not lost, only untyped. Per-member keys are R-DM-2(c)/P6 shape work. **Cost if overruled:** a `member_entry_player_ids` list on the participant row (a new column + migration, which R-DM-4(a) explicitly declined) or a `meta` key that dies on the first console echo (debt row `debt-log.md:75`).

3. **A one-directional `partner_entry_id` is detected by refusing to build the team, plus a `log.warning` — not by a new operator reason code.** The pre-pass has to ask "is `partner.partner_entry_id == entry.id`?" anyway to decide TEAM-vs-singleton, so the detection is free. No live code path can produce the state (`partners.accept()` writes both halves in one transaction; withdrawal touches neither pointer — verified), so minting operator vocabulary for it is speculative. **`pair_conflict` is deliberately NOT reused**: its documented meaning in both authorities (`partners.py:36-40`, `entryDisplay.ts:40-44`) is "the named partner is already spoken for", a different situation, and widening it would make the desk label lie. **Cost if overruled:** a `pair_broken` code across `entry_policy.py`, `entryDisplay.ts` (constant + `REASON_LABEL` + `ATTENTION`), `workspaces/entries_facts.py`, `workspaces/workspace_signals.py` and their tests — five vocabulary files for a state that cannot currently occur.

4. **The DoublesPicker `initialIds` debt row is IN scope** (`docs/reference/debt-log.md:96`), as its own cuttable task (Task 6). Rationale: P5 puts seam-built TEAM rows into doubles draws for the first time, and commit **replaces** the event's participant list — so an operator who opens a doubles draw, forms one hand-added pair and saves ends with **one** team, having silently destroyed every pair the seam just built. The card says manual pairing stays; a manual path that eats the automatic path is not "stays". **Cost if overruled:** P5's headline deliverable is undone by one operator click, and the debt row must be re-scoped to say so.

5. **No `BLOB_VERSIONS` flip.** P5 **fills** `bracket_participants.member_ids` with real ids; it does not **reshape** it. The value stays `list[str]`, which is exactly why it sits in the registry's "list-shaped" family (nowhere to put a `v` key without wrapping the value). Full answer in "Pickup (a)" below, with the one owed comment correction (Task 7 Step 1). **Cost if overruled:** wrapping `member_ids` in an object is a migration plus every reader in `brackets.py`, `local.py`, the engine and the console — a slice on its own, and R-DM-4(a) chose the no-migration option.

6. **The `isDoubles` collapse widens behavior on bracket surfaces, deliberately.** Replacing `['MD','WD','XD'].includes(ev.discipline)` with the suffix rule (`code.replace(/\d+$/,'').endsWith('D')`) means a director-defined discipline like `BD` is now doubles where it was singles. That is the convention `MeetEventsSection.tsx:15` already documents as the product rule, and the two rules agree on every shipped code. Characterized in Task 1 before the flip. **Cost if overruled:** keep the closed list as the bracket authority and the suffix rule as the meet authority — two functions in one file instead of one, and F-DM-13 closes at "two answers", not one.

7. **`entryPlayerId` on the desk wire is `partnerEntryId` alone — no `partnerName`, no `partnerAcceptedAt`.** The desk already holds every row of the workspace and can join by id for the name. **Cost if overruled:** two more denormalized fields on `EntryDeskRowDTO.from_row` and their `dto.ts` mirrors.

8. **`entries/partners.py::is_doubles` stays where it is and becomes the backend authority by import, not by relocation.** It is already the one backend answer (audit B1). Moving it to `entry_policy.py` for tidiness would be a rename with no consumer asking for it. **Cost if overruled:** a move + import updates in `partners.py`, `entries.py`, and any test that imports it.

---

## What the tree says that the card does not

Report these to the controller; they are facts, not deviations.

1. **The bracket TEAM round-trip already works end to end — only the seam refuses to build one.** All three engine-`Participant` constructions carry membership (`brackets.py:814` hydration, `:1512` from the wire, `:2235` for generation), both persist dicts write it back (`:1043`, `:2079-2080`, `:2364`), `ParticipantIn.members` / `ParticipantOut.members` have existed since before Entries, `_parse_participant_type` reads the stored `"TEAM"`, and the console mints and renders teams today. **P5's backend half touches `entries/entries.py` and nothing else.** The card's framing implies a wire change on the bracket side; there is none.

2. **F-DM-13's "four independent answers" is at least SIX, and the two extras are in a module the card never names.** Beyond `partners.py:81`, `helpers.ts:95-107`, the duplicate declaration at `RegenerateMenu.tsx:31-33`, and the `['MD','WD','XD']` list at `BracketDrawsTab.tsx:240` / `BracketPlayerFields.tsx:199-200` / `DrawDetailPanel.tsx:28`, there are **`xlsxExports.ts:66-67` (`isDoublesPrefix`, a fourth console declaration of `endsWith('D')`) and `xlsxExports.ts:275` (the same rule inlined)**. `BracketDrawsTab.tsx:221` also re-declares the discipline list a second time inside `commitPicks`. `EventsControl.tsx:49`'s `types: ['MD','WD']` is **excluded** — it is a filter grouping for a control's chip row, not an answer to "is this event doubles".

3. **The console has TWO pair-name mint sites, not one**, and the card names neither: `ParticipantPicker.tsx:177` (`${pickedA.name} / ${p.name}`) and `BracketPlayerFields.tsx:262` (`${player.name} / ${partner.name}`). **P5 adds a third, on the backend**, because `bracket_participants.name` is `NOT NULL` and a seam-built team needs a label. Consequence for the design doc's deletion gate — see §5.

4. **Meet's entry intake is disconnected from Meet's match generation at the rank level, and P5 cannot fix it.** `_plan_meet` commits a player with `groupId = event.code` and `ranks = [event.code]` (e.g. `"XD"`); `RegenerateMenu.expandRanks` only ever emits `"XD1".."XDn"` from `config.rankCounts` and matches with `includes(rank)`. `_rank_vocabulary` (`entries.py:443-458`) compares the event code against the rankCounts **prefixes**, so `"XD"` is mappable and commits — and then matches nothing. Every committed Meet entry is therefore invisible to "Regenerate from roster", pair or no pair. Additionally `groupId = event.code` puts **every entrant in one "school"**, and the generator only ever pairs *across* groups (`:88-89`), so even a numbered rank would yield zero matches. This is F-DM-23/33 (Meet has no Event) reaching further than the audit recorded. Pinned in Task 1 Step 3, filed as a P7-owned debt row in Task 7 Step 2.

5. **The design doc's P5 deletion gate `rg "split\(' / '\)|\$\{.*name\} / \$\{" apps/console/src` → 0 is unachievable and P5 makes the count go UP.** The card keeps director manual pairing, so a hand-added pair still needs a minted name; and the seam now mints one too. The honest gate is "**one mint per tier, in a named helper**" — see Task 3 Step 6 and Task 7 Step 3. The *decode* direction (`bracketMigration.ts:41-53`'s `split(' / ')` + positional zip) is P6's by the design doc's own text ("the five presentation-direction splits (F-DM-14) go at P6").

6. **R-DM-4.x's stated rationale is not what P2 delivered, and this is worth a ruling glance.** The mini-ruling deferred P5 until "after P2 gives `member_ids` a versioned home" (`DM1_RULINGS.md:97-99`). P2 instead **registered** `bracket_participants.member_ids` as `None` in `BLOB_VERSIONS` (`db/blob_version.py:126`) — an enumerated debt slot, not a version. The unblock still holds on the substance (the mechanism + inventory ratchet is P2's deliverable, every reader is first-party, and P5 changes no shape), but the register's wording overstates it. Flagged, not reopened.

7. **`ParticipantPicker.tsx:92-98` does not pass `initialIds` to `DoublesPicker` at all** — the prop is destructured at `:78` and simply not forwarded on the doubles branch, while `DrawDetailPanel.tsx:74` hands the doubles branch a literal `[]`. Two independent places to fix, not one. `DoublesPicker` also does not accept the prop (`:148-153`).

8. **`tests/backend/unit/test_entries_commit_seam.py::_entry_event` hardcodes `entry_type="singles"`** (`:116-127`) and `_entry` cannot link two entries. Every P5 backend test needs both widened; that is fixture work, not behavior change, and it lands in Task 1.

---

## Pickup (a) — the P2 blob-version question, answered explicitly

`db/blob_version.py:126` reads `"bracket_participants.member_ids": None,  # Pair membership; P5 reshapes`.

**P5 does not reshape it.** It **fills** it: `[]` becomes `["entry-{uuidA}", "entry-{uuidB}"]`. The stored type is `list[str]` before and after; every reader (`brackets.py:814`, `:1043`, `:2235`, `:2364`, the engine's `Participant.member_ids`, the console's `Participant.members`) reads it unchanged, and the console has been writing exactly this shape from the picker since before Entries. A bare list has nowhere to put a `v` key — which is the registry's own stated reason for the `None`, and the reason a flip would require wrapping the value in an object and rewriting every one of those readers.

So:
- **No `BLOB_VERSIONS` entry is flipped.** `tests/backend/unit/test_blob_version_inventory.py::test_the_tournament_document_is_the_one_wired_column_today` stays green, untouched.
- **No `tournaments.data` version bump.** P5 adds no field to `PlayerDTO` or `BracketPlayerDTO` (judgment call 1 cut the only candidate).
- **One correction is owed** (Task 7 Step 1): the comment says "P5 reshapes", and P5 came and went without reshaping it. Re-word to name what is actually true and who owns the reshape — the same move P4 Task 8 made for `side_a`/`side_b`/`dependencies`.
- **Two P2 traps recorded for anyone who does wire a column later** (not needed by this slice, kept here so they stay findable): `Tournament.id` is SQLAlchemy `Uuid` storing **32-char undashed hex** on SQLite, so a `str(row.id)` bind in `text()` matches zero rows — bind `row.id.hex`; and `tests/backend/_helpers.py::purge_backend_modules` needs `db.blob_version` in `_PURGE_EXEMPT` or `BlobVersionError` class identity breaks `pytest.raises`.

## Pickup (b) — the adjacent debt rows, ruled

- **`debt-log.md:96` — DoublesPicker ignores `initialIds`: IN.** Task 6. Reasoning in judgment call 4.
- **`debt-log.md:95` — the blob-vs-column agreement assertion: OUT.** Ruled at the P4 merge as **P6's**, with a specific edge attached (a P6 backfill must key the blob in the same pass or a roster re-save undoes it). P5 writes neither copy of that pair for a TEAM row — a seam TEAM has no `bracketPlayers` row of its own; its two members do, each already keyed by P4. Nothing in P5 changes the question. **Restated so it is decided, not discovered.**
- **`debt-log.md:75` — `ParticipantIn` has no `meta`: OUT, but P5 touches its blast radius.** A seam-built TEAM writes `meta.sourceEntryId` + `meta.partnerSourceEntryId`, and a console echo through the upsert drops both (the row's existing finding). Not new, not P5's to rule; Task 7 Step 2 adds one sentence to the row naming the pair provenance as a second casualty.

---

## File map (everything this slice may touch)

Backend:
- `apps/api/src/entries/entries.py` — `_plan_bracket` (:550-632), plus two new module-level helpers (`_pair_batch`, `team_id`/`team_name`).
- `apps/api/src/core/schemas.py` — `EntryDeskRowDTO` (:735-795) — one field, one `from_row` line, one stale docstring paragraph.
- `apps/api/src/db/blob_version.py` — one comment line (:126) + one line in the `None`-family note.

Console:
- `apps/console/src/lib/doubles.ts` — **new**, the one console authority.
- `apps/console/src/modules/meet/roster/positionGrid/helpers.ts` — `isDoubles`/`isDoublesRank` re-export from `lib/doubles.ts`.
- `apps/console/src/modules/meet/matches/RegenerateMenu.tsx` — delete the duplicate declaration (:31-33), import instead.
- `apps/console/src/modules/meet/exports/xlsxExports.ts` — `isDoublesPrefix` (:66-67) and the inline rule (:275).
- `apps/console/src/modules/bracket/BracketDrawsTab.tsx` (:221, :240), `BracketPlayerFields.tsx` (:199-200), `DrawDetailPanel.tsx` (:28).
- `apps/console/src/modules/bracket/ParticipantPicker.tsx` — forward `initialIds` to `DoublesPicker` (:92-98), seed `pairs` from existing teams (:153-167).
- `apps/console/src/modules/bracket/bracketLabels.ts` — `teamName(a, b)` helper (the one console mint).
- `apps/console/src/api/dto.generated.ts` (regenerated, never hand-edited), `apps/console/src/api/dto.ts` (`EntryDTO`).

Tests: `tests/backend/unit/test_entries_commit_seam.py`, `tests/backend/test_entries_desk_routes.py`, `tests/backend/test_dto_generated_freshness.py`, `apps/console/src/lib/__tests__/doubles.test.ts` (new), `apps/console/src/modules/bracket/__tests__/DrawDetailPanel.test.tsx`, `apps/console/src/modules/bracket/__tests__/BracketDrawsTab.test.tsx`, `apps/console/src/modules/meet/roster/__tests__/positionGrid.test.tsx`.

---

### Task 1: Characterize before touching (no production code) — **M**

Five pins. Every one either records behavior a later task deliberately changes, or records a gap P5 is **not** closing so that the ledger can name it honestly. **Nothing in this task edits `apps/`.** The card's loudest constraint is that this area has the thinnest test cover of any slice; this is the task that buys the right to restructure.

**Files:** `tests/backend/unit/test_entries_commit_seam.py`, `apps/console/src/lib/__tests__/doubles.test.ts` (new), `apps/console/src/modules/bracket/__tests__/DrawDetailPanel.test.tsx`.

- [ ] **Step 1: Widen the two fixtures.** In `tests/backend/unit/test_entries_commit_seam.py`:
  - `_entry_event` (:116-127) gains `entry_type="singles"` as a keyword parameter and passes it to the `EntryEvent(...)` construction instead of the hardcoded string.
  - `_entry` (:147-192) gains `partner_entry_id=None` and `partner_accepted_at=None` keyword parameters, passed through to `Entry(...)`.
  - Add one helper below `_entry`:

```python
def _pair(session, tournament_id, entry_event, *, names=("Ana Reyes", "Bo Lin")):
    """Two confirmed entries mutually linked, as ``partners.accept()`` leaves them.

    ``accept()`` writes ``partner_entry_id`` on BOTH halves inside one
    transaction (``entries/partners.py:265,272``); this helper reproduces
    that end state directly rather than driving the HTTP invite flow,
    because what the seam reads is the two columns, not how they got set.
    Returns ``(nominator, partner)`` in submission order.

    ``submitted_at`` is set EXPLICITLY and one second apart. The seam
    orders pair members by ``(submitted_at, id)`` and ``id`` is a random
    UUID, so two rows written microseconds apart would tie on the
    timestamp and order randomly - which would make every assertion about
    member order or the minted team name flaky.
    """
    now = datetime.now(timezone.utc)
    first = _entry(session, tournament_id, entry_event, player_name=names[0])
    second = _entry(session, tournament_id, entry_event, player_name=names[1])
    first.submitted_at = now
    second.submitted_at = now + timedelta(seconds=1)
    first.partner_entry_id = second.id
    second.partner_entry_id = first.id
    first.partner_accepted_at = now
    second.partner_accepted_at = now
    session.commit()
    return first, second
```

  (Add the `datetime`/`timezone`/`timedelta` imports if the file lacks them.)

- [ ] **Step 2: NC 1's "fails today" half — the pair is destroyed at the seam.** Add to the bracket section of the same file, after `test_a_bracket_entry_becomes_a_participant_and_a_roster_player` (:541):

```python
def test_a_confirmed_pair_TODAY_commits_as_two_unrelated_singletons(repo, session):
    """F-DM-03, characterized. ``_plan_bracket`` emits
    ``{"type": "PLAYER", "member_ids": []}`` for every entry regardless of
    ``entry_events.entry_type`` or ``entries.partner_entry_id``
    (``entries/entries.py:611-626``), so two humans who agreed to play
    together reach the draw as two strangers and a director re-mints the
    pair by hand as a name concatenation.

    THIS TEST IS EXPECTED TO CHANGE IN TASK 3 — that is the point of
    writing it now. The area has the thinnest test cover of any slice in
    this program (design doc §2 P5), so the flip has to be a visible edit
    against a recorded baseline, not a claim.
    """
```

Body: `_bracket_workspace`, `_draft_event(repo, tid, "XD")`, `_entry_event(session, tid, code="XD", bracket_event_id="XD", entry_type="doubles")`, `_pair(...)`, `commit_entries(repo, tid)`. Assert `len(participants) == 2`, `{p.type for p in participants} == {"PLAYER"}`, and `all(p.member_ids == [] for p in participants)`. Also assert the **roster blob** has two `bracketPlayers` rows — that half does **not** change in Task 3 and the assertion is what proves it.

- [ ] **Step 3: The Meet rank disconnect (the gap P5 is NOT closing).** Add to the Meet section:

```python
def test_a_committed_meet_entry_cannot_reach_a_generated_match(repo, session):
    """Recorded, not fixed — P7 owns it (see the P5 plan, "What the tree
    says that the card does not" §4).

    ``_plan_meet`` writes ``groupId = event.code`` and ``ranks =
    [event.code]`` (``entries/entries.py:418-419``), e.g. ``"XD"``. The
    only Meet match generator, ``RegenerateMenu.expandRanks``, expands
    ``config.rankCounts`` into NUMBERED ranks ``"XD1".."XDn"`` and filters
    players with ``(p.ranks ?? []).includes(rank)`` - and ``"XD" !=
    "XD1"``. It also pairs only ACROSS groups, while every committed
    entrant lands in the single group named for their event code. So a
    committed Meet entry is invisible to match generation whether or not
    it has a partner, which is why P5 does NOT put a pair field on the
    Meet roster: there is no reader for it until P7 gives Meet an Event.
    """
```

Assert the committed player's `ranks == ["XD"]` and `groupId == "XD"`, and assert that the expansion of the workspace's `config.rankCounts` (`{"XD": 2}` → `["XD1", "XD2"]`, computed in the test with a two-line local mirror of `expandRanks` and a comment saying it mirrors `RegenerateMenu.tsx:23-29`) **contains none of** the player's ranks. This is a pin of a *carried* gap: it is expected to stay green through P5 and to be flipped by P7.

- [ ] **Step 4: The console's six answers agree today on shipped codes and disagree off them.** New file `apps/console/src/lib/__tests__/doubles.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { isDoublesRank as meetRule } from '../../modules/meet/roster/positionGrid/helpers';

/** Characterization, SP-DM-3 P5 Task 1. F-DM-13 says "is this event
 *  doubles?" has four independent answers; the tree has SIX (the plan's
 *  stale-card §2). The two RULES behind them are the D-suffix rule and a
 *  closed `['MD','WD','XD']` list. They agree on every shipped code and
 *  disagree off it — which is exactly the behavior Task 2 widens, so it
 *  is recorded before it moves. */
const CLOSED_LIST = ['MD', 'WD', 'XD'];

describe('the doubles rules as they stand before P5', () => {
  it('agrees on every discipline the product ships', () => {
    for (const code of ['MS', 'WS', 'MD', 'WD', 'XD']) {
      expect(meetRule(code)).toBe(CLOSED_LIST.includes(code));
    }
  });

  it('DISAGREES on a director-defined code, and Task 2 takes the suffix rule', () => {
    expect(meetRule('BD')).toBe(true);
    expect(CLOSED_LIST.includes('BD')).toBe(false);
  });

  it('the meet rule strips the position digits and the closed list cannot', () => {
    expect(meetRule('XD2')).toBe(true);
    expect(CLOSED_LIST.includes('XD2')).toBe(false);
  });
});
```

(Import path from `lib/__tests__/` into `modules/meet/...` is a test-only reach and depcruise scopes its module rules to `src/modules/**` sources — if depcruise flags it, move this file to `apps/console/src/modules/meet/roster/__tests__/doublesRules.characterization.test.ts` and say so in the ledger rather than adding a rule exception.)

- [ ] **Step 5: The DoublesPicker wipes what is already entered.** In `apps/console/src/modules/bracket/__tests__/DrawDetailPanel.test.tsx`, beside the existing singles test *"opens holding the participants already entered in the draw"* (:86):

```typescript
it('TODAY drops every existing team when a doubles pair is committed', async () => {
  /* debt-log.md:96, characterized before SP-DM-3 P5 Task 6 fixes it.
     Commit REPLACES the event's participant list. The singles picker was
     taught to open holding what is already entered; the doubles half
     never was — `DrawDetailPanel.tsx:74` hands it a literal `[]` and
     `ParticipantPicker.tsx:92-98` does not forward `initialIds` at all.
     So an operator with four teams entered who forms one new pair saves
     ONE team. EXPECTED TO CHANGE IN TASK 6. */
});
```

Render the panel for a doubles event (`discipline: 'XD'`) whose `ev.participants` already holds two TEAMs with `members`, form one pair, save, and assert `onCommitPicks` was called with **one** pick. Copy the fixture shape from the existing *"carries the nominating player entryPlayerId onto a synthesized team"* test (:65).

- [ ] **Step 6: Run all five**

```
pytest tests/backend/unit/test_entries_commit_seam.py -q
npm --prefix apps/console run test:run -- src/lib/__tests__/doubles.test.ts
npm --prefix apps/console run test:run -- src/modules/bracket/__tests__/DrawDetailPanel.test.tsx
```

**Expected: ALL PASS.** These are characterization pins — a red one means the tree does not do what this plan believes, and that is a STOP-and-report, not a fix-forward.

- [ ] **Step 7: Commit**

```bash
git commit -m "test(dm3-p5): characterize the destroyed pair, the Meet rank disconnect, the six doubles rules, and the picker wipe" -- tests/backend/unit/test_entries_commit_seam.py apps/console/src/lib/__tests__/doubles.test.ts "apps/console/src/modules/bracket/__tests__/DrawDetailPanel.test.tsx"
```

**Record this commit's SHA.** Tasks 2, 3 and 6 cite it when they flip a pin.

---

### Task 2: One `isDoubles` authority per tier (F-DM-13) — **M**

**Files:** `apps/console/src/lib/doubles.ts` (new) · `apps/console/src/modules/meet/roster/positionGrid/helpers.ts` (:95-107) · `apps/console/src/modules/meet/matches/RegenerateMenu.tsx` (:31-33, :87, :114) · `apps/console/src/modules/meet/exports/xlsxExports.ts` (:66-67, :275) · `apps/console/src/modules/bracket/BracketDrawsTab.tsx` (:221, :240) · `BracketPlayerFields.tsx` (:199-200) · `DrawDetailPanel.tsx` (:28) · `apps/console/src/lib/__tests__/doubles.test.ts`.

**Interfaces:** produces `lib/doubles.ts::isDoublesCode(code: string): boolean` — the one console rule, taking either a bracket discipline (`"XD"`) or a meet rank (`"XD2"`). `helpers.ts` keeps `isDoubles`/`isDoublesRank` as **re-exports** so the ~15 meet call sites do not churn.

**Why `lib/` and not a module:** three modules consume it (meet, bracket, and via `EventsControl`'s neighbourhood the shared components). A bracket file importing meet's `helpers.ts` is a **new cross-module edge, which depcruise fails as an ERROR** (CLAUDE.md; ADR 0011/0013). `lib/` is the sorting rule's answer for consumer-count ≥ 2.

- [ ] **Step 1: Write the failing test.** Extend `apps/console/src/lib/__tests__/doubles.test.ts` with a second `describe`:

```typescript
describe('isDoublesCode — the one console authority (F-DM-13)', () => {
  it('answers the same question for a bracket discipline and a meet rank', () => {
    expect(isDoublesCode('XD')).toBe(true);
    expect(isDoublesCode('XD2')).toBe(true);
    expect(isDoublesCode('MS')).toBe(false);
    expect(isDoublesCode('MS1')).toBe(false);
  });

  it('takes the D-suffix convention, which WIDENS the bracket surfaces', () => {
    /* Deliberate behavior change, SP-DM-3 P5 judgment call 6, flipping the
       Task 1 pin at <TASK 1 SHA>. The three bracket surfaces asked
       `['MD','WD','XD'].includes(discipline)`; a director-defined `BD` was
       singles there and doubles everywhere else. The D-suffix convention is
       what `MeetEventsSection.tsx:15` already documents as the product rule,
       and the two answers agree on every shipped code. */
    expect(isDoublesCode('BD')).toBe(true);
  });

  it('is not fooled by a D that is not the discipline suffix', () => {
    expect(isDoublesCode('')).toBe(false);
    expect(isDoublesCode('DS')).toBe(false);
  });
});
```

- [ ] **Step 2: Run and verify it fails** — `npm --prefix apps/console run test:run -- src/lib/__tests__/doubles.test.ts`. Expected: the import of `isDoublesCode` does not resolve.

- [ ] **Step 3: Write the authority.** New `apps/console/src/lib/doubles.ts`:

```typescript
/**
 * "Is this event doubles?" — the console's one answer (F-DM-13).
 *
 * The audit found four independent answers; the tree carried SIX. Two
 * RULES were behind them: the D-suffix convention (`MD`, `WD`, `XD`, and a
 * director's own `BD`), declared verbatim in four places, and a closed
 * `['MD','WD','XD']` list, declared verbatim in four more. They agree on
 * every code the product ships and disagree on anything a director types,
 * which is the worst kind of duplication: correct in the demo, wrong in
 * the field, and silent either way.
 *
 * The suffix convention wins because it is the one the product already
 * DOCUMENTS as its rule (`platform/engine-config/MeetEventsSection.tsx`).
 * The digit strip is what lets one function serve both key spaces: a
 * bracket EVENT is keyed by discipline (`"XD"`), a meet POSITION by rank
 * (`"XD2"`), and they are the same question about the same event.
 *
 * The BACKEND's single answer is `entries/partners.py::is_doubles`, which
 * reads `entry_events.entry_type` — a column, not a string convention. The
 * two tiers cannot share one implementation because the console's bracket
 * surfaces never see an `entry_events` row; they see `BracketEventDTO`,
 * which carries `discipline` and no entry type. Closing THAT gap is P7's
 * one-Event-key work, not this function's.
 */
export function isDoublesCode(code: string): boolean {
  return code.replace(/\d+$/, '').endsWith('D');
}
```

- [ ] **Step 4: Route the meet sites.** In `helpers.ts` (:95-107), replace both bodies with re-exports and keep the existing docstrings, each gaining one line naming `lib/doubles.ts` as the authority:

```typescript
export { isDoublesCode as isDoubles, isDoublesCode as isDoublesRank } from '../../../../lib/doubles';
```

(Verify the relative depth against the file's own existing imports; do not guess it.) The digit strip is now unconditional, which is a no-op for `isDoubles(prefix)`'s callers — a prefix has no trailing digits. **In `RegenerateMenu.tsx`, delete `:31-33` outright** and import `isDoublesRank` from `../roster/positionGrid/helpers` the way `MatchDetailPanel.tsx:42` and `validateMatch.ts:17` already do (same module, no new cross-module edge). **In `xlsxExports.ts`, delete `isDoublesPrefix` (:66-67)**, import `isDoublesCode` from `../../../lib/doubles`, and replace the inline `prefix.endsWith('D')` at `:275` with a call.

- [ ] **Step 5: Route the three bracket sites** — `BracketDrawsTab.tsx:240` and `:221`, `BracketPlayerFields.tsx:199-200`, `DrawDetailPanel.tsx:28` all become `isDoublesCode(ev.discipline)` importing from `../../lib/doubles`. `BracketPlayerFields`' local `isDoublesEvent` wrapper (:199-200) is deleted; its one call site (:239) calls `isDoublesCode(ev.discipline)` directly.

- [ ] **Step 6: Run the console suites that touch it**

```
npm --prefix apps/console run test:run -- src/lib/__tests__/doubles.test.ts
npm --prefix apps/console run test:run -- src/modules/bracket
npm --prefix apps/console run test:run -- src/modules/meet
npm --prefix apps/console run build
npm run depcruise
```

Expected: all green, **depcruise warning count unchanged at 16** and **zero errors**. If a new ERROR appears, an import went module→module instead of module→`lib/`; fix the import, never the depcruise config.

- [ ] **Step 7: The backend's single answer gets a pin.** In `tests/backend/unit/test_entries_commit_seam.py`, beside `test_the_roster_id_prefix_has_exactly_one_definition` (:755) — the prior art for a source-reading gate:

```python
def test_the_backend_asks_entry_type_in_exactly_one_place():
    """F-DM-13's backend half. ``entries/partners.py::is_doubles`` is the
    one place ``entry_events.entry_type`` is compared to ``"doubles"``
    (audit B1). P5 adds a second CALLER (the commit seam) and no second
    RULE — read the sources and assert the comparison appears once."""
```

Read `entries/*.py` with `pathlib` and assert the literal `"doubles"` compared against an `entry_type` appears only in `partners.py`. Keep the matcher narrow enough that a docstring mentioning the word does not trip it (match on the comparison, not the bare string), and say so in a comment.

- [ ] **Step 8: Run + the deletion gate**

```
pytest tests/backend/unit/test_entries_commit_seam.py -q
rg "endsWith\('D'\)" apps/console/src
rg "\['MD', 'WD', 'XD'\]" apps/console/src
```

Expected: **one** hit for the first (inside `isDoublesCode`) and **zero** for the second. Note that `rg isDoublesRank` still shows two files by design — `helpers.ts` re-exports so ~15 meet call sites do not churn — so the honest gate is the rule, not the name. Say so in the ledger.

- [ ] **Step 9: Commit**

```bash
git commit -m "refactor(console,entries): one isDoublesCode authority replaces six answers (F-DM-13)" -- apps/console/src/lib/doubles.ts "apps/console/src/lib/__tests__/doubles.test.ts" apps/console/src/modules/meet/roster/positionGrid/helpers.ts apps/console/src/modules/meet/matches/RegenerateMenu.tsx apps/console/src/modules/meet/exports/xlsxExports.ts apps/console/src/modules/bracket/BracketDrawsTab.tsx apps/console/src/modules/bracket/BracketPlayerFields.tsx apps/console/src/modules/bracket/DrawDetailPanel.tsx tests/backend/unit/test_entries_commit_seam.py
```

---

### Task 3: The seam builds the team (F-DM-03, F-DM-07, F-DM-12) — **L**

The heart of the slice, and it touches **one file**. Everything downstream already round-trips a TEAM (stale-card §1); the seam is the only thing that refuses to build one.

**Files:** `apps/api/src/entries/entries.py` (`_plan_bracket` :550-632, two new helpers) · `tests/backend/unit/test_entries_commit_seam.py`.

**Interfaces:** produces
- `entries.entries.team_id(person_ids: tuple[uuid.UUID, uuid.UUID]) -> str` — deterministic participant id for a seam-built pair.
- `entries.entries.team_name(name_a: str, name_b: str) -> str` — the backend's one pair-label mint.
- `_pair_batch(candidates) -> dict[uuid.UUID, Entry]` — entry id → its partner entry, for pairs that pass the predicate.

**The predicate, stated once so no step re-decides it.** Two entries become one TEAM when **all** of:
1. both are in this run's `candidates` list (so both are `confirmed` and both have `committed_player_id IS NULL` — `_candidates`, :185-194);
2. `a.partner_entry_id == b.id` **and** `b.partner_entry_id == a.id` (mutual — the invariant `db/models.py:1569-1573` documents and nothing enforces);
3. both carry `partner_accepted_at` (a human agreed; a nomination alone is not a pair);
4. `entry_events.entry_type` is `"doubles"` for their event, via `partners.is_doubles(event)`;
5. both map to the same editable bracket draw (guaranteed by construction — both carry the same `entry_event_id` — but re-checked because the draw-status skip runs per entry);
6. **both roster payloads pass `_valid(BracketPlayerDTO, …)`** — checked for BOTH halves before the team is emitted, never per-iteration (see Step 5's blocker note);
7. **neither member is already a participant in that draw** — the director may have hand-added one of them through the picker before the other's entry confirmed.

**Any failure → both halves commit as PLAYER singletons, exactly as today.** That is the card's NC 2 and it is a refusal, not a decision (I4). Enumerate the failure modes as tests; the common one is **(1)**: the partner was committed on an earlier run, so it is not a candidate, so this half commits as a singleton and the operator pairs by hand. Director manual pairing stays for exactly this.

**Two invariants that must survive.** `entry.committed_player_id` stays the **per-person roster id** (`_player_id(entry)`), never the team id — it is the back-reference to a `bracketPlayers` row, and both halves keep their own. And the roster blob still gets **two** rows for a pair, one per human, because that is where remarks and availability live. The consequence: `participant_id == roster_id` stops being universally true, and `test_a_bracket_entry_becomes_a_participant_and_a_roster_player`'s closing `entry.committed_player_id == participants[0].id == roster[0]["id"]` chain now holds only for singles. Leave that test alone (it is a singles test) and say this in the new tests' docstrings.

- [ ] **Step 1: Write the failing tests.** In `tests/backend/unit/test_entries_commit_seam.py`, bracket section. Five, and the first is the Task 1 pin inverted:

```python
def test_a_confirmed_pair_commits_as_ONE_team_with_real_member_ids(repo, session):
    """NC 1 (P5 card) — the flip of ``test_a_confirmed_pair_TODAY_commits_
    as_two_unrelated_singletons`` (characterized at <TASK 1 SHA>).

    R-DM-4(a): the intake chain already holds a real mutual key
    (``entries.partner_entry_id``, written on BOTH halves at acceptance),
    so the seam does not have to match names the way the incumbent
    products do — it can build the team from the key it was given. One
    ``TEAM`` participant, two ``member_ids``, and the two humans still get
    one roster row each because that is where remarks and availability
    live.
    """
```

Assert: exactly **one** participant row; `type == "TEAM"`; `member_ids == [roster_id(first.entry_player_id), roster_id(second.entry_player_id)]` in nominator-first order; `name == "Ana Reyes / Bo Lin"`; **two** `bracketPlayers` rows; both entries' `committed_player_id` equal to their own `_player_id`, i.e. **not** the team id.

```python
def test_a_half_accepted_pair_commits_as_a_singleton_and_nothing_dangles(repo, session):
    """NC 2 (P5 card). Only one half is confirmed-and-uncommitted, so
    there is no pair to build. It commits exactly as it does today — one
    ``PLAYER``, one roster row, one back-reference — and NOTHING points at
    a partner that is not there: no TEAM with one member, no member id
    naming a roster row that does not exist. The designed state
    (``entries/partners.py:28-34`` — unpartnered is ``pending`` with
    ``awaiting_partner``, not over-cap and not refused) survives untouched.
    """
```

Drive it by leaving the partner entry in `pending`. Assert one `PLAYER`, `member_ids == []`, and that the partner's entry still has `committed_player_id is None`.

```python
def test_a_partner_already_committed_alone_leaves_the_second_half_a_singleton(repo, session):
    """The common upgrade path, and the reason director manual pairing
    STAYS (R-DM-4's ruling note). A pair whose halves were confirmed on
    different days: the first ran through the seam as a PLAYER before its
    partner confirmed, so on the second run there is no candidate to pair
    with and the seam declines rather than rewriting a participant row
    that a draw may already reference. Two PLAYERs, and the director pairs
    them in the picker.
    """
```

```python
def test_a_one_directional_partner_link_is_detected_and_no_team_is_built(repo, session):
    """NC 4 (P5 card). ``partner_entry_id`` is mutual by WRITE CONVENTION
    only (F-DM-12): no FK, no constraint, nothing that detects a
    half-written link. ``partners.accept()`` writes both halves in one
    transaction and withdrawal touches neither, so this state is not
    reachable from live code — it is constructed here by hand, which is
    the only way to assert that the seam notices.

    Detection is the seam refusing to build the team and saying so in the
    log, NOT a new operator reason code: ``pair_conflict`` means "the
    named partner is already spoken for" (``entries/partners.py:36-40``)
    and would be a lie here. See the plan's judgment call 3.
    """
```

Build the pair, then clear `second.partner_entry_id` before committing. Assert two `PLAYER` rows, and capture the warning with `caplog` asserting the entry ids appear in the message.

```python
def test_a_singles_event_never_builds_a_team_even_with_a_partner_link(repo, session):
    """The predicate's fourth leg. ``entry_events.entry_type`` is the
    backend's one answer to "is this doubles" (``partners.is_doubles``,
    F-DM-13), and a stray ``partner_entry_id`` on a singles event is data
    the seam must not act on."""


def test_a_half_that_fails_validation_leaves_a_singleton_and_no_dangling_team(
    repo, session
):
    """NC 2's sharp edge, and the reason leg 6 checks BOTH halves.

    ``_valid(BracketPlayerDTO, ...)`` runs per entry inside the loop, and
    the nominator is processed FIRST. Without a both-halves check the
    nominator would emit a TEAM naming a member whose own iteration then
    fails validation and writes no ``bracketPlayers`` row - a team
    pointing at a roster row that does not exist, an entry that never
    commits, and a re-run that cannot repair it because the team id is
    already in ``existing_ids``. The valid half must commit as a
    singleton instead.
    """


def test_a_member_already_entered_by_hand_is_not_double_entered_as_a_team(
    repo, session
):
    """The predicate's seventh leg. The director may hand-add one half
    through the participant picker before the other half's entry is
    confirmed. Emitting a TEAM then would put one human in the draw
    TWICE - once inside the team, once as their surviving PLAYER row -
    and un-adding the PLAYER row is a decision the seam does not get to
    make (I4). Both halves commit as singletons; the director pairs them.
    """
```

- [ ] **Step 2: Run and verify they fail**

```
pytest tests/backend/unit/test_entries_commit_seam.py -q -k "ONE_team or half_accepted or already_committed_alone or one_directional or singles_event_never"
```
Expected: the first fails on two participants instead of one; the "no team" ones may pass already (they pin the status quo — that is fine, they are the guard rails against over-eager pairing).

- [ ] **Step 3: The two mints.** In `entries/entries.py`, immediately below `roster_id` (:223):

```python
def team_id(person_ids: tuple[uuid.UUID, uuid.UUID]) -> str:
    """The deterministic participant id for a seam-built doubles pair.

    Deterministic for the same reason ``_player_id`` is: this seam is
    RE-RUNNABLE by design (module docstring, spec Q3), and a partially
    applied run has to be recognizable on the next one. A random id would
    make every re-run mint a second team for the same two people.

    Not ``roster_id`` of anything: a team is not a person and must never
    collide with one. Not the console's ``{eventId}-T{n}`` either - that
    numbering depends on how many teams already exist, which is exactly
    the kind of position-dependence a re-runnable seam cannot have. The
    two person UUIDs in member order are 78 characters, inside
    ``BracketParticipant.id``'s String(100) and inside ``Identifier``.
    """
    return f"team-{person_ids[0]}-{person_ids[1]}"


def team_name(name_a: str, name_b: str) -> str:
    """The backend's one pair-label mint.

    ``bracket_participants.name`` is NOT NULL, so a team needs a label and
    P5 therefore ADDS a mint rather than deleting one - the design doc's
    "-> 0" deletion gate for the minting direction is unachievable while
    director manual pairing stays (R-DM-4's ruling note). What P5 can
    honestly deliver is that nothing has to DECODE this label: for a
    seam-built team ``member_ids`` carries the two ``entry-{uuid}`` roster
    ids, so membership is data. Deleting the decode
    (``bracketMigration.ts:41-53``'s split-and-zip) is P6's, per the design
    doc's own text.

    The separator matches the console's two mint sites
    (``ParticipantPicker`` and ``BracketPlayerFields``) so one draw does
    not render two spellings of the same idea.
    """
    return f"{name_a} / {name_b}"
```

- [ ] **Step 4: The pre-pass.** Above `_plan_bracket` (:550):

```python
def _pair_batch(
    candidates: list[Entry],
    events: dict[uuid.UUID, EntryEvent],
) -> dict[uuid.UUID, Entry]:
    """Entry id -> its partner entry, for the pairs this run may build.

    R-DM-4(a): a pair is built only from the mutual key the intake chain
    already wrote, never from matching names. That is the whole reason
    this is safe where the incumbent products' name matching is not - and
    it is the same "auto-link what is certain, flag the rest" shape as the
    2026-08-23 minting ruling (see R-DM-4's rationale).

    Every leg of the predicate is a REFUSAL to pair, never a decision to
    un-pair: a candidate that fails any of them commits exactly as it does
    today, as a singleton, and the director pairs it by hand (the ruled
    manual path stays). The legs:

    1. both halves are in THIS run's candidate list - so both are
       ``confirmed`` and neither is on the roster yet;
    2. the link is MUTUAL. It is mutual by write convention only (F-DM-12:
       no FK, nothing detects a half-written link), so the seam checks
       rather than trusts, and logs when it finds one;
    3. both carry ``partner_accepted_at`` - a nomination is not a pair;
    4. the event takes pairs, asked through the backend's ONE answer
       (``partners.is_doubles``, F-DM-13).

    Member order is the nominator first: earlier ``submitted_at``, ``id``
    as the tiebreaker for the same reason ``_candidates`` uses it. Order
    is load-bearing twice over - it fixes ``team_id`` so a re-run is
    idempotent, and it fixes which half's person key the row carries.
    """
    from entries.partners import is_doubles

    by_id = {entry.id: entry for entry in candidates}
    pairs: dict[uuid.UUID, Entry] = {}
    for entry in candidates:
        partner_id = entry.partner_entry_id
        if partner_id is None or entry.id in pairs:
            continue
        partner = by_id.get(partner_id)
        if partner is None:
            continue
        if partner.partner_entry_id != entry.id:
            log.warning(
                "entries: one-directional partner link between %s and %s; "
                "committing both as singletons (F-DM-12)",
                entry.id,
                partner_id,
            )
            continue
        if entry.partner_accepted_at is None or partner.partner_accepted_at is None:
            continue
        event = events.get(entry.entry_event_id)
        if event is None or not is_doubles(event):
            continue
        first, second = sorted(
            (entry, partner), key=lambda e: (e.submitted_at, e.id)
        )
        pairs[first.id] = second
        pairs[second.id] = first
    return pairs
```

**Note for the executor:** `entry.submitted_at` may be `None` on hand-built rows; if the sort raises in any existing test, key on `(e.submitted_at or e.id, e.id)` and say so in the ledger rather than making the column non-nullable.

- [ ] **Step 5: Wire `_plan_bracket`.** Compute `pairs = _pair_batch(candidates, events)` once above the loop (:564). Inside the loop, after `participant_id = adopted or _player_id(entry)` (:584), the roster-blob half is **unchanged** — both halves still get their own `bracketPlayers` row and their own `committed_player_id`. Only the `inserts` block (:610-627) changes.

**Blocker the executor must not walk into.** Legs 6 and 7 are **not** satisfied by the loop's own per-entry checks, and a first draft of this plan wrongly said they were. The nominator is processed **first**, so:
- if the partner's payload later fails `_valid`, the nominator has already emitted a TEAM naming a member with no `bracketPlayers` row — a dangling team, an entry that never commits, and a re-run that cannot repair it because the team id is already in `existing_ids`. **NC 2's "nothing dangles", violated.**
- if the partner is **already** a participant (hand-added through the picker before this entry confirmed), the TEAM puts one human in the draw twice.

So: extract the roster payload construction (:594-602) into a module-level `_bracket_payload(entry) -> dict` used by both the loop and the pair branch, and check both halves **before** emitting the team. `existing_ids` is loaded lazily per event inside the loop, so leg 7 **cannot** live in `_pair_batch` — it belongs here.

```python
        partner = pairs.get(entry.id)
        if partner is not None and not (
            # Leg 6: BOTH payloads must project onto the roster DTO. The
            # loop validates one entry at a time and the nominator runs
            # first, so without this the team could name a member whose
            # own iteration is about to be skipped.
            _valid(BracketPlayerDTO, _bracket_payload(partner), partner)
            # Leg 7: neither half may already be in this draw. A
            # hand-added PLAYER row for one of them is the director's, and
            # removing it to make room for a team is not the seam's call
            # (I4).
            and _player_id(entry) not in existing_ids[event.bracket_event_id]
            and _player_id(partner) not in existing_ids[event.bracket_event_id]
        ):
            partner = None  # fall through to the singleton insert
        if partner is not None:
            # R-DM-4(a): ONE participant for the pair. The roster blob
            # above still carries both humans - remarks and availability
            # are per-person - so this is the only place the two collapse.
            members = sorted(
                (entry, partner), key=lambda e: (e.submitted_at, e.id)
            )
            person_ids = tuple(m.entry_player_id or m.id for m in members)
            insert_id = team_id(person_ids)
            insert = {
                "id": insert_id,
                "name": team_name(members[0].player_name, members[1].player_name),
                "type": "TEAM",
                # ``roster_id`` of each person, which is what the roster
                # blob keys its rows by and what the console's own
                # hand-built teams put here. Both person keys are therefore
                # recoverable from this list, which is why the row carrying
                # only members[0]'s typed key (P4's ruled shape) loses
                # nothing - see the plan's judgment call 2.
                "member_ids": [roster_id(pid) for pid in person_ids],
                "entry_player_id": members[0].entry_player_id,
                "seed": None,
                "meta": {
                    "sourceEntryId": str(members[0].id),
                    "partnerSourceEntryId": str(members[1].id),
                },
            }
        else:
            insert = { ...today's PLAYER dict, unchanged... }
        if insert["id"] not in existing_ids[event.bracket_event_id]:
            inserts.setdefault(event.bracket_event_id, []).append(insert)
            existing_ids[event.bracket_event_id].add(insert["id"])
        planned.append((entry, participant_id))
```

Three things the executor must not get wrong:
- **`planned` still appends `participant_id`, the per-person roster id.** Not `insert_id`. The back-reference is to the roster row.
- **The `existing_ids` dedupe now keys on `insert["id"]`**, which is what makes the second half of the pair a no-op on the same run and the whole pair a no-op on a re-run.
- **`existing_ids[event.bracket_event_id]` must be loaded before the leg-7 check reads it.** It is populated at :586-592, above the payload block — verify the ordering survives the edit, because a `KeyError` here would be a loud failure and a silently-empty set would be a quiet one.
- **`_bracket_payload` is an extraction, not a behavior change.** It returns the exact dict at :594-602 (`id`, `name`, `availability`, `sourceEntryId`, `entryPlayerId`, plus `remarks` when set). The loop keeps calling `_valid` on its own entry's payload as it does today; the pair branch calls it on the *partner's*. Do not collapse the two calls or cache the result — a partner that is also a candidate gets validated in its own iteration anyway, and one extra `model_validate` per pair is not worth a cache.

- [ ] **Step 6: Run**

```
pytest tests/backend/unit/test_entries_commit_seam.py -q
pytest tests/backend -q
```

Expected: the five new tests pass, the Task 1 pin `test_a_confirmed_pair_TODAY_commits_as_two_unrelated_singletons` **fails** — delete it in this commit, citing its Task 1 SHA in the replacement test's docstring (already written in Step 1). Nothing else moves. The full sweep is not optional: `_plan_bracket` is on the path of every entries route and both `test_entries_desk_routes.py` and the simulator's fixtures reach it. **If an existing test reddens, do not edit its assertion to match** — bring it to the controller with the diff.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(entries): a confirmed pair commits as one TEAM with real member_ids (R-DM-4a, F-DM-03/07/12)" -- apps/api/src/entries/entries.py tests/backend/unit/test_entries_commit_seam.py
```

---

### Task 4: `pair_conflict` still only flags (NC 3) — **S**

**Files:** `tests/backend/test_partner_invites.py` only. **No production code.** This is the card's NC 3, and the point of the task is to prove that P5 did not turn a flag into a refusal anywhere.

- [ ] **Step 1: Write the test.** Append to `tests/backend/test_partner_invites.py`:

```python
def test_a_pair_conflict_still_only_flags_after_the_seam_builds_teams(
    client, world, mailbox
):
    """NC 3 (P5 card) — invariant I4, re-asserted at the point where P5
    made it easiest to break.

    P5 taught the commit seam to act on ``partner_entry_id``. The
    temptation that creates is to make the seam ADJUDICATE an ambiguous
    pairing rather than decline it: two entrants naming the same partner
    is precisely the case where a program can "helpfully" pick one. It
    must not. Both halves still carry ``pair_conflict``, both entries are
    still LIVE, the acceptance still returns 200, and the seam builds
    nothing it was not certain about.
    """
```

Drive the existing conflict fixture in this file (`rg "pair_conflict" tests/backend/test_partner_invites.py` — reuse it, do not build a second one). Assert the acceptance is **200**, both halves carry `pair_conflict`, and neither is refused. Then run `commit_entries` over the workspace and assert the flagged entries produced **no** TEAM participant — the conflicted pairing is not something the seam pairs on. If the fixture's entries are not `confirmed`, confirm them through the file's own lifecycle helper rather than setting the column by hand.

- [ ] **Step 2: Run**

```
pytest tests/backend/test_partner_invites.py -q
```
Expected: green. If the conflict path 409s or auto-resolves anywhere, that is an I4 violation and a STOP-and-report.

- [ ] **Step 3: Commit**

```bash
git commit -m "test(entries): pair_conflict still only flags after the seam builds teams (I4, P5 NC 3)" -- tests/backend/test_partner_invites.py
```

---

### Task 5: `partnerEntryId` on the operator wire (F-DM-35) — **S**

**Files:** `apps/api/src/core/schemas.py` (`EntryDeskRowDTO` :735-795) · `apps/console/src/api/dto.generated.ts` (regen) · `apps/console/src/api/dto.ts` (`EntryDTO`) · `tests/backend/test_entries_desk_routes.py`.

**The StrictModel same-commit rule applies:** the Pydantic field, `from_row`, the regenerated `dto.generated.ts` and the hand-reconciled `dto.ts` all land in **one** commit. `tests/backend/test_dto_generated_freshness.py` reddens on the Pydantic edit before any mirror is touched — that oracle is what forces the regen.

- [ ] **Step 1: Write the failing test.** In `tests/backend/test_entries_desk_routes.py`, beside the existing person-key test (`rg "entryPlayerId" tests/backend/test_entries_desk_routes.py` — reuse its helpers, auth headers and route shape verbatim):

```python
def test_a_desk_row_carries_its_partner_link(client, world, mailbox):
    """F-DM-35: the desk had ZERO pair shapes. ``partner`` against
    ``core/schemas.py`` returned nothing, and this DTO's own docstring
    still said the doubles columns "mean nothing until E3" — which
    shipped. So the operator surface for entries could neither show a
    pairing nor act on one, while the backend held a real mutual key.

    One field, not four: the desk already holds every row of the
    workspace, so a name is a join it can do itself (plan judgment call 7).
    """
```

Assert `row["partnerEntryId"]` equals the partner entry's id on both halves, and that a singles row carries `None`.

- [ ] **Step 2: Run and verify it fails** — `pytest tests/backend/test_entries_desk_routes.py -q -k partner_link`. Expected: `KeyError: 'partnerEntryId'`.

- [ ] **Step 3: The field.** In `EntryDeskRowDTO`, after `entryPlayerId` (:768):

```python
    # F-DM-35 / R-DM-4(a): the operator wire's FIRST pair shape. The
    # column has existed since E3 and reached exactly two public
    # projections, both of which only rendered a name string (F-DM-07) -
    # the desk, which is where an operator would act on a pairing, could
    # not see it at all. Null for a singles entry and for a doubles entry
    # whose partner has not accepted.
    partnerEntryId: Optional[str] = None
```

and in `from_row`, beside the `entryPlayerId` line:

```python
            partnerEntryId=str(row.partner_entry_id) if row.partner_entry_id else None,
```

- [ ] **Step 4: Delete the stale docstring paragraph.** `EntryDeskRowDTO`'s class docstring (:738-741) says *"The doubles columns are deliberately absent: they exist in the schema (created now to avoid migration churn) but mean nothing until E3 and would read as broken features."* E3 shipped, and P5 just made the pairing real. Replace with one sentence naming what is now carried and what is deliberately not (the partner's name, joinable client-side).

- [ ] **Step 5: Regenerate + reconcile, same commit.**

```
PATH="$(pwd)/.venv/Scripts:$PATH" make generate-api
```

Then by hand in `apps/console/src/api/dto.ts`, `EntryDTO`, after `entryPlayerId`:

```typescript
  /** The other half of this doubles pair (`entries.partner_entry_id`),
   *  written on BOTH halves at acceptance. Null for singles and for a
   *  nomination nobody has accepted. The partner's NAME is a join the desk
   *  already holds every row for — F-DM-35 was the key not being on the
   *  wire, not the name. */
  partnerEntryId: string | null;
```

- [ ] **Step 6: Run everything the wire touches**

```
pytest tests/backend/test_dto_generated_freshness.py tests/backend/test_entries_desk_routes.py -q
npm --prefix apps/console run test:run -- src/api/__tests__/dtoParity.test.ts
npm --prefix apps/console run build
```

Expected: green, and `dtoParity.allowlist.json` **untouched** with the cap still at 19 — both sides of the pair gain the same key, so no allow-list entry is created.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(entries): desk rows carry partnerEntryId; the operator wire gets its first pair shape (F-DM-35)" -- apps/api/src/core/schemas.py apps/console/src/api/dto.generated.ts apps/console/src/api/dto.ts tests/backend/test_entries_desk_routes.py
```

---

### Task 6: The doubles picker stops eating the seam's teams (`debt-log.md:96`) — **M**

**Files:** `apps/console/src/modules/bracket/ParticipantPicker.tsx` (:92-98, :148-167) · `apps/console/src/modules/bracket/DrawDetailPanel.tsx` (:74) · `apps/console/src/modules/bracket/bracketLabels.ts` (`teamName` helper) · `apps/console/src/modules/bracket/__tests__/DrawDetailPanel.test.tsx`.

**Why this is P5's and not a stray Boy-Scout fix.** Commit **replaces** the event's participant list (`BracketDrawsTab.commitPicks` :237-267). Until this slice, a doubles draw's participants were whatever the operator last picked, so the wipe cost them their own earlier picks — bad, but self-inflicted and visible. From Task 3 onward the seam puts teams there, and the first hand-added pair silently destroys every one of them. Judgment call 4.

**The shape the debt row describes:** a doubles `initialIds` would carry **team** ids while the picker's list and its `unavailable` set are keyed on **player** ids. So the seed is not an id list — it is a list of `PickedPair`s reconstructed from the event's existing TEAM participants, all three fields of which (`{id, name, members}`) are already on `ev.participants`.

- [ ] **Step 1: Write the failing tests.** In `DrawDetailPanel.test.tsx`, rewrite the Task 1 pin (cite its SHA):

```typescript
it('opens holding the teams already entered in the draw', () => {
  /* debt-log.md:96, closed by SP-DM-3 P5 Task 6. The flip of
     "TODAY drops every existing team when a doubles pair is committed"
     (characterized at <TASK 1 SHA>). Commit REPLACES the participant
     list, so a picker that opens empty is a delete button wearing a save
     label — and from P5 onward the rows it deletes are the ones the
     entries commit seam built from two humans' agreement. */
});

it('adds a new pair to the existing ones rather than replacing them', () => {});

it('numbers a new team past the highest existing suffix', () => {
  /* `nextTeamId` (rosterEvents.ts:136) already generalizes the picker's
     `{eventId}-T{n}` rule to max-suffix + 1 so a removed pair's number is
     never reused. Seeding from existing teams is what makes that
     generalization reachable from this surface for the first time. */
});
```

Plus one for the seam's own id shape:

```typescript
it('keeps a seam-built team whose id is not the picker numbering', () => {
  /* The commit seam mints `team-{uuidA}-{uuidB}` (entries/entries.py
     ::team_id) — deterministic, because that seam is re-runnable. It does
     NOT match `{eventId}-T{n}`, so the seed must carry ids through
     verbatim rather than re-deriving them. */
});
```

- [ ] **Step 2: Run and verify they fail.**

- [ ] **Step 3: Forward the prop.** `ParticipantPicker.tsx`: pass `initialIds` (and, more usefully, the event's participants) to `DoublesPicker`. The lazy shape that avoids a second prop: change the doubles branch to take `initialPairs: PickedPair[]` and have `DrawDetailPanel` build it. Keep `Props.initialIds` for the singles branch unchanged.

```tsx
  return (
    <DoublesPicker
      eventId={eventId}
      players={players}
      initialPairs={initialPairs}
      onCommit={onCommit as (picks: PickedPair[]) => void}
      onCancel={onCancel}
    />
  );
```

`DoublesPicker` seeds `useState<PickedPair[]>(initialPairs)` instead of `[]` (:167). `unavailable` already derives from `pairs.flatMap(pair => pair.members)` (:161), so pre-existing members become unpickable with no further change — that is the whole reason this seeding shape is the cheap one. Add a short doc comment on `initialPairs` naming the debt row and the replace-semantics reason.

- [ ] **Step 4: Build the seed.** `DrawDetailPanel.tsx:66-77`: replace `initialIds={isDoubles ? [] : entered.map(p => p.id)}` with `initialIds={entered.map(p => p.id)}` (harmless for the doubles branch, which no longer reads it) plus:

```tsx
          initialPairs={
            isDoublesCode(ev.discipline)
              ? entered
                  .filter((p) => (p.members?.length ?? 0) === 2)
                  .map((p) => ({
                    id: p.id,
                    name: p.name,
                    members: [p.members![0], p.members![1]] as [string, string],
                    ...(p.entryPlayerId != null
                      ? { entryPlayerId: p.entryPlayerId }
                      : {}),
                  }))
              : []
          }
```

The `=== 2` filter is deliberate and worth a comment: a TEAM row with any other member count is not something this two-step picker can represent, and silently reshaping it would be the picker deciding something.

- [ ] **Step 5: One console mint.** Move the pair-label concatenation into `bracketLabels.ts`:

```typescript
/** The console's one pair-label mint. Matches the backend's
 *  `entries/entries.py::team_name` separator so a draw containing both a
 *  seam-built team and a hand-added one renders one spelling of the idea.
 *  The DECODE direction — `split(' / ')` and positional zip — is P6's to
 *  delete (`bracketMigration.ts:41-53`); this is the mint, and it stays
 *  because director manual pairing stays (R-DM-4). */
export function teamName(a: string, b: string): string {
  return `${a} / ${b}`;
}
```

Route both console mint sites through it: `ParticipantPicker.tsx:177` and `BracketPlayerFields.tsx:262`.

- [ ] **Step 6: Run**

```
npm --prefix apps/console run test:run -- src/modules/bracket
npm --prefix apps/console run build
```
Expected: green, including the pre-existing singles test *"opens holding the participants already entered in the draw"* (:86) — untouched.

- [ ] **Step 7: Commit**

```bash
git commit -m "fix(bracket): the doubles picker opens holding the teams already entered; one console pair-label mint" -- apps/console/src/modules/bracket/ParticipantPicker.tsx apps/console/src/modules/bracket/DrawDetailPanel.tsx apps/console/src/modules/bracket/BracketPlayerFields.tsx apps/console/src/modules/bracket/bracketLabels.ts "apps/console/src/modules/bracket/__tests__/DrawDetailPanel.test.tsx"
```

---

### Task 7: Deletion gates, registry correction, full gate, ledger — **M**

- [ ] **Step 1: Correct the `BLOB_VERSIONS` attribution.** `apps/api/src/db/blob_version.py:126` says `# Pair membership; P5 reshapes`. P5 **filled** it and did not reshape it (Pickup (a)). Change to:

```python
    "bracket_participants.member_ids": None,  # Pair membership; P5 FILLED it (still a bare list)
```

and extend the `None`-family note above `BLOB_VERSIONS` with one line: *"P5 taught the commit seam to write real `member_ids` for a confirmed pair. The value is still a bare `list[str]` — nowhere to put a `v` key without wrapping it and rewriting every reader in `brackets.py`, `local.py`, the engine and the console — so the entry stays `None` and the reshape is unowned. R-DM-4.x's rationale said P2 would give `member_ids` a versioned home; P2 gave it this enumerated slot instead."* Comment-only; no behavior. Same move P4 Task 8 made for `side_a`/`side_b`/`dependencies`.

- [ ] **Step 2: Debt-log entries.** In `docs/reference/debt-log.md`:
  - **Strike** the DoublesPicker `initialIds` row (:96), citing Task 6's commit SHA.
  - **Add** (P7-owned): *"**A committed Meet entry can never reach a generated Meet match.** `_plan_meet` writes `groupId = event.code` and `ranks = [event.code]` (e.g. `"XD"`); the only Meet match generator, `RegenerateMenu.expandRanks`, emits numbered ranks `"XD1".."XDn"` from `config.rankCounts` and filters `includes(rank)` — and it pairs only ACROSS groups, while every committed entrant lands in the single group named for their own event code. So Entries→Meet commits a roster nothing can schedule. This is why SP-DM-3 P5 put no pair field on the Meet roster: there is no reader for one until P7 gives Meet an Event (F-DM-23/33). Pinned by `test_a_committed_meet_entry_cannot_reach_a_generated_match`. Owner: **P7**. M."*
  - **Extend** the `ParticipantIn`-has-no-`meta` row (:75) with one sentence: a seam-built TEAM writes `meta.sourceEntryId` **and** `meta.partnerSourceEntryId`, so a console echo through the upsert now drops **pair** provenance as well as entry provenance.
  - **Add if the executor hit it:** anything Task 3 Step 4's `submitted_at is None` note turned into a real edit.

- [ ] **Step 3: The deletion gates, run as a set**

```
rg "endsWith\('D'\)" apps/console/src
```
Expected: **one** hit — `lib/doubles.ts::isDoublesCode`.

```
rg "\['MD', 'WD', 'XD'\]" apps/console/src
```
Expected: **zero**. (`eventColors.ts:22`'s `DISCIPLINE_ORDER` and `EventsControl.tsx:49`'s `types: ['MD','WD']` are ordering and filter-grouping data, not answers to "is this doubles" — they do not match this pattern and are deliberately out of scope. Say so if either shows up under a looser grep.)

```
rg "\} / \$\{" apps/console/src
```
Expected: **one** hit — `bracketLabels.ts::teamName`.

```
rg '" / "' apps/api/src/entries
```
Expected: **one** hit — `entries/entries.py::team_name`, the backend's one mint.

**The design doc's stated gate for this direction is `→ 0` and it is WRONG** (stale-card §5): director manual pairing stays by ruling, so a mint must exist, and P5 adds a second one on the backend. Report the gate as stale rather than editing code to satisfy it. The *decode* direction (`bracketMigration.ts`'s `split(' / ')` + positional zip and the four render-site splits) is **P6's** by the design doc's own text and must still be present.

```
rg "isDoublesRank" apps/console/src
```
Expected: **two files** — `lib/doubles.ts`'s re-export alias in `helpers.ts`, and the meet call sites importing it. That is by design (the alias avoids ~15 call-site renames for no behavior gain); the honest gate is the **rule**, which is the first grep. Note it in the ledger so a future reader of the design doc's `rg "isDoublesRank|['MD','WD','XD']"` gate is not surprised.

- [ ] **Step 4: The four negative controls, run as a set**

```
pytest tests/backend/unit/test_entries_commit_seam.py tests/backend/test_partner_invites.py tests/backend/test_entries_desk_routes.py -q
```

NC 1 = `test_a_confirmed_pair_commits_as_ONE_team_with_real_member_ids` (Task 3 — the one that fails today, proven by the Task 1 pin it replaced). NC 2 = the four refusal tests (Task 3): `test_a_half_accepted_pair_commits_as_a_singleton_and_nothing_dangles`, `test_a_partner_already_committed_alone_leaves_the_second_half_a_singleton`, `test_a_half_that_fails_validation_leaves_a_singleton_and_no_dangling_team` (leg 6), `test_a_member_already_entered_by_hand_is_not_double_entered_as_a_team` (leg 7). NC 3 = `test_a_pair_conflict_still_only_flags_after_the_seam_builds_teams` (Task 4). NC 4 = `test_a_one_directional_partner_link_is_detected_and_no_team_is_built` (Task 3).

- [ ] **Step 5: Full gate**

```
make check
```
Expected: green across both tiers (console lint/`tsc -b`/vitest/depcruise, entrant lint/typecheck/vitest/depcruise, ruff, import-linter **15 kept 0 broken**, pytest). `docs:freshness` is advisory and never fails the gate. Console depcruise must stay at **16 warnings / 0 errors** — a new ERROR means an import went module→module instead of through `lib/`. If something is red, fix it; if you believe it is pre-existing, prove that by running the same gate on a `main` worktree or reading CI — **never** with `git stash`.

- [ ] **Step 6: Ledger.** Append a P5 section to `docs/history/programs/DM3_PROGRESS.md` in the shape the P3/P4 entries use. It must state: the commit SHAs; **that the Meet half was cut and why (judgment call 1), so "pair survives intake" ships for Bracket only**; that the whole TEAM round-trip already worked and only the seam refused (stale-card §1); that F-DM-13 had **six** answers, not four, and the two extras were in `xlsxExports.ts`; that the console has **two** pair-name mints and P5 added a **third** on the backend, so the design doc's `→ 0` gate is stale; the pair predicate's **seven** legs and that every failure is a refusal, not a decision (legs 6 and 7 exist because a first draft got them wrong — say so); that a one-directional link is detected by refusal + log and **not** by a new reason code (judgment call 3); that a seam TEAM carries `members[0]`'s key and both keys are recoverable from `member_ids` (judgment call 2); **no migration, no FK, no `BLOB_VERSIONS` flip, no `tournaments.data` version bump, allow-list cap still 19**; the R-DM-4.x wording discrepancy (stale-card §6) as a flag, not a reopen; the DoublesPicker row **closed** and the blob-vs-column row **left with P6**; the standing caveat that all migration evidence in this program is SQLite-only; every deviation from this plan; and the next-slice note.

**Next-slice note to write:** P5 unblocks **P6** (the bracket person-key demotion — its NC "two 'Li Wei' in one draw are two rows" now has both the P4 FK and a seam that stops minting name-concatenated teams, and its `bracketMigration.ts` decode deletion is the other half of P5's mint work). **P7 inherits two things from P5**: F-DM-08's server-route half, and the new Meet rank-disconnect debt row.

- [ ] **Step 7: Commit the ledger, then stop**

```bash
git commit -m "docs: SP-DM-3 ledger - P5 slice landed" -- docs/history/programs/DM3_PROGRESS.md docs/reference/debt-log.md apps/api/src/db/blob_version.py
```

Merging `dm3/p5-pair-intake` is Kyle's call (superpowers:finishing-a-development-branch). **Do not start P6 or P7 in the same session.**

---

## Self-review record (plan author, 2026-08-25)

- **Card coverage.** §C5's four code moves map to tasks: `_plan_bracket` emits `TEAM` + real `member_ids` → T3; one `isDoubles(event)` authority → T2; `partnerEntryId` on the operator wire → T5; **`_plan_meet`'s "analogous side construction" is deliberately NOT built** → judgment call 1, argued from the design doc's own resolve-lists plus a new tree finding, with the overrule cost priced. The four NCs map to T3 (NC 1, NC 2, NC 4) and T4 (NC 3), and are re-run as a set at T7 Step 4. "Director manual pairing stays" is honoured three ways: the predicate refuses rather than decides, T3's `already_committed_alone` test pins the manual upgrade path, and T6 makes the manual path stop destroying the automatic one.
- **Characterization first, as the card demands.** T1 is five pins and touches no `apps/` file. Two of them (`..._TODAY_commits_as_two_unrelated_singletons`, `TODAY drops every existing team...`) exist *only* to be flipped, each by a named later task that cites T1's SHA in the replacement docstring. One (`..._cannot_reach_a_generated_match`) pins a gap P5 is **not** closing, so the ledger's honesty about the Meet cut is executable rather than prose. No test is edited to match new behavior anywhere in this plan without a scheduled, named flip.
- **The laziest thing that works.** The backend half is one file. `bracket/brackets.py` is not opened at all — all three `Participant(...)` constructions already carry `member_ids`, both persist dicts write it back, and `ParticipantIn`/`Out` already declare `members`. No migration (R-DM-4(a) chose the no-table option), no FK, no backfill, no re-key, no version bump, no new reason code, no new dependency. The `helpers.ts` re-export alias avoids ~15 call-site renames for zero behavior gain, and is called out in the deletion gate so the shortcut is visible rather than hidden.
- **Type consistency.** `team_id` takes `tuple[uuid.UUID, uuid.UUID]` and returns `str`; `member_ids` is `list[str]` of `roster_id(...)` values, matching what the console's own hand-built teams put there and what `Participant.member_ids` reads. `entry_player_id` on the insert dict is a `uuid.UUID` (the column type), matching P4's `_insert_participants` mapping. `partnerEntryId` is `Optional[str]` on the wire and `string | null` in `dto.ts`. `isDoublesCode(code: string): boolean` serves both key spaces because the digit strip is a no-op on a prefix.
- **Known judgment calls, flagged not hidden.** Eight, listed up front, each with the cost of overruling it. The first is the one that most changes the slice's size and is stated as such.
- **A first draft of this plan claimed leg 6 was "satisfied by construction"; review killed it.** It is not: the nominator is processed first, so a partner whose payload later fails `_valid` would leave a TEAM naming a roster row that was never written — NC 2's "nothing dangles" broken by the plan's own instruction, and unrepairable on re-run because the team id is already in `existing_ids`. The same walk exposed leg 7 (a hand-added participant for one half would put that human in the draw twice). Both are now explicit legs with their own tests, and the `_bracket_payload` extraction is what makes leg 6 checkable for the partner. Recorded because the reasoning that produced the bug — "the loop already validates every entry" — is true and still wrong, and the next person to reach for it deserves the counter-argument.
- **Riskiest step, named.** T3 Step 6's full-suite sweep. `_plan_bracket` is on the path of every entries route and several integration fixtures; a test that asserted "two participants" for a doubles fixture will redden, and the plan forbids editing its assertion without controller sign-off. T6 Step 4 is second — the `=== 2` member filter silently drops a malformed team from the picker's seed, and a wrong predicate there re-creates the wipe the task exists to fix.
- **Tree-vs-card contradictions.** Eight, in "What the tree says that the card does not": the TEAM round-trip already works; six `isDoubles` answers, not four; two console name-mints (three after P5); the Meet rank disconnect; the `→ 0` mint gate is unachievable and inverts; R-DM-4.x's rationale overstates what P2 delivered; `initialIds` is unforwarded in two places, not one; and the seam test fixtures cannot express a pair at all.
- **Standing caveat repeated.** All migration and FK evidence in this program is SQLite-only; Postgres is untested. P5 carries no migration, so it adds nothing to that debt — and the ledger says so anyway.
- **Line numbers** anchor to `621325ab`; executors re-anchor by symbol.
