import uuid
from datetime import datetime, timezone
from tests.backend import test_entries_site_api as fixtures
client = fixtures.client
_an_account = fixtures._an_account
_make_workspace = fixtures._make_workspace
_seed_person_for = fixtures._seed_person_for
_set_dates = fixtures._set_dates

def test_same_account_namesakes_do_not_cross_link_distinct_birth_years(client):
    from db.models import EntryPlayer, EntrantAccount
    from db.session import SessionLocal
    from entries.submissions import PlayerInput, same_person
    account = _an_account('identity-audit@example.test')
    father_tid = _make_workspace(client, name='Audit Senior', slug='audit-senior', entrants_published=True)
    son_tid = _make_workspace(client, name='Audit Junior', slug='audit-junior', entrants_published=True)
    _set_dates(father_tid, '2026-09-19')
    _set_dates(son_tid, '2026-01-10')
    father = _seed_person_for(father_tid, account, 'Alex Chen', event_code='MS')
    son = _seed_person_for(son_tid, account, 'Alex Chen', event_code='U17')
    with SessionLocal() as s:
        s.get(EntrantAccount, account).email_verified_at = datetime.now(timezone.utc)
        s.get(EntryPlayer, (uuid.UUID(father_tid), uuid.UUID(father))).birth_year = 1975
        s.get(EntryPlayer, (uuid.UUID(son_tid), uuid.UUID(son))).birth_year = 2010
        s.commit()
        assert same_person(s, uuid.UUID(father_tid), account, PlayerInput(full_name='Alex Chen', gender='M', birth_year=2010)) is None
    r = client.get(f'/e/api/page/audit-senior/players/{father}')
    assert r.status_code == 200
    linked = [h for h in r.json()['history'] if h['slug'] == 'audit-junior']
    assert linked == []
    reverse = client.get(f'/e/api/page/audit-junior/players/{son}')
    assert reverse.status_code == 200
    assert not any(h['slug'] == 'audit-senior' for h in reverse.json()['history'])
    # The same adoption key across events is still a supported person history.
    with SessionLocal() as session:
        session.get(EntryPlayer, (uuid.UUID(son_tid), uuid.UUID(son))).birth_year = 1975
        session.commit()
    history = client.get(f'/e/api/page/audit-senior/players/{father}').json()['history']
    assert any(h['slug'] == 'audit-junior' and h['playerKey'] == son for h in history)


def test_history_pages_bound_expansion_without_losing_person_links(client):
    account = _an_account('history-page-audit@example.test')
    people = []
    for index in range(14):
        slug = f'audit-history-{index}'
        tid = _make_workspace(client, name=f'History {index}', slug=slug, entrants_published=True)
        _set_dates(tid, f'2026-01-{index + 1:02d}')
        people.append(_seed_person_for(tid, account, 'History Player', birth_year=1990))
    route = f'/e/api/page/audit-history-0/players/{people[0]}'
    first = client.get(route).json()
    assert len(first['history']) == 11
    assert first['historyNextOffset'] == 10
    second = client.get(route + '?history_offset=10').json()
    assert len(second['history']) == 4
    assert second['historyNextOffset'] is None
    other_first = {row['playerKey'] for row in first['history'] if not row['current']}
    other_second = {row['playerKey'] for row in second['history'] if not row['current']}
    assert not other_first & other_second
    assert other_first | other_second == set(people[1:])
