import uuid
import pytest
from datetime import datetime, timedelta, timezone
import test_partner_invites as fixtures
from test_partner_invites import _verified_entrant, _nominate, _accept

client = fixtures.client
mailbox = fixtures.mailbox
turnstile = fixtures.turnstile
world = fixtures.world

def test_acceptance_records_money_and_consent_version(client, world, mailbox):
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
        assert e.fee_cents == 5000
        assert 'awaiting_payment' in e.pending_reasons
        assert sub.regulations_version_accepted == 7

def test_acceptance_refuses_closed_page_and_event(client, world, mailbox):
    from db.models import EntryEvent, EntryPage
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
    assert r.status_code == 404

def test_two_pre_resolved_acceptances_cannot_create_three_halves(client, world, mailbox):
    from sqlalchemy import select
    from db.models import Entry, EntrantAccount
    from db.session import SessionLocal
    from entries import partners
    _verified_entrant(client, mailbox, 'alex@example.com')
    out = _nominate(client, world, partner_email='sam@example.com')
    token = out['invites'][0][1]
    _verified_entrant(client, mailbox, 'sam@example.com')
    _verified_entrant(client, mailbox, 'third@example.com')
    review = client.get(f"/e/api/partner-invites/{token}").json()["reviewedQuote"]
    with SessionLocal() as a, SessionLocal() as b:
        ea, eb = partners.resolve(a, token), partners.resolve(b, token)
        aid = a.scalars(select(EntrantAccount.id).where(EntrantAccount.email == 'sam@example.com')).one()
        bid = b.scalars(select(EntrantAccount.id).where(EntrantAccount.email == 'third@example.com')).one()
        pa = partners.accept(a, ea, account_id=aid, full_name='Sam', gender='F', acknowledged=True, reviewed_quote=review)
        a.commit()
        with pytest.raises(partners.InvitationUnavailable):
            partners.accept(b, eb, account_id=bid, full_name='Third', gender='F', acknowledged=True, reviewed_quote=review)
        b.rollback()
        paid = pa.id
    with SessionLocal() as s:
        original = s.get(Entry, (uuid.UUID(world['tid']), uuid.UUID(out['entry_id'])))
        assert original.paired_entry_id == paid
        assert s.get(Entry, (original.tournament_id, paid)).paired_entry_id == original.id

def test_withdrawn_partner_leaves_history_and_requires_replacement(client, world, mailbox):
    from db.models import Entry
    from db.session import SessionLocal
    from test_partner_invites import CSRF, PW
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
        assert original.paired_entry_id == other.id
        assert 'awaiting_partner' in original.pending_reasons
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
    assert line['partner'] is None
    assert 'awaiting_partner' in line['pendingReasons']


def test_failed_acceptance_rolls_back_claim_and_allows_review_retry(client, world, mailbox):
    from db.models import Entry
    from db.session import SessionLocal
    from test_partner_invites import CSRF
    _verified_entrant(client, mailbox, 'alex@example.com')
    out = _nominate(client, world, partner_email='sam@example.com')
    token = out['invites'][0][1]
    _verified_entrant(client, mailbox, 'sam@example.com')
    refused = client.post(f"/e/api/partner-invites/{token}/accept", json={
        "fullName": "Sam", "gender": "F", "acknowledged": True,
        "reviewedQuote": "outdated",
    }, headers=CSRF)
    assert refused.status_code == 404
    with SessionLocal() as db:
        entry = db.get(Entry, (uuid.UUID(world['tid']), uuid.UUID(out['entry_id'])))
        assert entry.invitation.token_hash is not None
        assert entry.invitation_accepted_at is None
        assert entry.paired_entry_id is None
    assert _accept(client, token).status_code == 200
