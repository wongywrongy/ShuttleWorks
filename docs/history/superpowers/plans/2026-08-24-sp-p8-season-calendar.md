# SP-P8 Public Homepage: Season Calendar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/e/` filter-sidebar listing with a federation-style season calendar: conditional NOW strip, masthead, one control row, month-grouped calendar — fed by one extended public listing payload with server-computed status.

**Architecture:** One new pure status function in `entries/entries_public.py` (composing the canonical `_event_is_open`) feeds an extended `GET /e/api/pages` payload (rows + counts + NOW pick). The entrant loader makes ONE call (retiring the accepted G1 N+1), filters/orders through new pure functions in `app/lib/phase.ts`, and renders four page elements. Zero client JS throughout — search and filters are GET forms, the filter panel is a CSS-only `<details>`.

**Tech Stack:** FastAPI + SQLAlchemy + Pydantic (backend), React Router 7 SSR + Tailwind (entrant), vitest + pytest, Playwright MCP for QA.

**Spec:** the SP-P8 prompt (conversation), plus the Phase 0 audit at `~/.claude/plans/2026-08-24-sp-p8-phase0-audit.md`. The Phase 0 STOP rulings assumed here (Kyle may override): **D1** date window = the single `tournament_date` day; **D2** no city — search covers name+organizer+venue, rows show venue name; **D3** GET-form search, CSS-only filter panel; **D4** build from tokens (mockup file unreachable); **D5** breaking list→object shape change with in-repo consumer updates; **D6** legacy `?status=upcoming` → Season view.

## Global Constraints

- Public tier reads projections only; no new mutation endpoints (§0.2).
- No hardcoded hostnames anywhere (I1); the CI domain-grep guard must stay green.
- Tournament-level facts only: no entrant data, no entry counts on this page, no pricing (§0.4).
- Exactly four page elements; the cut items (season stats, pinned card, inline winner names, default-state filter chips, hero, marketing) must NOT be reintroduced (§0.5).
- 380px must work fully (R11).
- No new frameworks/dependencies (§0.7).
- Every gate/conditional-render test gets a **negative control**: demonstrate it fails when the condition is removed; record each demonstration in the completion report (§0.8, CODE_HEALTH.md 3b).
- Zero client JS in `apps/entrant` (structural — no `<Scripts/>`); no `Date.now()` below loaders; no literal hex colors in entrant markup (tokens only).
- Copy register: sentence case, consumer voice, `·` middot separators.
- Ordering stability: any server list needs a deterministic total order across SQLite/Postgres.
- Commits: conventional prefix per repo history (`feat(entries):`, `feat(entrant):`, `test:`, `docs:`), path-limited `git add`.
- **Phase gate:** after Task 3, STOP and post one payload example per status-enum case before any frontend task.

---

### Task 1: Backend pure status function

**Files:**
- Modify: `apps/api/src/entries/entries_public.py` (add below `_event_is_open`, ~line 130)
- Test: `tests/backend/unit/test_page_status.py` (create)

**Interfaces:**
- Consumes: `_event_is_open(event, now)`, `_aware(value)` (both already in `entries_public.py`).
- Produces: `page_status(*, tournament_date: Optional[str], events: Sequence, draws_published: bool, results_published: bool, now: datetime) -> Tuple[str, Optional[int]]` returning `(status, closes_in_days)`; `PAGE_STATUSES` frozenset of the six enum values. Task 2 imports both.

Status precedence (the D1 ruling made executable): **date facts beat entry flags.** Today == date → in-progress; today > date → completed; otherwise entries open/closed from events. A past tournament with a misconfigured still-open event reads completed, not open.

- [ ] **Step 1: Write the failing tests**

```python
"""The one status function SP-P8 §3 demands: strip, rows and counts all
consume this, so every boundary lives here once (prompt §7 traps)."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from entries.entries_public import PAGE_STATUSES, page_status

NOW = datetime(2026, 9, 12, 12, 0, tzinfo=timezone.utc)


def ev(opens=None, closes=None):
    return SimpleNamespace(opens_at=opens, closes_at=closes)


def test_the_enum_has_exactly_the_six_cases():
    assert PAGE_STATUSES == {
        "entries_open", "entries_closed", "in_progress_live",
        "in_progress", "completed_winners", "completed",
    }


def test_open_event_means_entries_open_with_countdown():
    closes = NOW + timedelta(days=3)
    status, days = page_status(
        tournament_date="2026-10-01", events=[ev(closes=closes)],
        draws_published=False, results_published=False, now=NOW,
    )
    assert (status, days) == ("entries_open", 3)


def test_an_open_event_with_no_deadline_counts_no_days():
    status, days = page_status(
        tournament_date="2026-10-01", events=[ev()],
        draws_published=False, results_published=False, now=NOW,
    )
    assert (status, days) == ("entries_open", None)


def test_closes_later_today_rounds_up_to_one_like_the_tier_always_has():
    # Mirrors app/lib/phase.ts `countdown` (ceil, floor 0) so the server
    # replacing the client derivation is not a behavior change.
    closes = NOW + timedelta(hours=2)
    _, days = page_status(
        tournament_date=None, events=[ev(closes=closes)],
        draws_published=False, results_published=False, now=NOW,
    )
    assert days == 1


def test_skew_row_open_but_deadline_past_floors_at_zero():
    past = NOW - timedelta(hours=1)
    # Two events: one still open (keeps entries_open), one carrying a past
    # deadline is CLOSED by _event_is_open, so only open deadlines count.
    status, days = page_status(
        tournament_date=None, events=[ev(), ev(closes=past)],
        draws_published=False, results_published=False, now=NOW,
    )
    assert (status, days) == ("entries_open", None)


def test_all_events_closed_means_entries_closed():
    past = NOW - timedelta(days=1)
    status, days = page_status(
        tournament_date="2026-10-01", events=[ev(closes=past)],
        draws_published=False, results_published=False, now=NOW,
    )
    assert (status, days) == ("entries_closed", None)


def test_no_events_at_all_is_entries_closed():
    status, _ = page_status(
        tournament_date=None, events=[],
        draws_published=False, results_published=False, now=NOW,
    )
    assert status == "entries_closed"


def test_starts_today_is_in_progress():
    status, days = page_status(
        tournament_date="2026-09-12", events=[ev()],
        draws_published=False, results_published=False, now=NOW,
    )
    assert (status, days) == ("in_progress", None)


def test_in_window_with_draws_published_is_follow_live():
    status, _ = page_status(
        tournament_date="2026-09-12", events=[],
        draws_published=True, results_published=False, now=NOW,
    )
    assert status == "in_progress_live"


def test_ended_yesterday_is_completed():
    status, _ = page_status(
        tournament_date="2026-09-11", events=[ev()],
        draws_published=True, results_published=False, now=NOW,
    )
    assert status == "completed"


def test_completed_with_results_published_carries_winners():
    status, _ = page_status(
        tournament_date="2026-09-11", events=[],
        draws_published=False, results_published=True, now=NOW,
    )
    assert status == "completed_winners"


def test_date_facts_beat_a_still_open_event():
    # A past tournament whose director forgot a closes_at must not list as
    # enterable (prompt §7: ending yesterday renders completed).
    status, _ = page_status(
        tournament_date="2026-09-11", events=[ev()],
        draws_published=False, results_published=False, now=NOW,
    )
    assert status == "completed"


def test_an_unparseable_date_is_treated_as_undated():
    status, _ = page_status(
        tournament_date="sometime in fall", events=[ev()],
        draws_published=False, results_published=False, now=NOW,
    )
    assert status == "entries_open"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/backend/unit/test_page_status.py -v` (repo `.venv` active, repo root)
Expected: FAIL — `ImportError: cannot import name 'page_status'`

- [ ] **Step 3: Implement**

In `apps/api/src/entries/entries_public.py`, directly under `_event_is_open`:

```python
# ---- SP-P8: the one public status function ------------------------------

PAGE_STATUSES = frozenset({
    "entries_open", "entries_closed", "in_progress_live",
    "in_progress", "completed_winners", "completed",
})


def _parse_page_date(raw: Optional[str]) -> Optional[date]:
    """``tournament_date`` is ISO by convention only (a director typed it).
    Unparseable → None, never a guess — the TournamentDTO posture."""
    if not raw:
        return None
    try:
        return date.fromisoformat(str(raw))
    except ValueError:
        return None


def page_status(
    *,
    tournament_date: Optional[str],
    events: Sequence,
    draws_published: bool,
    results_published: bool,
    now: datetime,
) -> Tuple[str, Optional[int]]:
    """The SP-P8 §3 pure status: one enum for strip, rows and counts.

    Precedence: DATE facts beat entry flags. In-window is in-progress even
    if an event is somehow still open; past is completed even if a director
    forgot a ``closes_at``. The window is the single ``tournament_date`` day
    (D1 — the schema has no end date; that column is debt-logged, and this
    function is where an end date would slot in).

    ``closes_in_days`` reproduces the tier's ``countdown`` exactly
    (ceil to whole days, floored at 0 for the clock-skew row) so moving the
    derivation server-side is not a behavior change.
    """
    day = _parse_page_date(tournament_date)
    today = now.date()
    if day is not None and today == day:
        return ("in_progress_live" if draws_published else "in_progress", None)
    if day is not None and today > day:
        return ("completed_winners" if results_published else "completed", None)
    open_events = [ev for ev in events if _event_is_open(ev, now)]
    if not open_events:
        return ("entries_closed", None)
    deadlines = [_aware(ev.closes_at) for ev in open_events if ev.closes_at is not None]
    if not deadlines:
        return ("entries_open", None)
    seconds = (min(deadlines) - now).total_seconds()
    return ("entries_open", max(0, math.ceil(seconds / 86400)))
```

Add to the module's imports: `import math`, and `date` + `Sequence`/`Tuple` if not present (`from datetime import date`; `Sequence`, `Tuple` from `typing` — check the existing import block first and extend it in its style).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/backend/unit/test_page_status.py -v`
Expected: 13 passed

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/entries/entries_public.py tests/backend/unit/test_page_status.py
git commit -m "feat(entries): one pure public status function (SP-P8 §3)" -- apps/api/src/entries/entries_public.py tests/backend/unit/test_page_status.py
```

---

### Task 2: Extend `GET /e/api/pages` to the season listing payload

**Files:**
- Modify: `apps/api/src/entries/entries_json.py:530-559` (replace `EntryPageListItemDTO` + `entry_page_list`)
- Modify: `tests/backend/test_entries_json_routes.py:648-677` (the four existing list tests)
- Test: `tests/backend/test_season_listing.py` (create)

**Interfaces:**
- Consumes: `page_status`, `PAGE_STATUSES` from Task 1; existing `EntryPage`, `Tournament`, `Org`, `EntryEvent` models; `_utcnow` already in `entries_json.py`.
- Produces (wire contract every later task depends on):

```jsonc
GET /e/api/pages →
{
  "tournaments": [{ "slug": str, "name": str|null, "organizer": str|null,
    "venueName": str|null, "date": str|null, "eventCount": int,
    "status": "<one of the six>", "closesInDays": int|null,
    "drawsPublished": bool, "winnersPublished": bool }],
  "counts": { "takingEntries": int, "completed": int },
  "now": { "slug": str, "moreCount": int } | null
}
```
  Rows ordered dated-ascending, undated last, slug tiebreak. `now` = first `in_progress_live` row in that order (single-day windows all "end" the same day, so the order tiebreak IS the ending-soonest rule), `moreCount` = the rest. `Cache-Control: public, max-age=30` (the `entries_site.py:44` convention). `winnersPublished` mirrors `results_published` — winners ride the results flag (SP-P7 §4).

- [ ] **Step 1: Write the failing route tests**

`tests/backend/test_season_listing.py` — same harness as `test_entries_json_routes.py` (its `client` fixture + `isolate_test_database`). Fixture seeds six pages, one per enum case, with dates relative to the real today (the route reads `_utcnow`):

```python
"""SP-P8 §3: the season listing — rows, counts, the NOW pick, the key-set.

Dates are relative to the REAL today because the route derives status from
``_utcnow``; each page is one enum case."""
from datetime import datetime, timedelta, timezone
import uuid

import pytest

from tests.backend._helpers import isolate_test_database

CSRF = {"X-ShuttleWorks-CSRF": "1"}

ROW_KEYS = {
    "slug", "name", "organizer", "venueName", "date", "eventCount",
    "status", "closesInDays", "drawsPublished", "winnersPublished",
}


@pytest.fixture
def client(tmp_path, monkeypatch):
    isolate_test_database(tmp_path, monkeypatch)
    from fastapi.testclient import TestClient
    from core.main import app

    return TestClient(app)


@pytest.fixture
def season(client):
    """Six open pages, one per status enum case, plus one closed page that
    must never appear."""
    from db.models import EntryEvent, EntryPage, Tournament
    from db.session import SessionLocal

    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    yesterday = (now - timedelta(days=1)).date().isoformat()
    next_month = (now + timedelta(days=30)).date().isoformat()

    def make(session, slug, tournament_date, *, draws=False, results=False,
             closes=None, is_open=True, with_event=True):
        tid = client.post(
            "/tournaments", json={"name": slug.replace("-", " ").title()},
            headers=CSRF,
        ).json()["id"]
        t = session.get(Tournament, uuid.UUID(tid))
        t.tournament_date = tournament_date
        session.add(EntryPage(
            tournament_id=uuid.UUID(tid), slug=slug, is_open=is_open,
            venue_name=f"{slug} hall", draws_published=draws,
            results_published=results,
        ))
        if with_event:
            session.add(EntryEvent(
                tournament_id=uuid.UUID(tid), code="MS",
                discipline="Men's Singles", entry_type="singles",
                closes_at=closes,
            ))

    session = SessionLocal()
    try:
        make(session, "case-open", next_month, closes=now + timedelta(days=5))
        make(session, "case-closed", next_month, closes=now - timedelta(days=1))
        make(session, "case-live", today, draws=True)
        make(session, "case-quiet-live", today)
        make(session, "case-winners", yesterday, results=True)
        make(session, "case-done", yesterday)
        make(session, "never-listed", today, is_open=False)
        session.commit()
    finally:
        session.close()
    return {"today": today, "yesterday": yesterday, "next_month": next_month}


def rows_by_slug(body):
    return {row["slug"]: row for row in body["tournaments"]}


def test_every_enum_case_computes_serverside(client, season):
    rows = rows_by_slug(client.get("/e/api/pages").json())
    assert rows["case-open"]["status"] == "entries_open"
    assert rows["case-open"]["closesInDays"] == 5
    assert rows["case-closed"]["status"] == "entries_closed"
    assert rows["case-live"]["status"] == "in_progress_live"
    assert rows["case-quiet-live"]["status"] == "in_progress"
    assert rows["case-winners"]["status"] == "completed_winners"
    assert rows["case-done"]["status"] == "completed"


def test_the_key_set_is_pinned(client, season):
    body = client.get("/e/api/pages").json()
    assert set(body) == {"tournaments", "counts", "now"}
    assert all(set(row) == ROW_KEYS for row in body["tournaments"])
    assert set(body["counts"]) == {"takingEntries", "completed"}


def test_counts_match_the_rows(client, season):
    body = client.get("/e/api/pages").json()
    assert body["counts"] == {"takingEntries": 1, "completed": 2}


def test_the_now_pick_requires_published_draws(client, season):
    # NEGATIVE-CONTROL PAIR (prompt §7 trap 1): case-quiet-live is in
    # window but unpublished — it must NOT be the pick. Removing the
    # draws_published condition from the route makes this fail.
    body = client.get("/e/api/pages").json()
    assert body["now"] == {"slug": "case-live", "moreCount": 0}


def test_two_live_tournaments_pick_one_and_count_the_rest(client, season):
    from db.models import EntryPage, Tournament
    from db.session import SessionLocal

    session = SessionLocal()
    try:
        tid = client.post(
            "/tournaments", json={"name": "Also Live"}, headers=CSRF
        ).json()["id"]
        t = session.get(Tournament, uuid.UUID(tid))
        t.tournament_date = season["today"]
        session.add(EntryPage(
            tournament_id=uuid.UUID(tid), slug="also-live", is_open=True,
            draws_published=True,
        ))
        session.commit()
    finally:
        session.close()
    body = client.get("/e/api/pages").json()
    # Both end "today"; the deterministic order (date, slug) breaks the tie.
    assert body["now"] == {"slug": "also-live", "moreCount": 1}


def test_no_live_tournament_means_now_is_null(client):
    assert client.get("/e/api/pages").json()["now"] is None


def test_a_closed_page_never_appears(client, season):
    assert "never-listed" not in rows_by_slug(client.get("/e/api/pages").json())


def test_rows_order_dated_ascending_then_slug(client, season):
    slugs = [r["slug"] for r in client.get("/e/api/pages").json()["tournaments"]]
    assert slugs == [
        "case-done", "case-winners",          # yesterday, slug-tied
        "case-live", "case-quiet-live",       # today
        "case-closed", "case-open",           # next month
    ]


def test_the_public_cache_header_is_set(client, season):
    assert client.get("/e/api/pages").headers["Cache-Control"] == "public, max-age=30"


def test_no_entrant_or_pricing_data_leaks(client, season):
    # §0.4: tournament-level facts only. The key-set test pins the shape;
    # this pins the intent by name for the reviewer.
    body = client.get("/e/api/pages").json()
    text = str(body)
    assert "entryCount" not in text and "feeCents" not in text
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/backend/test_season_listing.py -v`
Expected: FAIL — rows are `{"slug": ...}` only (old shape), key-set assertion errors.

- [ ] **Step 3: Rewrite the route**

Replace `entries_json.py:530-559` (`EntryPageListItemDTO` + `entry_page_list`) with:

```python
class SeasonRowDTO(BaseModel):
    """One calendar row (SP-P8 §3): tournament-level facts ONLY — no entrant
    data, no entry counts, no pricing. The key-set test in
    ``test_season_listing.py`` reddens on any added field."""

    slug: str
    name: Optional[str] = None
    organizer: Optional[str] = None
    venueName: Optional[str] = None
    date: Optional[str] = None
    eventCount: int
    status: str
    closesInDays: Optional[int] = None
    drawsPublished: bool
    winnersPublished: bool


class SeasonCountsDTO(BaseModel):
    takingEntries: int
    completed: int


class NowStripDTO(BaseModel):
    slug: str
    moreCount: int


class SeasonListDTO(BaseModel):
    tournaments: List[SeasonRowDTO]
    counts: SeasonCountsDTO
    now: Optional[NowStripDTO] = None


@router.get("/pages", response_model=SeasonListDTO)
def entry_page_list(
    response: Response,
    repo: LocalRepository = Depends(get_repository),
) -> SeasonListDTO:
    """The season calendar in one read (SP-P8 §3) — the G1 N+1's retirement.

    ``is_open`` is still the entire gate: it is the page on/off switch, so a
    completed tournament stays listed exactly as long as its director keeps
    the page up, and an unopened one never leaks (the sitemap argument,
    unchanged). Status is ``page_status`` — computed HERE, once; the tier
    must not re-derive it (§3). ``now`` is the strip pick: first
    ``in_progress_live`` row in the (date, slug) order, which with single-day
    windows is the ending-soonest rule.
    """
    now = _utcnow()
    listed = repo.session.execute(
        select(EntryPage, Tournament, Org)
        .join(Tournament, Tournament.id == EntryPage.tournament_id)
        .outerjoin(Org, Org.id == Tournament.org_id)
        .where(EntryPage.is_open.is_(True))
    ).all()
    tids = [t.id for _, t, _ in listed]
    events_by_tid: Dict[uuid.UUID, list] = {}
    if tids:
        for ev in repo.session.scalars(
            select(EntryEvent).where(EntryEvent.tournament_id.in_(tids))
        ):
            events_by_tid.setdefault(ev.tournament_id, []).append(ev)

    rows = []
    for page, tournament, org in listed:
        events = events_by_tid.get(tournament.id, [])
        status, closes_in_days = page_status(
            tournament_date=(
                str(tournament.tournament_date)
                if tournament.tournament_date
                else None
            ),
            events=events,
            draws_published=bool(page.draws_published),
            results_published=bool(page.results_published),
            now=now,
        )
        rows.append(SeasonRowDTO(
            slug=page.slug,
            name=tournament.name,
            organizer=org.name if org is not None and org.name else None,
            venueName=page.venue_name,
            date=(
                str(tournament.tournament_date)
                if tournament.tournament_date
                else None
            ),
            eventCount=len(events),
            status=status,
            closesInDays=closes_in_days,
            drawsPublished=bool(page.draws_published),
            winnersPublished=bool(page.results_published),
        ))
    rows.sort(key=lambda r: (r.date is None, r.date or "", r.slug))

    live = [r for r in rows if r.status == "in_progress_live"]
    response.headers["Cache-Control"] = "public, max-age=30"
    return SeasonListDTO(
        tournaments=rows,
        counts=SeasonCountsDTO(
            takingEntries=sum(r.status == "entries_open" for r in rows),
            completed=sum(
                r.status in ("completed", "completed_winners") for r in rows
            ),
        ),
        now=(
            NowStripDTO(slug=live[0].slug, moreCount=len(live) - 1)
            if live
            else None
        ),
    )
```

Imports to extend at the top of `entries_json.py` (match the existing block's style): `Response` from `fastapi` (check — `Request` is already imported there), `Dict` from `typing`, `Org`, `EntryEvent` (already imported for the projection — verify), and `from entries.entries_public import page_status` added to the existing `entries_public` import line.

- [ ] **Step 4: Update the four displaced list tests**

In `tests/backend/test_entries_json_routes.py:648-677`, the four tests read `[item["slug"] for item in body]` — change each to read `[item["slug"] for item in body["tournaments"]]`. Keep names and intent unchanged (`test_a_closed_pages_slug_never_appears_in_the_list` is a declared negative control and is now double-covered by `test_a_closed_page_never_appears` — keep both; they exercise different fixtures). `test_the_list_is_ordered_by_slug` becomes order-by-`(date, slug)`: the fixture's pages share one date, so assert the slug order still holds and rename to `test_the_list_order_is_stable`.

- [ ] **Step 5: Run the backend suite**

Run: `pytest tests/backend/test_season_listing.py tests/backend/test_entries_json_routes.py tests/backend/test_auth_surface.py -v`
Expected: all pass. If `test_auth_surface.py`'s `/e/api/pages` allowlist entry (`:125-134`) names the old check in prose, update the comment text only — the status-code contract is unchanged.

- [ ] **Step 6: Negative-control demonstrations (record for the completion report)**

1. Temporarily delete `r.status == "in_progress_live"` filter's draws condition path by changing `page_status`'s in-window branch to always return `"in_progress_live"` → `test_the_now_pick_requires_published_draws` FAILS (pick becomes ambiguous) and `test_every_enum_case_computes_serverside` FAILS. Revert.
2. Temporarily add a field `city: Optional[str] = None` to `SeasonRowDTO` → `test_the_key_set_is_pinned` FAILS. Revert.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/entries/entries_json.py tests/backend/test_season_listing.py tests/backend/test_entries_json_routes.py tests/backend/test_auth_surface.py
git commit -m "feat(entries): the season listing payload — status, counts, the NOW pick (SP-P8 §3)" -- apps/api/src/entries/entries_json.py tests/backend/test_season_listing.py tests/backend/test_entries_json_routes.py tests/backend/test_auth_surface.py
```

---

### Task 3: Regenerate console DTOs + Phase 1 STOP

**Files:**
- Modify: `apps/console/src/api/dto.generated.ts` (generated), `apps/console/src/api/dto.ts` (hand-reconciled)

- [ ] **Step 1:** Run `make generate-api` from the repo root. Reconcile `apps/console/src/api/dto.ts` by hand per its header comment (the old `EntryPageListItemDTO` references become `SeasonListDTO`/`SeasonRowDTO`; the console does not consume this endpoint at runtime, so this is type-plumbing only).
- [ ] **Step 2:** Run `npm --prefix apps/console run test:run` and `cd apps/api/src && lint-imports --config ../.importlinter`. Expected: green (import-linter: `entries` importing nothing new cross-domain).
- [ ] **Step 3:** Commit:

```bash
git add apps/console/src/api/dto.generated.ts apps/console/src/api/dto.ts
git commit -m "chore(console): regenerate DTOs for the season listing" -- apps/console/src/api/dto.generated.ts apps/console/src/api/dto.ts
```

- [ ] **Step 4: STOP (Phase 1 gate).** Boot the host backend (`uvicorn core.main:app --port 8600` from `apps/api/src`, repo venv) against a seeded scratch DB (reuse the Task 11 seed script — write it now if executing sequentially), `curl http://localhost:8600/e/api/pages`, and post one payload example per status enum case to Kyle. **No frontend task starts until Kyle acks.**

---

### Task 4: Frontend pure functions (`phase.ts`)

**Files:**
- Modify: `apps/entrant/app/lib/phase.ts` (types + new functions; delete `DiscoveryCard`, `StatusFacetChoice`, `statusFacet`, `cardMatches`, `orderCards`, `toDiscoveryCard`, `cardChipState`; keep `chipState`/`chipLabel`/`visibleTabs`/`activeTab`/`parseMoment`/`parseIsoDate` — the tournament page consumes them)
- Modify: `apps/entrant/app/lib/format.ts` (add `monthLong`)
- Test: `apps/entrant/tests/phase.test.ts` (extend; delete the tests of the deleted functions)

**Interfaces:**
- Consumes: the Task 2 wire contract.
- Produces (everything Tasks 5–8 import):

```ts
export type PageStatus = 'entries_open' | 'entries_closed' | 'in_progress_live'
  | 'in_progress' | 'completed_winners' | 'completed';
export interface SeasonRow { slug: string; name: string | null; organizer: string | null;
  venueName: string | null; date: string | null; eventCount: number; status: PageStatus;
  closesInDays: number | null; drawsPublished: boolean; winnersPublished: boolean; }
export interface SeasonList { tournaments: SeasonRow[];
  counts: { takingEntries: number; completed: number };
  now: { slug: string; moreCount: number } | null; }
export type View = 'season' | 'open' | 'completed';
export interface Filters { view: View; preset: DatePreset | null;
  from: string | null; to: string | null; q: string; }   // DatePreset unchanged: '7d'|'30d'|'90d'
export function parseFilters(params: URLSearchParams): Filters;   // legacy ?status= mapped
export function anyFilterActive(f: Filters): boolean;             // dates or q — view is not a "filter"
export function dateFilterActive(f: Filters): boolean;            // drives the chips row + badge
export function rowMatches(row: SeasonRow, f: Filters, now: Date): boolean;
export function viewRows(rows: readonly SeasonRow[], view: View): SeasonRow[];
export interface MonthGroup { key: string; label: string; rows: SeasonRow[]; }
export function seasonSections(rows: readonly SeasonRow[]):
  { months: MonthGroup[]; completed: SeasonRow[]; undated: SeasonRow[] };
export function monthGroupsDesc(rows: readonly SeasonRow[]): MonthGroup[]; // Completed view
export type StatusCell =
  | { kind: 'chip-live'; label: string; href: string }
  | { kind: 'chip-open'; chip: ChipState }
  | { kind: 'chip-muted'; label: string }
  | { kind: 'link'; label: string; href: string }
  | { kind: 'text'; label: string };
export function statusCell(row: SeasonRow): StatusCell;
// format.ts:
export function monthLong(index: number): string;  // 'January' … 'December'
```

- [ ] **Step 1: Write the failing tests** (append to `tests/phase.test.ts`, following its table-transcription style; delete the `statusFacet`/`cardMatches`/`orderCards`/`toDiscoveryCard`/`cardChipState` describe blocks in the same edit)

```ts
const row = (over: Partial<SeasonRow>): SeasonRow => ({
  slug: 's', name: 'T', organizer: null, venueName: null, date: null,
  eventCount: 0, status: 'entries_closed', closesInDays: null,
  drawsPublished: false, winnersPublished: false, ...over,
});

describe('parseFilters (SP-P8 §2.3 + old-deep-link compatibility)', () => {
  it('defaults to the season view', () => {
    expect(parseFilters(new URLSearchParams()).view).toBe('season');
  });
  it('reads ?view=', () => {
    expect(parseFilters(new URLSearchParams('view=completed')).view).toBe('completed');
  });
  it('maps the legacy ?status=open onto Taking entries', () => {
    expect(parseFilters(new URLSearchParams('status=open')).view).toBe('open');
  });
  it('maps ?status=past to Completed and ?status=upcoming to Season (D6)', () => {
    expect(parseFilters(new URLSearchParams('status=past')).view).toBe('completed');
    expect(parseFilters(new URLSearchParams('status=upcoming')).view).toBe('season');
  });
  it('?view= wins over a legacy ?status=', () => {
    expect(parseFilters(new URLSearchParams('view=season&status=open')).view).toBe('season');
  });
  it('keeps legacy presets valid so old preset links still filter', () => {
    expect(parseFilters(new URLSearchParams('preset=30d')).preset).toBe('30d');
  });
});

describe('rowMatches', () => {
  const now = new Date(Date.UTC(2026, 8, 12));
  it('searches name, organizer and venue (D2 — there is no city)', () => {
    const r = row({ name: 'Fall Open', organizer: 'Balboa BC', venueName: 'Riverside Hall' });
    for (const q of ['fall', 'balboa', 'riverside']) {
      expect(rowMatches(r, { ...NO_FILTERS, q }, now)).toBe(true);
    }
    expect(rowMatches(r, { ...NO_FILTERS, q: 'zurich' }, now)).toBe(false);
  });
  it('custom from/to wins over a preset', () => {
    const r = row({ date: '2026-12-01' });
    const f = { ...NO_FILTERS, preset: '7d' as const, from: '2026-11-01', to: '2026-12-31' };
    expect(rowMatches(r, f, now)).toBe(true);
  });
  it('an undated row fails any date filter', () => {
    expect(rowMatches(row({}), { ...NO_FILTERS, preset: '7d' as const }, now)).toBe(false);
  });
});

describe('viewRows', () => {
  it('open: entries_open only, closing soonest first', () => {
    const rows = [
      row({ slug: 'b', status: 'entries_open', closesInDays: 9 }),
      row({ slug: 'a', status: 'entries_open', closesInDays: 2 }),
      row({ slug: 'c', status: 'completed' }),
    ];
    expect(viewRows(rows, 'open').map((r) => r.slug)).toEqual(['a', 'b']);
  });
  it('completed: both completed statuses, most recent first', () => {
    const rows = [
      row({ slug: 'old', status: 'completed', date: '2026-05-30' }),
      row({ slug: 'new', status: 'completed_winners', date: '2026-08-16' }),
      row({ slug: 'open', status: 'entries_open' }),
    ];
    expect(viewRows(rows, 'completed').map((r) => r.slug)).toEqual(['new', 'old']);
  });
  it('season: everything, in the server order', () => {
    const rows = [row({ slug: 'a' }), row({ slug: 'b' })];
    expect(viewRows(rows, 'season')).toEqual(rows);
  });
});

describe('seasonSections (§2.4: active months ascending, Completed trailing)', () => {
  it('groups active rows by month and trails completed + undated', () => {
    const rows = [
      row({ slug: 'done', status: 'completed', date: '2026-05-30' }),
      row({ slug: 'sep1', status: 'entries_open', date: '2026-09-11' }),
      row({ slug: 'sep2', status: 'entries_closed', date: '2026-09-19' }),
      row({ slug: 'oct', status: 'entries_open', date: '2026-10-03' }),
      row({ slug: 'tbc', status: 'entries_closed', date: null }),
    ];
    const s = seasonSections(rows);
    expect(s.months.map((m) => m.label)).toEqual(['September 2026', 'October 2026']);
    expect(s.months[0].rows.map((r) => r.slug)).toEqual(['sep1', 'sep2']);
    expect(s.completed.map((r) => r.slug)).toEqual(['done']);
    expect(s.undated.map((r) => r.slug)).toEqual(['tbc']);
  });
});

describe('statusCell — the §2.4 table, one arm per enum case', () => {
  it('in_progress_live is a live chip deep-linking to draws', () => {
    expect(statusCell(row({ slug: 'x', status: 'in_progress_live' }))).toEqual({
      kind: 'chip-live', label: 'In progress · follow live', href: '/e/x?tab=draws',
    });
  });
  it('in_progress without published draws is a plain chip — no link', () => {
    expect(statusCell(row({ status: 'in_progress' }))).toEqual({
      kind: 'chip-muted', label: 'In progress',
    });
  });
  it('entries_open carries the countdown chip', () => {
    expect(statusCell(row({ status: 'entries_open', closesInDays: 3 }))).toEqual({
      kind: 'chip-open', chip: { kind: 'entriesOpen', closesInDays: 3 },
    });
  });
  it('entries_closed is the gray chip', () => {
    expect(statusCell(row({ status: 'entries_closed' }))).toEqual({
      kind: 'chip-muted', label: 'Entries closed',
    });
  });
  it('completed_winners links to the winners tab', () => {
    expect(statusCell(row({ slug: 'x', status: 'completed_winners' }))).toEqual({
      kind: 'link', label: 'Winners', href: '/e/x?tab=winners',
    });
  });
  it('completed without winners is TEXT — never a dead link (§7 trap 3)', () => {
    const cell = statusCell(row({ status: 'completed' }));
    expect(cell).toEqual({ kind: 'text', label: 'Completed' });
    expect('href' in cell).toBe(false);
  });
});
```

Define `NO_FILTERS` in the test file: `const NO_FILTERS: Filters = { view: 'season', preset: null, from: null, to: null, q: '' };`

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix apps/entrant run test:run -- tests/phase.test.ts`
Expected: FAIL — `parseFilters` has no `view`, new functions undefined.

- [ ] **Step 3: Implement in `phase.ts`**

```ts
const VIEW_CHOICES = Object.freeze<View[]>(['season', 'open', 'completed']);
/** D6: the retired status facet's values, mapped onto the new views so a
 * mailing-list link from the old page lands on the equivalent state. */
const LEGACY_STATUS_VIEWS = Object.freeze<Record<string, View>>({
  open: 'open', past: 'completed', upcoming: 'season',
});

export function parseFilters(params: URLSearchParams): Filters {
  const view = params.get('view');
  const legacy = params.get('status');
  const preset = params.get('preset');
  return {
    view: VIEW_CHOICES.includes(view as View)
      ? (view as View)
      : legacy !== null && legacy in LEGACY_STATUS_VIEWS
        ? LEGACY_STATUS_VIEWS[legacy]
        : 'season',
    preset: PRESET_CHOICES.includes(preset as DatePreset) ? (preset as DatePreset) : null,
    from: params.get('from') || null,
    to: params.get('to') || null,
    q: params.get('q') ?? '',
  };
}

export function dateFilterActive(f: Filters): boolean {
  return f.preset !== null || f.from !== null || f.to !== null;
}

export function anyFilterActive(f: Filters): boolean {
  return dateFilterActive(f) || f.q.trim() !== '';
}

export function rowMatches(row: SeasonRow, filters: Filters, now: Date): boolean {
  const from = parseIsoDate(filters.from);
  const to = parseIsoDate(filters.to);
  if (from !== null || to !== null || filters.preset !== null) {
    const date = parseIsoDate(row.date);
    if (date === null) return false;
    const t = date.getTime();
    if (from !== null || to !== null) {
      if (from !== null && t < from.getTime()) return false;
      if (to !== null && t > to.getTime()) return false;
    } else {
      const start = utcDayStart(now);
      if (t < start || t > start + presetDays(filters.preset!) * DAY_MS) return false;
    }
  }
  const q = filters.q.trim().toLowerCase();
  if (q !== '') {
    const haystack =
      `${row.name ?? ''} ${row.organizer ?? ''} ${row.venueName ?? ''}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

const COMPLETED_STATUSES = Object.freeze<PageStatus[]>(['completed', 'completed_winners']);

export function viewRows(rows: readonly SeasonRow[], view: View): SeasonRow[] {
  if (view === 'open') {
    return rows
      .filter((r) => r.status === 'entries_open')
      .sort(
        (a, b) =>
          (a.closesInDays ?? Number.POSITIVE_INFINITY) -
            (b.closesInDays ?? Number.POSITIVE_INFINITY) ||
          a.slug.localeCompare(b.slug),
      );
  }
  if (view === 'completed') {
    return rows
      .filter((r) => COMPLETED_STATUSES.includes(r.status))
      .sort(
        (a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.slug.localeCompare(b.slug),
      );
  }
  return [...rows]; // season keeps the server's (date, slug) order
}

function monthKey(row: SeasonRow): string | null {
  const d = parseIsoDate(row.date);
  return d === null ? null : `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
}

function groupByMonth(rows: readonly SeasonRow[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const r of rows) {
    const d = parseIsoDate(r.date)!;
    const key = monthKey(r)!;
    const last = groups[groups.length - 1];
    if (last !== undefined && last.key === key) last.rows.push(r);
    else groups.push({ key, label: `${monthLong(d.getUTCMonth())} ${d.getUTCFullYear()}`, rows: [r] });
  }
  return groups;
}

export function seasonSections(rows: readonly SeasonRow[]): {
  months: MonthGroup[]; completed: SeasonRow[]; undated: SeasonRow[];
} {
  const completed = rows.filter((r) => COMPLETED_STATUSES.includes(r.status));
  const active = rows.filter((r) => !COMPLETED_STATUSES.includes(r.status));
  return {
    months: groupByMonth(active.filter((r) => parseIsoDate(r.date) !== null)),
    completed: [...completed].sort(
      (a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.slug.localeCompare(b.slug),
    ),
    undated: active.filter((r) => parseIsoDate(r.date) === null),
  };
}

export function monthGroupsDesc(rows: readonly SeasonRow[]): MonthGroup[] {
  return groupByMonth(rows.filter((r) => parseIsoDate(r.date) !== null));
  // rows arrive already date-descending from viewRows('completed'); grouping
  // preserves that order, so the months come out most-recent-first.
}

export function statusCell(row: SeasonRow): StatusCell {
  const page = `/e/${encodeURIComponent(row.slug)}`;
  switch (row.status) {
    case 'in_progress_live':
      return { kind: 'chip-live', label: 'In progress · follow live', href: `${page}?tab=draws` };
    case 'in_progress':
      return { kind: 'chip-muted', label: 'In progress' };
    case 'entries_open':
      return { kind: 'chip-open', chip: { kind: 'entriesOpen', closesInDays: row.closesInDays } };
    case 'entries_closed':
      return { kind: 'chip-muted', label: 'Entries closed' };
    case 'completed_winners':
      return { kind: 'link', label: 'Winners', href: `${page}?tab=winners` };
    case 'completed':
      return { kind: 'text', label: 'Completed' };
  }
}
```

Types (`PageStatus`, `SeasonRow`, `SeasonList`, `View`, `Filters`, `MonthGroup`, `StatusCell`) go where `DiscoveryCard` was; delete `DiscoveryCard`, `StatusFacetChoice`, `STATUS_CHOICES`, `statusFacet`, `cardMatches`, `orderCards`, `toDiscoveryCard`, `cardChipState` in the same edit. `format.ts` gains, next to `monthShort`:

```ts
const MONTH_LONG = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December',
]);

export function monthLong(index: number): string {
  return MONTH_LONG[index] ?? '';
}
```

(The mutable-bindings guard in `tests/helpers/sourceGuards.ts` allows frozen literals — match the `STATUS_CHOICES` idiom being deleted.)

- [ ] **Step 4: Run to verify pass**

Run: `npm --prefix apps/entrant run test:run -- tests/phase.test.ts`
Expected: PASS (compile errors from `discovery.tsx`/`FilterStrip.tsx`/`TournamentCard.tsx` consumers are expected in `tsc` until Tasks 5–8 — vitest on this file alone must be green; do NOT run `typecheck:entrant` yet).

- [ ] **Step 5: Commit**

```bash
git add apps/entrant/app/lib/phase.ts apps/entrant/app/lib/format.ts apps/entrant/tests/phase.test.ts
git commit -m "feat(entrant): season pure functions — views, sections, the status cell (SP-P8 §2)" -- apps/entrant/app/lib/phase.ts apps/entrant/app/lib/format.ts apps/entrant/tests/phase.test.ts
```

*(The tree does not typecheck until Task 8 lands; Tasks 4–8 are one PR-sized unit. If executing with subagents, keep them sequential from here to Task 8.)*

---

### Task 5: Update the non-discovery consumer (`sitemapCache`)

**Files:**
- Modify: `apps/entrant/app/lib/sitemapCache.server.ts:78-83` (`fetchOpenSlugs`)
- Modify: `apps/entrant/tests/sitemapCache.test.ts`, `apps/entrant/tests/sitemap.test.ts` (mock payloads)

**Interfaces:**
- Consumes: `SeasonList` from Task 4.

- [ ] **Step 1:** Update the two test files' `/e/api/pages` mock responses from `[{slug}]` to `{"tournaments": [{...full SeasonRow…}], "counts": {"takingEntries": 0, "completed": 0}, "now": null}` (a minimal row helper mirroring Task 4's `row()` is fine in test scope). Run `npm --prefix apps/entrant run test:run -- tests/sitemapCache.test.ts tests/sitemap.test.ts` — expect FAIL (code still maps the old shape).
- [ ] **Step 2:** Change `fetchOpenSlugs`:

```ts
async function fetchOpenSlugs(): Promise<string[]> {
  // The one call this module makes, and the one place it trusts: the
  // listed set of `GET /e/api/pages` IS the public set, verbatim. The
  // SP-P8 payload grew around the slugs; the sitemap still wants only them.
  const season = await apiGet<SeasonList>('/e/api/pages');
  return season.tournaments.map((row) => row.slug);
}
```

with `import type { SeasonList } from './phase';` replacing the `EntryPageListItemDTO` import (delete that type's definition if it lives in `entryPage.types.ts` and nothing else uses it — check with grep first).
- [ ] **Step 3:** Run the same two test files. Expected: PASS.
- [ ] **Step 4:** Commit:

```bash
git add apps/entrant/app/lib/sitemapCache.server.ts apps/entrant/tests/sitemapCache.test.ts apps/entrant/tests/sitemap.test.ts apps/entrant/app/lib/entryPage.types.ts
git commit -m "refactor(entrant): sitemap reads the season payload's slugs" -- apps/entrant/app/lib/sitemapCache.server.ts apps/entrant/tests/sitemapCache.test.ts apps/entrant/tests/sitemap.test.ts apps/entrant/app/lib/entryPage.types.ts
```

---

### Task 6: NOW-strip tokens

**Files:**
- Modify: `packages/design-system/tokens.css`, `packages/design-system/tailwind-preset.js`, `packages/design-system/scripts/check-contrast.mjs`

The mockup's `#0f172a` dark band has no existing token (verified: no inverse/dark-surface token in `tokens.css`), and literal hexes are banned in entrant markup.

- [ ] **Step 1:** Read `tokens.css` and `check-contrast.mjs` headers to match their declaration idioms exactly.
- [ ] **Step 2:** Add to `tokens.css` alongside the surface tokens: `--surface-inverse: #0f172a;`, `--surface-inverse-ink: #ffffff;`, `--surface-inverse-muted: #94a3b8;` (slate-400 on slate-900 ≥ 4.5:1). Map them in `tailwind-preset.js` following the existing `surface-*` entries (yielding `bg-surface-inverse`, `text-surface-inverse-ink`, `text-surface-inverse-muted`). Register both ink/ground pairs in `check-contrast.mjs` in its existing pair format.
- [ ] **Step 3:** Run the contrast gate the way the package runs it (see its `package.json` scripts; fallback `node packages/design-system/scripts/check-contrast.mjs`). Expected: PASS including the two new pairs.
- [ ] **Step 4:** Commit:

```bash
git add packages/design-system/tokens.css packages/design-system/tailwind-preset.js packages/design-system/scripts/check-contrast.mjs
git commit -m "feat(design-system): inverse-surface tokens for the NOW strip (SP-P8 §2.1)" -- packages/design-system/tokens.css packages/design-system/tailwind-preset.js packages/design-system/scripts/check-contrast.mjs
```

---

### Task 7: The four new components

**Files:**
- Create: `apps/entrant/app/components/NowStrip.tsx`
- Create: `apps/entrant/app/components/SeasonStatusCell.tsx`
- Create: `apps/entrant/app/components/SeasonCalendar.tsx`
- Create: `apps/entrant/app/components/SeasonControls.tsx`
- Test: `apps/entrant/tests/components.test.ts` (extend, following its existing render harness)

**Interfaces:**
- Consumes: `SeasonRow`, `Filters`, `View`, `StatusCell`, `statusCell`, `seasonSections`, `monthGroupsDesc`, `dateFilterActive` (Task 4); `StatusChip`, `DateBadge`, `EmptyState` (existing); `formatDateLong` (existing); tokens (Task 6).
- Produces:
  - `NowStrip({ row, moreCount }: { row: SeasonRow; moreCount: number })`
  - `SeasonStatusCell({ cell }: { cell: StatusCell })`
  - `SeasonCalendar({ rows, view }: { rows: SeasonRow[]; view: View })`
  - `SeasonControls({ filters, counts }: { filters: Filters; counts: { takingEntries: number; completed: number } })`

- [ ] **Step 1: Write failing render tests** (extend `tests/components.test.ts`; reuse its render helper and the Task 4 `row()` helper)

```ts
describe('SeasonStatusCell', () => {
  it('renders Winners as a link and bare Completed as text (§7 trap 3)', () => {
    const winners = render(SeasonStatusCell({ cell: statusCell(row({ slug: 'x', status: 'completed_winners' })) }));
    expect(winners).toContain('href="/e/x?tab=winners"');
    const done = render(SeasonStatusCell({ cell: statusCell(row({ status: 'completed' })) }));
    expect(done).toContain('Completed');
    expect(done).not.toContain('<a');
  });
});

describe('NowStrip', () => {
  const live = row({ slug: 'x', name: 'Fall Open', venueName: 'Hall', date: '2026-09-12',
    eventCount: 9, status: 'in_progress_live', drawsPublished: true });
  it('carries the follow-live deep link and NO player count (degraded field)', () => {
    const html = render(NowStrip({ row: live, moreCount: 0 }));
    expect(html).toContain('Now playing');
    expect(html).toContain('href="/e/x?tab=draws"');
    expect(html).not.toMatch(/player/i);
  });
  it('appends +N more only when there is more', () => {
    expect(render(NowStrip({ row: live, moreCount: 1 }))).toContain('+1 more');
    expect(render(NowStrip({ row: live, moreCount: 0 }))).not.toContain('more');
  });
});

describe('SeasonCalendar', () => {
  it('renders month headers and a trailing Completed section under Season', () => {
    const html = render(SeasonCalendar({ view: 'season', rows: [
      row({ slug: 'a', status: 'entries_open', date: '2026-09-11' }),
      row({ slug: 'b', status: 'completed', date: '2026-05-30' }),
    ]}));
    expect(html).toContain('September 2026');
    expect(html).toContain('Completed');
  });
});

describe('SeasonControls', () => {
  it('renders live counts on the segments', () => {
    const html = render(SeasonControls({ filters: NO_FILTERS, counts: { takingEntries: 2, completed: 3 } }));
    expect(html).toContain('Taking entries · 2');
    expect(html).toContain('Completed · 3');
  });
  it('renders ZERO chips and no chip row in the default state (§7 trap 4)', () => {
    const html = render(SeasonControls({ filters: NO_FILTERS, counts: { takingEntries: 0, completed: 0 } }));
    expect(html).not.toContain('data-chip-row');
  });
  it('renders a dismissible chip per active date filter', () => {
    const html = render(SeasonControls({
      filters: { ...NO_FILTERS, preset: '7d' }, counts: { takingEntries: 0, completed: 0 } }));
    expect(html).toContain('data-chip-row');
    expect(html).toContain('Next 7 days');
    expect(html).toContain('Clear all');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm --prefix apps/entrant run test:run -- tests/components.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement.** Structure (all markup token-classes only, consumer register, sentence case; whole-row navigation via the `TournamentCard` stretched-link idiom — name link gets the `::after` stretch, explicit cell links sit above with `relative z-10`):

`SeasonStatusCell.tsx`:

```tsx
/** The §2.4 status column. One fixed-min-width right-aligned cell; the STATE
 * arrives decided (`statusCell`, lib/phase.ts) — no judgement here. Never a
 * dead link: `completed` is text by construction. Links are `relative z-10`
 * so they sit above the row's stretched link. */
import { chipLabel } from '../lib/phase';
import type { StatusCell } from '../lib/phase';
import { StatusChip } from './StatusChip';

export function SeasonStatusCell({ cell }: { cell: StatusCell }) {
  if (cell.kind === 'chip-open') return <StatusChip state={cell.chip} />;
  if (cell.kind === 'chip-live') {
    return (
      <a href={cell.href}
        className="relative z-10 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent hover:underline">
        <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        {cell.label}
      </a>
    );
  }
  if (cell.kind === 'chip-muted') {
    return (
      <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-status-done/40 bg-status-done-bg px-2.5 py-1 text-xs font-medium text-status-done">
        {cell.label}
      </span>
    );
  }
  if (cell.kind === 'link') {
    return (
      <a href={cell.href}
        className="relative z-10 text-sm font-semibold text-accent underline-offset-4 hover:underline">
        {cell.label} →
      </a>
    );
  }
  return <span className="text-sm text-muted-foreground">{cell.label}</span>;
}
```

(`chipLabel` import only if used; drop otherwise. Verify `border-accent/40`-style opacity classes appear elsewhere in the tier — if the class gate rejects them, use the `StatusChip` pattern's dedicated tokens instead.)

`NowStrip.tsx`:

```tsx
/** §2.1: the conditional current-tournament band. Date math + the draws
 * publication flag decided this SERVER-side (`now` on the listing payload);
 * this component renders unconditionally — absence is the page not
 * rendering it at all, never an empty band. Player count: omitted — no
 * public person-count projection exists yet (SP-P7 deferral; upgrade point
 * recorded in the ledger). */
import { formatDateLong } from '../lib/format';
import type { SeasonRow } from '../lib/phase';

export function NowStrip({ row, moreCount }: { row: SeasonRow; moreCount: number }) {
  const parts = [row.venueName, formatDateLong(row.date), `${row.eventCount} events`]
    .filter((p): p is string => p !== null && p !== '');
  return (
    <section aria-label="Now playing" className="bg-surface-inverse">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
        <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-status-live" />
        <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-surface-inverse-muted">
          Now playing
        </span>
        <span className="text-sm font-semibold text-surface-inverse-ink">{row.name}</span>
        <span className="text-sm text-surface-inverse-muted">{parts.join(' · ')}</span>
        <a href={`/e/${encodeURIComponent(row.slug)}?tab=draws`}
          className="ml-auto text-sm font-semibold text-surface-inverse-ink underline-offset-4 hover:underline">
          Follow live — draws &amp; results →
        </a>
        {moreCount > 0 ? (
          <a href="#calendar" className="text-sm text-surface-inverse-muted underline-offset-4 hover:underline">
            +{moreCount} more
          </a>
        ) : null}
      </div>
    </section>
  );
}
```

`SeasonCalendar.tsx` — one card (`SectionCard` skin classes) containing: for `view==='season'`, `seasonSections(rows)` → month groups (header `<h3 class="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</h3>` — small-caps register via uppercase, matching `DateBadge`'s micro-label idiom), then an `Undated`/"Date to be confirmed" group if non-empty, then a `Completed` section; for `view==='completed'`, `monthGroupsDesc(rows)`; for `view==='open'`, a single ungrouped list. Each row (same height class all rows):

```tsx
function CalendarRow({ row }: { row: SeasonRow }) {
  return (
    <li className="relative flex items-center gap-4 border-t border-rule-soft px-4 py-3 hover:bg-surface-sunken">
      <DateBadge date={row.date} />
      <div className="min-w-0 flex-1">
        <a href={`/e/${encodeURIComponent(row.slug)}`}
          className="font-medium text-foreground after:absolute after:inset-0 hover:underline">
          {row.name ?? row.slug}
        </a>
        <span className="sr-only">{formatDateLong(row.date)}</span>
        <p className="truncate text-sm text-muted-foreground">
          {[row.venueName, row.organizer].filter(Boolean).join(' · ')}
        </p>
      </div>
      <span className="hidden text-sm tabular-nums text-muted-foreground sm:block">
        {row.eventCount} events
      </span>
      <div className="flex min-w-32 shrink-0 justify-end">
        <SeasonStatusCell cell={statusCell(row)} />
      </div>
    </li>
  );
}
```

At 380px the row relies on `truncate`/`min-w-0` and the event count hides under `sm:` (`hidden sm:block`) — the status cell stays. If the chip still collides at 380 in the Task 11 sweep, stack it: wrap name+status in a `flex-col sm:flex-row` group. The card wrapper carries `id="calendar"` (the strip's `+N more` target).

`SeasonControls.tsx` — one component, four parts:

1. Search GET form (`action="/e/#calendar"`, hidden inputs carrying `view`/`preset`/`from`/`to` when set): `<input type="search" name="q" defaultValue={filters.q} placeholder="Search tournaments" aria-label="Search tournaments, organizers or venues" className="h-9 w-full max-w-sm ..." />` + submit `Button`.
2. Segmented control: three `<a>` styled as segments (active = `bg-surface-raised shadow-sm` inside a `bg-surface-sunken rounded-lg p-0.5` track, the standard pattern), hrefs built by a local `viewHref(filters, view)` helper that swaps `view` and preserves `q`+date params (the `facetHref` idiom from the deleted `FilterStrip` — reimplement locally, it dies with that file). Labels: `Season`, `Taking entries · {counts.takingEntries}`, `Completed · {counts.completed}`.
3. Filters `<details className="relative">`: `<summary>` styled as a button — `Filters{n > 0 ? ` · ${n}` : ''}` where `n` = active date-filter count; panel is `<div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-rule-soft bg-surface-raised p-4 shadow-md max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:mt-0 max-sm:w-full max-sm:rounded-b-none">` (anchored popover from `sm:`, bottom sheet under it — CSS only, D3). Contents: a GET form with preset radios — `This season` (`value=""`, checked when no date filter; empty value is dropped by the loader's `canonicalQuery`), `Next 7 days` (`7d`), `Next 3 months` (`90d`) — plus `<input type="date" name="from">`/`name="to"`, hidden `q`/`view` carry-alongs, a `Reset` link (`viewHref` with no date params) and an `Apply dates` submit. No status controls in the panel (§2.3 — status lives in the segments).
4. Chips row — **only when `dateFilterActive(filters)`** (§7 trap 4): `<div data-chip-row className="flex flex-wrap gap-2">` with one dismissible chip per active filter (`preset` → its label; `from`/`to` → `From {date}` / `To {date}`), each an `<a>` to the URL minus that param with a `×`, plus `Clear all` (`viewHref` minus all date params). Preset labels: a frozen local record `{ '7d': 'Next 7 days', '30d': 'Next 30 days', '90d': 'Next 3 months' }` — `30d` has no radio but legacy links still filter and label honestly (D6-adjacent ruling).

- [ ] **Step 4: Run to verify pass** — `npm --prefix apps/entrant run test:run -- tests/components.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/entrant/app/components/NowStrip.tsx apps/entrant/app/components/SeasonStatusCell.tsx apps/entrant/app/components/SeasonCalendar.tsx apps/entrant/app/components/SeasonControls.tsx apps/entrant/tests/components.test.ts
git commit -m "feat(entrant): the four season-calendar components (SP-P8 §2)" -- apps/entrant/app/components
```

---

### Task 8: Rebuild `discovery.tsx`, delete the sidebar

**Files:**
- Modify: `apps/entrant/app/routes/discovery.tsx` (full rebuild; `canonicalQuery` + redirect survive verbatim)
- Delete: `apps/entrant/app/components/FilterStrip.tsx`, `apps/entrant/app/components/TournamentCard.tsx`
- Modify: `apps/entrant/tests/discovery.render.test.ts` (rewrite assertions + mock payloads), `apps/entrant/tests/headerSession.test.ts` (mock payload only)

**Interfaces:**
- Consumes: everything from Tasks 4, 5, 7.
- Produces: `DiscoveryLoaderData { filters: Filters; rows: SeasonRow[]; counts: {takingEntries:number; completed:number}; listedCount: number; nowStrip: { row: SeasonRow; moreCount: number } | null; nowMs: number }`.

- [ ] **Step 1: Rewrite the render tests first.** In `discovery.render.test.ts`, replace the `/e/api/pages` + per-page mocks with ONE new-shape payload (drop the per-page mocks entirely). Assert, against a fixture with one row per enum case + a `now` pick:
  - H1 is `Tournaments`; the masthead line is exactly `Badminton tournaments taking entries through ShuttleWorks. Every entry is confirmed by the organizer.`; nothing between masthead and control row.
  - NOW strip renders when `now` is non-null and is ABSENT (no band, no placeholder — assert the section's aria-label is absent from the document) when `now: null`. **Negative-control pair** (§7 trap 1's frontend half): a payload whose in-window row has `status: "in_progress"` and `now: null` renders no strip.
  - Default state: no `data-chip-row` in the document.
  - Segment labels carry the payload counts verbatim.
  - Month header renders (`September 2026` for a `2026-09-*` row); completed row renders `Winners` link when `completed_winners`, plain `Completed` text when `completed`.
  - `?status=open` URL → only `entries_open` rows render (legacy mapping, §7 trap 5).
  - Both empty states: empty `tournaments` → `No tournaments on the calendar yet`; non-empty + `?q=zzz` → `No tournaments match` with a `Clear filters` action.
  - The seven cut shapes are absent: assert the document contains none of `FilterStrip`'s `aria-label="Status"` nav, no `role="search"` duplicated outside the control row, and no element matching `Entries open` outside chips (spot-check level — the deep sweep is Task 11).
  Run: `npm --prefix apps/entrant run test:run -- tests/discovery.render.test.ts` — expect FAIL.
- [ ] **Step 2: Rewrite the loader + component.**

```tsx
export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const canonical = canonicalQuery(url);          // unchanged, E5
  if (canonical !== null) throw redirect(canonical === '' ? '/' : `/?${canonical}`);

  const filters = parseFilters(url.searchParams);
  const season = await apiGet<SeasonList>('/e/api/pages');   // ONE read — the N+1 retired
  const now = new Date();
  const matching = season.tournaments.filter((r) => rowMatches(r, filters, now));
  const nowRow =
    season.now === null
      ? null
      : (season.tournaments.find((r) => r.slug === season.now!.slug) ?? null);
  const payload: DiscoveryLoaderData = {
    filters,
    rows: viewRows(matching, filters.view),
    counts: season.counts,                        // server-side, unfiltered (§2.3)
    listedCount: season.tournaments.length,
    nowStrip: nowRow === null ? null : { row: nowRow, moreCount: season.now!.moreCount },
    nowMs: now.getTime(),
  };
  return payload;
}
```

Component: `<PlayShell>` → `{nowStrip ? <NowStrip …/> : null}` → `<main>` with H1 `Tournaments` + the §2.2 line → `<SeasonControls filters={filters} counts={counts} />` → empty states (listedCount === 0 → the no-tournaments EmptyState with body `No tournament is taking entries right now. Check back soon, or open the entry link your organizer gave you.`; rows.length === 0 with filters active → `No tournaments match` / `Check spelling, change the date range, or clear filters.` + `{ label: 'Clear filters', href: '/e/' }`) → `<SeasonCalendar rows={rows} view={filters.view} />`. Update `meta` title to `Tournaments · ShuttleWorks`. Delete `FilterStrip.tsx` and `TournamentCard.tsx`; grep for remaining imports of either (expect none — `DateBadge`/`StatusChip`/`EmptyState` live on).
- [ ] **Step 3:** Update `headerSession.test.ts`'s `/e/api/pages` mock to the new shape (mechanical).
- [ ] **Step 4:** Run: `npm --prefix apps/entrant run test:run` and `npm --prefix apps/entrant run typecheck`. Expected: full entrant suite + typecheck green.
- [ ] **Step 5: Commit**

```bash
git add -A apps/entrant/app/routes/discovery.tsx apps/entrant/app/components/FilterStrip.tsx apps/entrant/app/components/TournamentCard.tsx apps/entrant/tests/discovery.render.test.ts apps/entrant/tests/headerSession.test.ts
git commit -m "feat(entrant): /e/ is the season calendar; the filter sidebar is gone (SP-P8 §2)" -- apps/entrant/app apps/entrant/tests
```

---

### Task 9: Remove the header search (all public pages)

**Files:**
- Modify: `apps/entrant/app/components/PlayShell.tsx` (delete the `role="search"` form and the `q` prop; header becomes wordmark · TOURNAMENTS · spacer · session link)
- Modify: `apps/entrant/app/routes/discovery.tsx` (drop the `q={filters.q}` pass — the only caller that passes it)
- Modify: `apps/entrant/tests/pageSystem.test.ts` / `apps/entrant/tests/components.test.ts` (whichever asserts the header search — grep `role="search"` in tests first)

- [ ] **Step 1:** Add/adjust the header test: assert the rendered `PlayShell` contains NO `role="search"` and exactly one of the session links (existing §3.8 assertions unchanged). Run — expect FAIL while the form exists.
- [ ] **Step 2:** Delete the form block (`PlayShell.tsx:76-97`) and the `q` prop; keep `signInLabel`. Update the component docstring (drop the Z3 search paragraph, note SP-P8 §4: the calendar page carries its own search; grep the tier for `q={` to confirm no other caller).
- [ ] **Step 3:** Run the full entrant suite + typecheck. Expected: green.
- [ ] **Step 4:** Commit:

```bash
git add apps/entrant/app/components/PlayShell.tsx apps/entrant/app/routes/discovery.tsx apps/entrant/tests
git commit -m "feat(entrant): the header sheds its search — the calendar owns it (SP-P8 §4)" -- apps/entrant/app apps/entrant/tests
```

---

### Task 10: Repo gates + dead-code sweep

- [ ] **Step 1:** `npm --prefix apps/entrant run knip` — expect it to flag any orphan left by the `FilterStrip`/`TournamentCard`/`EntryPageListItemDTO` deletions; delete what it names (nothing else).
- [ ] **Step 2:** `make check` from the repo root (both tiers + ruff + import-linter + pytest). Expected: green. Any failure is fixed before proceeding — no gate is loosened.
- [ ] **Step 3:** Grep the diff for the seven cut shapes (§0.5 reviewer step, scoped to `apps/entrant` — the stale `.claude/worktrees/p7-public-entrant/` copy pollutes repo-wide greps): `git diff main -- apps/entrant | grep -iE "season stats|signed-in card|winner name|hero|FilterStrip"` — expect only deletions.
- [ ] **Step 4:** Commit any knip deletions:

```bash
git add -A apps/entrant
git commit -m "chore(entrant): knip the sidebar leftovers" -- apps/entrant
```

---

### Task 11: Playwright QA + screenshots (Phase 3)

**Files:**
- Create: `<scratchpad>/seed_p8_fixtures.py` (QA-only; not committed)
- Output: `docs/screenshots/sp-p8-after-desktop.png`, `sp-p8-after-mobile-380.png`, `sp-p8-after-now-strip.png`, `sp-p8-after-completed-view.png`, `sp-p8-after-filter-panel.png`, `sp-p8-after-empty-filtered.png`

- [ ] **Step 1: Seed script.** From `apps/api/src` with the repo venv and `DATABASE_URL` pointed at a scratch SQLite file (never `data/local.db`), reuse the Task 2 fixture logic as a standalone script: create the six enum-case pages (via `db.models` + `SessionLocal` directly, dates relative to today) plus a second `in_progress_live` page (the `+1 more` case). Run Alembic first the way `core.main` startup does (starting uvicorn once against the scratch DB migrates it).
- [ ] **Step 2: Boot.** `uvicorn core.main:app --port 8600` from `apps/api/src` against the scratch DB; `API_BASE_URL=http://localhost:8600 npm run dev:entrant` (note the port Vite prints). TRAP: if the Docker stack is up, `make stop` first (CLAUDE.md).
- [ ] **Step 3: The QA matrix** (Playwright MCP; screenshots via absolute paths under `docs/screenshots/`):
  - Every enum case renders its §2.4 cell (live chip linking `?tab=draws`; plain `In progress` unlinked; green countdown chip; gray closed chip; `Winners →` linking `?tab=winners`; plain `Completed` text). Click `Winners →` — lands on the winners tab, not the overview.
  - NOW strip: present with the seeded live pages, shows `+1 more`; flip both live pages' `draws_published` to false in the scratch DB (one UPDATE), reload — strip absent, rows show plain `In progress` (**negative control, live**; re-flip after).
  - Segmented counts match the seeded fixture arithmetic; switching views filters and reorders as specified.
  - Filter lifecycle: open panel → apply `Next 7 days` → chip renders → dismiss chip → full view restored; custom from/to → two chips → `Clear all`.
  - Deep links: `/e/?status=open` shows only the entries-open page (no 404, no empty view); `/e/?preset=30d&q=case` still filters.
  - 380px sweep (`browser_resize 380×840`): control row wraps (search full width), rows stack legibly, panel renders as bottom sheet, no horizontal scroll.
  - Empty states: `?q=zzzz` → `No tournaments match` + Clear filters; point the backend at an EMPTY scratch DB → calendar empty state.
  - Header: no search input on `/e/`, `/e/{slug}`, `/e/login` (spot-check three routes).
- [ ] **Step 4:** Any finding → fix → rerun the relevant vitest file + the QA step. Kill both dev servers when done.

---

### Task 12: Docs, ledger, completion report

**Files:**
- Modify: `docs/reference/api/index.md` (the `/e/api/pages` entry → new payload shape)
- Modify: `docs/reference/debt-log.md` (add: end-date column (D1); note the SP-P7 person-count upgrade point for the NOW strip)
- Create: `docs/history/programs/P8_PROGRESS.md` (ledger: session record, rulings D1–D6 as applied, gates run)
- Modify: any doc the freshness/link gates flag

- [ ] **Step 1:** Update the three docs. The completion report (in `P8_PROGRESS.md`) must include: the **negative-control list** (Task 2 step 6 both demonstrations, Task 8's strip-absent pair, Task 11's live draws-flag flip, the phase.test dead-link case), the **shipped degradation mode** (full mode except the NOW-strip player count — no person-count projection; upgrade = projection-side only), the before/after screenshot filenames, and the §9 done-conditions checklist ticked with the verifying command per line.
- [ ] **Step 2:** `npm run docs:build` (link gate) — expect green.
- [ ] **Step 3:** Final `make check`. Expected: green.
- [ ] **Step 4:** Commit:

```bash
git add docs/reference/api/index.md docs/reference/debt-log.md docs/history/programs/P8_PROGRESS.md
git commit -m "docs: SP-P8 season calendar — api reference, debt-log, ledger + completion report" -- docs
```

---

## Self-review notes (already applied)

- Spec coverage: §2.1→T2/T7/T8, §2.2→T8, §2.3→T4/T7, §2.4→T4/T7/T8, §3→T1/T2/T3, §4→T9, §5→full mode + player-count omission (T7/T12), §6 STOPs→T3 step 4 (Phase 1) and the standing Phase 0 STOP, §7 traps→named in T1/T2/T4/T7/T8/T11 tests, §9→T12 checklist.
- Deliberate exclusions (§8 non-goals): no pagination, no personalization, no operator-console changes beyond the generated DTO file.
- Type consistency: `SeasonRow`/`SeasonList`/`Filters`/`StatusCell` defined once in Task 4 and consumed by name in 5/7/8; wire keys defined once in Task 2 and mirrored in Task 4's `SeasonRow`.
- Open risk: `tests/discovery.render.test.ts` and `components.test.ts` harnesses were not read line-by-line — the executor must follow each file's existing render/mock idiom rather than the sketches' exact helper names.
