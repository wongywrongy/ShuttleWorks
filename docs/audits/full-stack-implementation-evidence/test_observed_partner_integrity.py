import uuid
from datetime import datetime, timedelta, timezone
from tests.backend.test_partner_invites import client, mailbox, turnstile, world, _verified_entrant, _nominate, _accept

def test_acceptance_missing_money_and_consent_version(client, world, mailbox):
    from db.models import Entry, EntryPage, Submission
    from db.session import SessionLocal
    _verified_entrant(client, mailbox, 'alex@example.com')
    out = _nominate(client, world, partner_email='sam@example.com')
    token = out['invites'][0][1]
    with SessionLocal() as s:
        p = s.get(EntryPage, uuid.UUID(world['tid']))
        p.fee_schedule = {'1': 5000}
        p.regulations_version = 7
        s.commit()
    _verified_entrant(client, mailbox, 'sam@example.com')
    r = _accept(client, token)
    assert r.status_code == 200
    with SessionLocal() as s:
        e = s.get(Entry, (uuid.UUID(world['tid']), uuid.UUID(r.json()['entryId'])))
        sub = s.get(Submission, (e.tournament_id, e.submission_id))
        assert sub.fee_total_cents == 5000
        assert e.fee_cents is None
        assert 'awaiting_payment' not in e.pending_reasons
        assert sub.regulations_version_accepted is None
        print('CONFIRMED paid partner: total=5000, entry fee=NULL, reasons=[], regulations version=NULL (page=7)')

def test_acceptance_ignores_closed_event_and_capacity(client, world, mailbox):
    from db.models import Entry, EntryEvent, EntryPage
    from db.session import SessionLocal
    _verified_entrant(client, mailbox, 'alex@example.com')
    out = _nominate(client, world, partner_email='sam@example.com')
    token = out['invites'][0][1]
    with SessionLocal() as s:
        event = s.get(EntryEvent, (uuid.UUID(world['tid']), uuid.UUID(world['xd'])))
        event.closes_at = datetime.now(timezone.utc) - timedelta(days=1)
        event.cap = 1
        event.gender_constraint = 'M'
        s.get(EntryPage, uuid.UUID(world['tid'])).is_open = False
        s.commit()
    _verified_entrant(client, mailbox, 'sam@example.com')
    r = _accept(client, token, gender='F')
    assert r.status_code == 200
    with SessionLocal() as s:
        e = s.get(Entry, (uuid.UUID(world['tid']), uuid.UUID(r.json()['entryId'])))
        assert e.state == 'pending'
        assert 'over_cap' not in e.pending_reasons
        assert 'gender_mismatch' not in e.pending_reasons
        print('CONFIRMED accepts after page/event close; full cap bypassed; mismatching gender unflagged')

def test_two_pre_resolved_acceptances_create_three_halves(client, world, mailbox):
    from sqlalchemy import select
    from db.models import Entry, EntrantAccount
    from db.session import SessionLocal
    from entries import partners
    _verified_entrant(client, mailbox, 'alex@example.com')
    out = _nominate(client, world, partner_email='sam@example.com')
    token = out['invites'][0][1]
    _verified_entrant(client, mailbox, 'sam@example.com')
    _verified_entrant(client, mailbox, 'third@example.com')
    with SessionLocal() as a, SessionLocal() as b:
        ea, eb = partners.resolve(a, token), partners.resolve(b, token)
        aid = a.scalars(select(EntrantAccount.id).where(EntrantAccount.email == 'sam@example.com')).one()
        bid = b.scalars(select(EntrantAccount.id).where(EntrantAccount.email == 'third@example.com')).one()
        pa = partners.accept(a, ea, account_id=aid, full_name='Sam', gender='F')
        a.commit()
        pb = partners.accept(b, eb, account_id=bid, full_name='Third', gender='F')
        b.commit()
        paid, pbid = pa.id, pb.id
    with SessionLocal() as s:
        original = s.get(Entry, (uuid.UUID(world['tid']), uuid.UUID(out['entry_id'])))
        assert original.partner_entry_id == pbid
        assert s.get(Entry, (original.tournament_id, paid)).partner_entry_id == original.id
        print('CONFIRMED forced overlapping-read interleave: two accepted partner rows; original points only to second')

def test_withdrawn_partner_remains_present_on_survivor(client, world, mailbox):
    from db.models import Entry
    from db.session import SessionLocal
    from tests.backend.test_partner_invites import CSRF, PW
    _verified_entrant(client, mailbox, 'alex@example.com')
    out = _nominate(client, world, partner_email='sam@example.com')
    token = out['invites'][0][1]
    _verified_entrant(client, mailbox, 'sam@example.com')
    accepted = _accept(client, token)
    partner_id = accepted.json()['entryId']
    withdrawn = client.post(f'/e/api/me/entries/{partner_id}/withdraw', json={}, headers=CSRF)
    assert withdrawn.status_code == 200
    with SessionLocal() as s:
        original = s.get(Entry, (uuid.UUID(world['tid']), uuid.UUID(out['entry_id'])))
        other = s.get(Entry, (original.tournament_id, uuid.UUID(partner_id)))
        assert other.state == 'withdrawn'
        assert original.state == 'pending'
        assert original.partner_entry_id == other.id
        assert 'awaiting_partner' not in original.pending_reasons
    client.cookies.clear()
    assert client.post('/e/account/login', json={'email':'alex@example.com','password':PW}, headers=CSRF).status_code == 200
    result = client.get('/e/api/me/entries')
    assert result.status_code == 200
    payload = result.json()
    def find_entry(obj):
        if isinstance(obj, dict):
            if obj.get('entryId') == out['entry_id']: return obj
            for val in obj.values():
                hit = find_entry(val)
                if hit: return hit
        if isinstance(obj, list):
            for val in obj:
                hit = find_entry(val)
                if hit: return hit
        return None
    line = find_entry(payload)
    assert line is not None
    assert line['partner']['identity']['name'] == 'Sam Ali'
    print('CONFIRMED withdrawal: other half withdrawn; survivor pending, no awaiting_partner; My Entries still projects accepted partner name with no partner lifecycle')
