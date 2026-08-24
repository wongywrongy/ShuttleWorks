# SP-DM-3 — Domain-Model Unification Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the ruled domain-model unification (register: `docs/history/programs/DM1_RULINGS.md`) — starting with the pulled-forward P3 slice (the two person-minting gaps + the missing operator person key), fully detailed below; the nine remaining phases are sequenced as program cards, each of which gets its own detailed plan at phase start.

**Architecture:** Strangler-fig over the shipped R13 intake chain. P3 touches no schema: it widens the ruled duplicate advisory to a workspace scope, routes partner acceptance through the ruled `same_person` matcher, and carries the already-resolved person key onto the operator wire. Later phases (P0–P2, P4–P9) install mechanisms (type parity, blob versioning) before the migrations that need them.

**Tech Stack:** FastAPI + SQLAlchemy (`apps/api/src`, sys.path root — imports are `from entries import …`), pytest (repo root, repo `.venv`), React Router 7 SSR entrant tier (zero client JS, native form posts), React+Vite console, vitest.

**Spec:** `docs/history/superpowers/specs/2026-08-24-domain-model-unification-design.md` (phases + decisions) · `docs/history/programs/DM1_RULINGS.md` (the rulings this plan argues from) · `docs/history/audits/2026-08-24-domain-model-audit.md` (evidence, `F-DM-*`).

## Global Constraints

- **No phase re-decides anything ruled.** Specifically: no FK on `entry_events.bracket_event_id` (R2); no match-record merge or shared match/score value object (ADR 0006); no rename of `tournaments`/`tournament_id`/`tournamentStore` (ADR 0014); no hard `(entry_event_id, lower(contact_email))` unique index (R7/R13); the 2026-08-23 minting rule (same account · same normalized name · same birth year, **all present**) is never weakened into name-alone matching; pair conflicts are **flagged, never resolved** (I4); entrant erasure stays "scrub the PII, keep the rows" (D7, 2026-08-21).
- **The F-DM-11 test-schema trap:** unit suites build schema with `Base.metadata.create_all`, which lacks the migration's FKs. Any phase adding an FK adds it to `models.py` and the migration **in the same commit**, and its negative control asserts the `IntegrityError` (against migration-built schema where necessary).
- **Every duplicate answer is a flag, never a 409** (I4 / R7). New advisory codes are `pending_reasons` members, entry-level, on the `needs_review` precedent.
- Backend list queries: stable tiebreaker `created_at DESC, id DESC` (CLAUDE.md hazard).
- Commits are **path-limited** (`git commit -- <paths>`); never `git add .`.
- Gate before claiming done: the specific suite for the change, then `make check` at slice end.
- Console DTO changes: `make generate-api`, then reconcile `apps/console/src/api/dto.ts` **by hand**.
- Work on a feature branch off `main`: `dm3/p3-minting-gaps` for the P3 slice below.

---

## Program sequence (ruled order — DM1_RULINGS.md session-end summary)

| # | Phase | Ruled by | Status |
|---|---|---|---|
| 1 | **P3 — minting gaps** (pulled forward, R-DM-1.x) | R-DM-1 (a)/(a) | **DETAILED BELOW — execute now** |
| 2 | P0 — type mechanism (parity oracle) | R-DM-9 (a) | card §C0 |
| 3 | P1 — one standings shape | — (P0 mechanism) | card §C1 |
| 4 | P2 — blob version discipline | R-DM-8 (a) | card §C2 |
| 5 | P4 — people→competition key | R-DM-2 (a, (c) ratified end-state) | card §C4 |
| 6 | P5 — pair survives intake | R-DM-4 (a) | card §C5 |
| 7 | P6 — bracket person key demotion | R-DM-7 (a) | card §C6 |
| 8 | P7 — one Event key + Meet Event | R-DM-5 (a model + c mechanism), R-DM-10 (a), R-DM-11 (b) | card §C7 |
| 9 | P9 — cosmetic sweep | — | card §C9 |
| 10 | P8 — PlayerProfile full v1 | R-DM-3 (c) — **BLOCKED on the R15 text** | card §C8 |

**Rule for cards §C0–§C9:** each phase gets its own detailed plan (this document's Task format) written **at phase start against the then-current tree** — the migrations earlier phases land change the exact code later phases touch, so line-level steps written today would be stale. A card states the ruled inputs, scope, negative controls, and deletion gate the detailed plan must satisfy; the design doc §2 carries the full phase text.

### §C0 — P0: Install the type mechanism (M)
Wire `dto.generated.ts` as a parity oracle against `api/dto.ts` (R-DM-9a): a test asserting the hand mirror matches the generated shapes, known divergences allow-listed and **ratcheted to zero, never silenced**. Same shape for the entrant tier's four hand-mirror files (model: `store/__tests__/nonSchedulingKeys.parity.test.ts`). Delete `MatchStateOut` (dead, F-DM-45). Remove/re-justify the `knip.json` + `vitest.config.ts` exclusions in the same commit. NCs: a field added to a Pydantic response model reddens both tiers before any hand edit; F-DM-28a's three refused `PlayerDTO` fields are asserted *as* violations. No migrations. Independent; do first among the program phases.

### §C1 — P1: One standings shape (M)
One backend row shape per grain (participant vs `groupId`), re-exported to the two public projections; the three tiers' `StandingRowDTO`s become generated/parity-checked; the two untyped display routes gain a `response_model` (F-DM-30). Deletion gate: 9 declarations → ≤3. NCs: deleting a shared field reddens console *and* entrant parity tests; the display routes get a key-set test (allow-list discipline F-DM-71 preserved). Blocked by P0.

### §C2 — P2: JSON-blob version discipline (M)
R-DM-8(a): in-blob `v` int, absent ⇒ v1, stamped on next write; one read/write helper per blob column at the repository boundary; no migration, no backfill. `tournaments.data`: `state_version` untouched (I8 concurrency token), `data["version"]` = schema version, one accessor. `non-scheduling-keys.json` gains `$schema` + version; both readers stop hard-coding the path (F-DM-53). NCs: v2-read-by-v1 raises; unversioned reads as v1 and is rewritten stamped; an inventory test fails on any new JSON column without a helper. Carries debt-log L1's blob-PII note forward (record, don't fix). Blocks P4/P5/P7.

### §C4 — P4: The people→competition link becomes a key (L)
R-DM-2(a): `entry_player_id` (Uuid, composite FK) on `bracket_participants` + typed `entryPlayerId` on both roster blob shapes, legacy `entry-{uuid}` string kept as a read path until the deletion gate closes. Also: the two missing R13 FKs added to `models.py` (same commit as any migration change — F-DM-11); `match_states` gains `__table_args__` (composite FK to `matches` + index, prior art `commands` in the same file); the three `entry-{uuid}` derivation sites collapse to one; `ParticipantOut` stops dropping `meta.sourceEntryId` (F-DM-09). NCs: dangling `entry_player_id` → `IntegrityError` on migration-built schema; the documented commit crash window characterized before touching; blob-removed match id still deletes its `matches` row. Deletion gate: `rg '"entry-'` → one minting site, then 0. Blocked by P3 + P2. **After P4 lands, the R-DM-2(c) Meet-roster extraction is a committed follow-on program.**
Unblocks the two deferred SP-P7 items (highlight-player; profiles are P8's).

### §C5 — P5: Pair survives intake (L)
R-DM-4(a): `_plan_bracket` emits `type="TEAM"` + real `member_ids` for a both-halves-confirmed pair; `_plan_meet` gets the analogous side construction (kills the client-side pairing in `RegenerateMenu.tsx`, F-DM-08); one `isDoubles(event)` authority (F-DM-13); `partnerEntryId` on the operator wire (F-DM-35). Director manual pairing **stays** for half-accepted/hand-added pairs (ruling note). NCs: confirmed pair → one TEAM (fails today); half-accepted pair commits as a singleton, nothing dangles; `pair_conflict` still only flags (I4); one-directional `partner_entry_id` is detected. Thinnest test cover of any large area — characterization tests before restructuring. Blocked by P2. NOT pulled forward (R-DM-4.x).

### §C6 — P6: The bracket person stops being their name (M)
R-DM-7(a): no re-key, no slot-blob rewrite. `playerSlug.ts` demotes to at most a URL helper; `bracketMigration.ts`'s decode-from-label and `p.name === p.id` repair are **deleted**, not fixed. NCs: two "Li Wei" in one draw are two rows (via the P4 FK); rename changes no id; removing the repair doesn't resurrect the bracket-defect-series D3 (cite the code comment by path:line, never "debt-log D3"). Deletion gate: `rg "p\.name === p\.id"` → 0. Blocked by P4.

### §C7 — P7: One Event key, and a Meet Event (L — program-scale)
R-DM-5: division-level mapping (a `meet_events` table or division-keyed versioned blob section + a real mapping column); slot assignment is an **operator-side surface** P7 builds. R-DM-10(a): `tournaments.kind` + CHECK is the engine authority; `workspace_modules` = UI only; delete `or "meet"`. R-DM-11(b): `eventCode` stays the public key; **renaming a published code becomes impossible** (constraint, not re-key). CheckConstraints start on `tournaments.kind`, `entries.state`, `matches.status`, `tournament_members.role` (F-DM-37). NCs: `kind='banana'` rejected; empty `rankCounts` no longer accepts every code; Meet's `draws: []` distinguishable from "not generated". Blocked by P0. Do not start inside another program's window.

### §C8 — P8: PlayerProfile full v1 (M) — **BLOCKED**
R-DM-3(c): global person + public cross-tournament history. **Blocked until Kyle supplies the R15 content definition** (what a profile contains/shows, who claims it, opt-in posture) — nothing is inferred. Open question travels with it: does the operator merge tool (`debt-log.md:78`) ship with or before P8 (fragments become public URLs)? Storage shape when unblocked: `player_profiles` (or profile role on `entrant_accounts`) + nullable `profile_id` on `entry_players`, back-filled from `account_id`. NCs: two workspaces / one account → one profile; hand-added player → no profile, plain text; a D7-scrubbed player is absent from history and the profile scrubs, never deletes. Blocked by R15 text + P3/P4.

### §C9 — P9: Cosmetic sweep (S)
F-DM-43..61 remainder + F-DM-21/25/42. One optional migration (`match_states` String timestamps → `DateTime`). Boy-Scout material per `CODE_HEALTH.md` — not a program; anytime after P0.

---

# The P3 slice — detailed tasks (execute now)

**Branch:** `dm3/p3-minting-gaps` off `main`. Ruled by R-DM-1 (a)/(a) + R-DM-1.x (pull-forward). No migrations anywhere in this slice. The operator **merge tool stays out of scope** (ruled deferral, `debt-log.md:78`).

**File map:**
- `apps/api/src/entries/entry_policy.py` — new reason-code constant.
- `apps/api/src/entries/submissions.py` — `has_unresolvable_namesake()` (new), `adopt_or_mint()` (new, extracted from `_write`), `_write` wiring.
- `apps/api/src/entries/partners.py` — `accept()` gains `birth_year`, routes through `adopt_or_mint`.
- `apps/api/src/entries/partner_routes.py` — `PartnerAcceptRequest.birthYear`, `PartnerInviteDTO.askBirthYear`.
- `apps/entrant/app/routes/partner.tsx` — birth-year field on the accept form + DTO mirror.
- `apps/api/src/core/schemas.py` — `EntryDeskRowDTO.entryPlayerId`.
- `apps/console/src/api/dto.ts` — `EntryDTO.entryPlayerId`.
- `apps/console/src/modules/entries/entryDisplay.ts` — vocabulary for the new code.
- Tests: `tests/backend/unit/test_submission_service.py`, `tests/backend/test_partner_invites.py`, `tests/backend/test_entries_desk_routes.py`, `apps/console/src/modules/entries/__tests__/entryDisplay.test.ts`.

**Run commands (this repo):** backend `pytest tests/backend/unit/test_submission_service.py -x -q` etc. from the repo root with the repo `.venv` active; console `npm --prefix apps/console run test:run -- src/modules/entries/entryDisplay.test.ts` (vitest resolves by path filter); entrant `npm --prefix apps/entrant run test:run` if that script exists, else the entrant vitest project via `make check`.

---

### Task 1: The workspace-scoped duplicate advisory (R-DM-1 gap i)

**Files:**
- Modify: `apps/api/src/entries/entry_policy.py` (constants block, near line 37)
- Modify: `apps/api/src/entries/submissions.py` (`same_person` region ~:265-320, `_write` ~:411-449)
- Modify: `apps/console/src/modules/entries/entryDisplay.ts` (constants ~:24-37, `REASON_LABEL` ~:60, `ATTENTION` ~:83)
- Test: `tests/backend/unit/test_submission_service.py` (flags section, ~:499+), `apps/console/src/modules/entries/__tests__/entryDisplay.test.ts`

**Interfaces:**
- Consumes: `same_person(session, tournament_id, account_id, spec) -> Optional[EntryPlayer]` (exists, unchanged); `PlayerInput` dataclass (exists, unchanged); test helpers `_create(session, world, [PlayerInput(...)])` and `world["events"]["WS"|"XD"|...]` in `test_submission_service.py`.
- Produces: `entry_policy.NEEDS_REVIEW_PERSON = "needs_review_person"`; `submissions.has_unresolvable_namesake(session, tournament_id, account_id, spec, exclude_id) -> bool`; `submissions.adopt_or_mint(session, tournament_id, account_id, spec) -> tuple[EntryPlayer, bool]` (player, adopted). Tasks 2 and 3 rely on `adopt_or_mint` and the code string `"needs_review_person"` exactly.

- [ ] **Step 1: Write the failing tests** — append to the flags section of `tests/backend/unit/test_submission_service.py`:

```python
def test_the_same_name_in_a_DIFFERENT_event_rides_the_weaker_advisory(session, world):
    """R-DM-1 gap (i), ruled 2026-08-24 (DM1_RULINGS.md): the 2026-08-23
    ruling's advisory promise now reaches across events. Same account + same
    name + no birth year in a second event -> still TWO rows (never merged),
    plus the workspace-scoped flag. This DELIBERATELY supersedes the old
    assertion that a different event is not flagged."""
    first = _create(
        session, world, [PlayerInput("Alice Chen", "F", events=[world["events"]["WS"]])]
    )
    second = _create(
        session, world, [PlayerInput("Alice Chen", "F", events=[world["events"]["XD"]])]
    )
    # The minting ruling holds: two rows, no merge.
    assert first.players[0].id != second.players[0].id
    # What is new: the fork is no longer silent.
    assert "needs_review_person" in second.entries[0].pending_reasons
    # And the old same-event flag did not fire (different events).
    assert "needs_review" not in second.entries[0].pending_reasons


def test_distinct_birth_years_are_two_people_and_no_new_flag(session, world):
    """R-DM-1 NC 2: the father-and-son case. Both years present and
    different -> the identity is NOT ambiguous, so the weaker advisory
    stays quiet."""
    _create(
        session,
        world,
        [PlayerInput("Robert Chen", "M", birth_year=1970, events=[world["events"]["WS"]])],
    )
    second = _create(
        session,
        world,
        [PlayerInput("Robert Chen", "M", birth_year=2005, events=[world["events"]["XD"]])],
    )
    assert "needs_review_person" not in second.entries[0].pending_reasons


def test_adoption_never_carries_the_weaker_advisory(session, world):
    """Certain match (account+name+year all present) -> adopted, one row,
    and nothing to review."""
    first = _create(
        session,
        world,
        [PlayerInput("Alice Chen", "F", birth_year=2001, events=[world["events"]["WS"]])],
    )
    second = _create(
        session,
        world,
        [PlayerInput("Alice Chen", "F", birth_year=2001, events=[world["events"]["XD"]])],
    )
    assert first.players[0].id == second.players[0].id
    assert "needs_review_person" not in second.entries[0].pending_reasons
```

Then **update** the existing `test_the_same_player_in_a_different_event_is_not_flagged` (~:549): rename it `test_the_old_event_scoped_flag_still_ignores_other_events`, keep its `"needs_review" not in` assertion, and add `assert "needs_review_person" in second.entries[0].pending_reasons` with a one-line comment citing R-DM-1 — the behavior change is **ruled**, not drift.

- [ ] **Step 2: Run and verify they fail**

Run: `pytest tests/backend/unit/test_submission_service.py -q -k "weaker_advisory or distinct_birth_years or never_carries or ignores_other_events"`
Expected: the three new tests FAIL on the missing `"needs_review_person"`; the adoption test may pass already (it pins existing behavior — that is fine, it is the guard rail).

- [ ] **Step 3: Add the constant** — in `apps/api/src/entries/entry_policy.py`, after `GENDER_MISMATCH = "gender_mismatch"` (line 38):

```python
# R-DM-1 (i), ruled 2026-08-24: the workspace-scoped half of the duplicate
# advisory. Same account + same normalized name in ANY event, where at
# least one side has no birth year to distinguish them. Weaker than
# NEEDS_REVIEW (no shared event) and quiet when both years are present and
# differ - the father-and-son case is not ambiguous. A flag an operator
# resolves, never a merge (invariant I4; the 2026-08-23 minting rule is
# untouched).
NEEDS_REVIEW_PERSON = "needs_review_person"
```

- [ ] **Step 4: Add the helper + extract `adopt_or_mint`** — in `apps/api/src/entries/submissions.py`, after `same_person` (below line 318):

```python
def has_unresolvable_namesake(
    session: Session,
    tournament_id: uuid.UUID,
    account_id: uuid.UUID,
    spec: PlayerInput,
    exclude_id: uuid.UUID,
) -> bool:
    """Does this account already hold a same-named person this spec CANNOT
    be distinguished from?

    The workspace-scoped advisory R-DM-1 (i) added: ``same_person`` adopts
    only the certain match, so a birth-year-less namesake under the same
    account forks silently across events - this is the flag that makes the
    fork visible. Rows whose birth year is present AND different from the
    spec's are excluded: a father and son sharing a name are two people,
    not an ambiguity (NC 2). ``exclude_id`` keeps the row minted for this
    very spec out of its own advisory.
    """
    stmt = (
        select(EntryPlayer.id)
        .where(
            EntryPlayer.tournament_id == tournament_id,
            EntryPlayer.account_id == account_id,
            func.lower(EntryPlayer.full_name) == spec.full_name.strip().lower(),
            EntryPlayer.erased_at.is_(None),
            EntryPlayer.id != exclude_id,
        )
        .limit(1)
    )
    if spec.birth_year is not None:
        # The spec has a year, so only year-less rows are ambiguous with it.
        stmt = stmt.where(EntryPlayer.birth_year.is_(None))
    return session.execute(stmt).first() is not None


def adopt_or_mint(
    session: Session,
    tournament_id: uuid.UUID,
    account_id: uuid.UUID,
    spec: PlayerInput,
) -> tuple[EntryPlayer, bool]:
    """The one place an ``EntryPlayer`` comes from.

    Adopt the certain match (``same_person``) or mint a fresh row -
    extracted from ``_write`` so the partner path (R-DM-1 (ii)) applies the
    identical rule instead of constructing rows on its own. Returns
    ``(player, adopted)``. On adoption the DESCRIPTIVE fields take the
    fresh values (see the R-P7c comment at the ``_write`` call site).
    """
    player = same_person(session, tournament_id, account_id, spec)
    if player is None:
        player = EntryPlayer(
            tournament_id=tournament_id,
            account_id=account_id,
            full_name=spec.full_name.strip(),
            gender=spec.gender.strip(),
            club=(spec.club or "").strip() or None,
            birth_year=spec.birth_year,
            remarks=(spec.remarks or "").strip() or None,
        )
        session.add(player)
        session.flush()
        return player, False
    player.club = (spec.club or "").strip() or None
    player.remarks = (spec.remarks or "").strip() or None
    return player, True
```

- [ ] **Step 5: Wire `_write`** — replace the `same_person`/mint block (~:419-434, keeping the R-P7c comment above it) with:

```python
        player, adopted = adopt_or_mint(session, tournament_id, account_id, spec)
        flag_person = not adopted and has_unresolvable_namesake(
            session, tournament_id, account_id, spec, exclude_id=player.id
        )
```

and inside the per-event loop, directly after the existing `looks_duplicate` append (~:448-449):

```python
            if flag_person:
                reasons.append(NEEDS_REVIEW_PERSON)
```

Update the import at line 67: `from entries.entry_policy import NEEDS_REVIEW, NEEDS_REVIEW_PERSON, gender_flags`.

- [ ] **Step 6: Run the backend tests**

Run: `pytest tests/backend/unit/test_submission_service.py -q`
Expected: ALL pass — the three new tests, the renamed one, and every pre-existing adoption/flag test (the `adopt_or_mint` extraction is behavior-preserving for this path).

- [ ] **Step 7: Console vocabulary** — in `apps/console/src/modules/entries/entryDisplay.ts`: after the `GENDER_MISMATCH` constant add

```typescript
/** R-DM-1 (i): same account + same name in ANY event with no birth year to
 *  tell them apart. The workspace-scoped half of the duplicate advisory —
 *  weaker than `needs_review` (no shared event), and absent when birth
 *  years distinguish the two (a father and son are not an ambiguity).
 *  Flag-only; the operator resolves (invariant I4). */
export const NEEDS_REVIEW_PERSON = 'needs_review_person';
```

add `[NEEDS_REVIEW_PERSON]: 'Possible duplicate person',` to `REASON_LABEL`, and add `NEEDS_REVIEW_PERSON` to the `ATTENTION` set (it is a question for the operator). In `apps/console/src/modules/entries/__tests__/entryDisplay.test.ts` add:

```typescript
it('labels the workspace-scoped duplicate advisory and treats it as attention', () => {
  expect(reasonLabel('needs_review_person')).toBe('Possible duplicate person');
  expect(hasAttention(['needs_review_person'])).toBe(true);
});
```

- [ ] **Step 8: Run the console test**

Run: `npm --prefix apps/console run test:run -- src/modules/entries/__tests__/entryDisplay.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/entries/entry_policy.py apps/api/src/entries/submissions.py apps/console/src/modules/entries/entryDisplay.ts apps/console/src/modules/entries/__tests__/entryDisplay.test.ts tests/backend/unit/test_submission_service.py
git commit -m "feat(entries): workspace-scoped duplicate advisory (R-DM-1 gap i)" -- apps/api/src/entries/entry_policy.py apps/api/src/entries/submissions.py apps/console/src/modules/entries/entryDisplay.ts "apps/console/src/modules/entries/__tests__/entryDisplay.test.ts" tests/backend/unit/test_submission_service.py
```

---

### Task 2: Partner acceptance through the ruled matcher (R-DM-1 gap ii)

**Files:**
- Modify: `apps/api/src/entries/partners.py` (`accept()`, :177-264)
- Modify: `apps/api/src/entries/partner_routes.py` (`PartnerInviteDTO` ~:55-64, `PartnerAcceptRequest` :67-78, `preview_partner_invite` :169-195, `accept_partner_invite` :267-277)
- Modify: `apps/entrant/app/routes/partner.tsx` (invite interface :40-44, form :216-222)
- Test: `tests/backend/test_partner_invites.py`

**Interfaces:**
- Consumes: `adopt_or_mint(session, tournament_id, account_id, spec) -> tuple[EntryPlayer, bool]` and `PlayerInput` from Task 1; `entry_form.parse_year(raw) -> Optional[int]` (exists, :126); `_is_age_bracketed(event) -> bool` from `entries.entries_public` (:418); test helpers `_verified_entrant`, `_nominate`, `_accept(client, token, **over)`, `_entry` in `test_partner_invites.py`.
- Produces: `partners.accept(..., birth_year: Optional[int] = None)`; wire fields `PartnerAcceptRequest.birthYear: Optional[str]`, `PartnerInviteDTO.askBirthYear: bool`.

- [ ] **Step 1: Write the failing test** — append to the acceptance section of `tests/backend/test_partner_invites.py`:

```python
def test_accepting_under_the_same_account_adopts_the_existing_person(
    client, world, mailbox
):
    """R-DM-1 gap (ii), ruled 2026-08-24 (DM1_RULINGS.md NC 3): enter alone,
    then accept a doubles invite under the same account with a matching
    birth year -> ONE person row, not two. Before this, ``accept()`` minted
    unconditionally and a partner-minted person could never be the certain
    match in either direction."""
    import uuid as _uuid

    from sqlalchemy import select

    from db.models import EntrantAccount, EntryEvent, EntryPage
    from db.session import SessionLocal
    from entries.submissions import PlayerInput, create_submission

    # Sam enters WS on their own account, with a birth year.
    _verified_entrant(client, mailbox, "sam@example.com")
    session = SessionLocal()
    try:
        sam = session.scalars(
            select(EntrantAccount).where(EntrantAccount.email == "sam@example.com")
        ).one()
        page = session.get(EntryPage, _uuid.UUID(world["tid"]))
        ws = session.get(EntryEvent, (_uuid.UUID(world["tid"]), _uuid.UUID(world["WS"])))
        own = create_submission(
            session,
            tournament_id=_uuid.UUID(world["tid"]),
            page=page,
            account_id=sam.id,
            players=[PlayerInput("Sam Ali", "F", birth_year=2000, events=[ws])],
            fee_total_cents=2000,
            fee_basis={"basis": "schedule", "players": []},
        )
        session.commit()
        own_person_id = str(own.players[0].id)
    finally:
        session.close()

    # Alex nominates sam@example.com for the doubles event.
    _verified_entrant(client, mailbox, "alex@example.com")
    out = _nominate(client, world, partner_email="sam@example.com")
    _, token = out["invites"][0]

    # Sam accepts with the same name and the same birth year.
    _verified_entrant(client, mailbox, "sam@example.com")
    r = _accept(client, token, birthYear="2000")
    assert r.status_code == 200, r.text

    theirs = _entry(world["tid"], r.json()["entryId"])
    assert str(theirs.entry_player_id) == own_person_id
```

(If the `world` fixture keys events differently than `world["WS"]`, mirror how `_nominate`'s internals resolve `world[event_key]` — the fixture at the top of this file is the source of truth.)

- [ ] **Step 2: Run and verify it fails**

Run: `pytest tests/backend/test_partner_invites.py -q -k adopts_the_existing_person`
Expected: FAIL — the accepted entry points at a **new** person row, not `own_person_id` (today's unconditional mint).

- [ ] **Step 3: Route `accept()` through the matcher** — in `apps/api/src/entries/partners.py`, add `birth_year: Optional[int] = None,` to `accept()`'s keyword parameters (after `remarks`), extend the docstring with one line ("`birth_year` is the R-DM-1 discriminator: with it, `adopt_or_mint` can recognize a person this account already entered."), and replace the direct construction (:205-212 + the `session.add_all`/`flush` for the player) with:

```python
    # Local import: ``submissions`` imports this module at top level, so a
    # module-level import here would be a cycle.
    from entries.submissions import PlayerInput, adopt_or_mint

    partner_player, _ = adopt_or_mint(
        session,
        entry.tournament_id,
        account_id,
        PlayerInput(
            full_name=full_name.strip()[:200],
            gender=gender.strip()[:20],
            club=(club or "").strip()[:200] or None,
            remarks=(remarks or "").strip()[:2000] or None,
            birth_year=birth_year,
        ),
    )
```

(`partner_submission` keeps its own `session.add` + the existing `session.flush()`; `adopt_or_mint` flushes the player itself.)

- [ ] **Step 4: Carry the field on the wire** — in `apps/api/src/entries/partner_routes.py`:
  - `PartnerAcceptRequest` gains `birthYear: Optional[Name] = None` with a comment: `# R-DM-1 (ii): the identity discriminator, string-typed and parsed by parse_year - an unparseable year is dropped, not refused, exactly as the entry form treats it.`
  - `PartnerInviteDTO` gains `askBirthYear: bool = False`.
  - In `preview_partner_invite`, compute it with the same rule the entry page uses (any event on the page is age-bracketed):

```python
    from entries.entries_public import _is_age_bracketed

    events = repo.session.scalars(
        select(EntryEvent).where(EntryEvent.tournament_id == entry.tournament_id)
    ).all()
    ask_birth_year = any(_is_age_bracketed(ev) for ev in events)
```

  (add `select` to this module's imports if absent) and pass `askBirthYear=ask_birth_year` in the DTO. Move the import to the top of the file — `entries_public` does not import `partner_routes`, so no cycle.
  - In `accept_partner_invite`, pass the parsed year through: add `from entries.entry_form import parse_year` to the imports and `birth_year=parse_year(body.birthYear or ""),` to the `partner_service.accept(...)` call.

- [ ] **Step 5: Run the backend suite for the file**

Run: `pytest tests/backend/test_partner_invites.py -q`
Expected: ALL pass — the new adoption test plus every existing acceptance test (a body without `birthYear` still mints fresh; `same_person` matches nothing when the year is absent).

- [ ] **Step 6: The accept form asks** — in `apps/entrant/app/routes/partner.tsx`: add `askBirthYear: boolean;` to the invite interface (:40-44), and after the club `TextField` (:216-221) insert:

```tsx
            {invite.askBirthYear ? (
              <TextField
                id="partner-year"
                label="Birth year"
                name="birthYear"
                inputMode="numeric"
                maxLength={4}
                hint="This tournament runs age-bracketed events, so the organizer needs a year to place this player."
              />
            ) : null}
```

(Native form post; `accept_body` already drops blank fields, so leaving it empty behaves like omitting it.)

- [ ] **Step 7: Run the entrant tier's gates**

Run: `npm --prefix apps/entrant run test:run` (or the entrant vitest project as `make check` invokes it) and `npm run lint:entrant` if present.
Expected: PASS — no entrant test pins the partner page's field list (verified during planning), so this is a regression sweep, not an assertion change.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/entries/partners.py apps/api/src/entries/partner_routes.py apps/entrant/app/routes/partner.tsx tests/backend/test_partner_invites.py
git commit -m "feat(entries): partner acceptance adopts through same_person (R-DM-1 gap ii)" -- apps/api/src/entries/partners.py apps/api/src/entries/partner_routes.py apps/entrant/app/routes/partner.tsx tests/backend/test_partner_invites.py
```

---

### Task 3: The operator wire carries the person key (F-DM-16)

**Files:**
- Modify: `apps/api/src/core/schemas.py` (`EntryDeskRowDTO`, :715-768)
- Modify: `apps/console/src/api/dto.ts` (`EntryDTO`, :688-715)
- Test: `tests/backend/test_entries_desk_routes.py`

**Interfaces:**
- Consumes: `Entry.entry_player_id` (column, `db/models.py:1496`); the desk routes already serialize via `EntryDeskRowDTO.from_row`.
- Produces: wire field `entryPlayerId: string | null` on every desk row — the key the desk (and later P4 surfaces) group a person by.

- [ ] **Step 1: Write the failing test** — in `tests/backend/test_entries_desk_routes.py`, find the existing listing test that submits and then GETs the desk rows, and add alongside it (reusing that test's fixtures/helpers for the submission):

```python
def test_a_desk_row_carries_the_resolved_person_key(client, world, mailbox):
    """F-DM-16 / R-DM-1 (P3): the backend resolved the person (R-P7c) but
    the wire never carried it, so the desk could not group one person's
    entries across submissions except by eye."""
    # …create one entry via this file's existing submission helper…
    rows = client.get(f"/tournaments/{world['tid']}/entries").json()
    assert rows, "expected at least one desk row"
    assert rows[0]["entryPlayerId"], "the desk row must carry the person key"
```

(Adapt the GET path and helper names to what the file already uses — its existing tests are the source of truth for auth headers and route shape.)

- [ ] **Step 2: Run and verify it fails**

Run: `pytest tests/backend/test_entries_desk_routes.py -q -k person_key`
Expected: FAIL with `KeyError: 'entryPlayerId'`.

- [ ] **Step 3: Add the field** — in `apps/api/src/core/schemas.py`, `EntryDeskRowDTO`: after `playerName: str` (:746) add

```python
    # R-P7c resolved the person; F-DM-16 was the wire not carrying it. The
    # desk groups one human's entries across submissions by this, not by
    # eye. Null only for rows minted before the person spine existed.
    entryPlayerId: Optional[str] = None
```

and in `from_row` (after `playerName=row.player_name,`):

```python
            entryPlayerId=str(row.entry_player_id) if row.entry_player_id else None,
```

- [ ] **Step 4: Run the backend tests**

Run: `pytest tests/backend/test_entries_desk_routes.py -q`
Expected: ALL pass.

- [ ] **Step 5: Mirror on the console** — run `make generate-api`, then hand-reconcile `apps/console/src/api/dto.ts`: in `EntryDTO` after `playerName: string;` (:708) add

```typescript
  /** The resolved person (R-P7c): `entry_players.id`. The key one human's
   *  entries share across submissions — the desk's grouping identity, where
   *  before it had only `playerName` and eyes. Null on rows minted before
   *  the person spine. */
  entryPlayerId: string | null;
```

- [ ] **Step 6: Console type gate**

Run: `npm --prefix apps/console run test:run` and the type gate via `npm --prefix apps/console run build` (which runs `tsc -b`).
Expected: PASS — the field is additive; no consumer breaks.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/core/schemas.py apps/console/src/api/dto.ts tests/backend/test_entries_desk_routes.py
git commit -m "feat(entries): desk rows carry entryPlayerId (F-DM-16)" -- apps/api/src/core/schemas.py apps/console/src/api/dto.ts tests/backend/test_entries_desk_routes.py
```

---

### Task 4: Slice gates + deletion-gate verification

**Files:** none new — verification only, plus the ledger update.

- [ ] **Step 1: The design doc's P3 deletion gates**

Run: `rg "EntryPlayer\(" apps/api/src`
Expected: exactly **one** construction site — inside `adopt_or_mint` (`submissions.py`). (Migrations under `alembic/` and tests are out of scope for this gate.)

Run: `rg "personKey|entryPlayerId" apps/console/src --glob '!**/dto.generated.ts'`
Expected: **non-zero for the first time** — the `dto.ts` field and the `entryDisplay` usages.

- [ ] **Step 2: The ruled-behavior spot checks (NC 1–4 from the design doc)**

Run: `pytest tests/backend/unit/test_submission_service.py tests/backend/test_partner_invites.py -q`
Expected: PASS — NC1 (two rows + flag), NC2 (father/son, no new flag), NC3 (doubles-accept adopts), NC4 (every duplicate answer is a flag, never a 409 — pinned by the pre-existing I4 tests in these files).

- [ ] **Step 3: Full gate**

Run: `make check`
Expected: green across both tiers (console lint/types/vitest/depcruise, entrant lint/types/vitest/depcruise, ruff, import-linter, pytest). Fix anything red before proceeding; report honestly if a failure is pre-existing on `main` (verify by `git stash` — no: verify by checking out `main` in a worktree or reading CI, **never** `git stash`).

- [ ] **Step 4: Update the ledger** — `docs/history/programs/DM3_PROGRESS.md`: flip P3's row to DONE with the commit SHAs, note any deviation from this plan.

- [ ] **Step 5: Commit the ledger (path-limited), then stop**

```bash
git commit -m "docs: SP-DM-3 ledger - P3 slice landed" -- docs/history/programs/DM3_PROGRESS.md
```

Merging `dm3/p3-minting-gaps` is Kyle's call (superpowers:finishing-a-development-branch). **Do not start P0 in the same session without checking the ledger's next-slice note.**

---

## Self-review record (plan author, 2026-08-24)

- **Spec coverage:** P3's three code moves (design doc §2 P3) map to Tasks 1–3; its four NCs map to Task 1 steps 1/6 (NC 1, 2), Task 2 step 1 (NC 3), Task 4 step 2 (NC 4). The ruled deferral (merge tool) is explicitly out of scope. Phases P0–P9 all have cards naming their ruled inputs, NCs, and gates.
- **Known judgment calls (flagged, not hidden):** (1) the existing test `test_the_same_player_in_a_different_event_is_not_flagged` flips by **ruling** — the plan renames it and cites R-DM-1 rather than silently editing an assertion; (2) `askBirthYear` on the invite preview uses the entry page's own rule (any age-bracketed event) for parity with what the nominator's form collected — R12 is respected because the field appears only where the page already asks for years; (3) `adopt_or_mint` is extracted so `rg "EntryPlayer\("` reaches the design doc's one-construction-site gate — behavior-preserving for the submission path by using `_write`'s exact expressions.
- **Type consistency:** `adopt_or_mint` returns `tuple[EntryPlayer, bool]` in Task 1 and is consumed with that exact shape in Tasks 1 (Step 5) and 2 (Step 3). The wire string is `"needs_review_person"` in entry_policy, tests, and entryDisplay alike. `birthYear` is string-typed on the wire and parsed by `parse_year` in the route, matching the entry form's drop-don't-refuse behavior.
- **Line numbers** are as of `53b650a1`/`45b241d2` (tree unchanged since the pinned audit SHA except docs); executors should re-anchor by symbol, not line, if the tree has moved.
