import uuid
from datetime import datetime, timezone
from tests.backend.test_entries_site_api import client, _an_account, _make_workspace, _seed_person_for, _set_dates

def test_same_account_namesakes_cross_link_despite_distinct_birth_years(client):
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
    assert len(linked) == 1
    assert linked[0]['playerKey'] == son
    assert linked[0]['eventCodes'] == ['U17']
    reverse = client.get(f'/e/api/page/audit-junior/players/{son}')
    assert reverse.status_code == 200
    assert any(h['slug'] == 'audit-senior' and h['playerKey'] == father for h in reverse.json()['history'])
    print('CONFIRMED same-account same-name father (1975) and son (2010): adoption rejects identity match, anonymous public profiles cross-link histories both ways, father history contains son U17 event')
