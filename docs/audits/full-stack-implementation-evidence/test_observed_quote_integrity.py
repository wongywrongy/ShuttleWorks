import uuid
from tests.backend.test_entries_submit_api import client, turnstile, page, entrant, _quote, _submit, _submissions

def test_stale_quote_and_regulations(client, page, entrant):
    from db.models import EntryPage
    from db.session import SessionLocal
    before = _quote(client, page).json()['totalCents']
    assert before == 4000
    with SessionLocal() as s:
        p = s.get(EntryPage, uuid.UUID(page['tid']))
        assert p.regulations_version == 3
        p.fee_schedule = {'1': 9000, '2': 12000}
        p.regulations_version = 4
        p.regulations_text = 'Changed terms after review'
        s.commit()
    r = _submit(client, page)
    assert r.status_code == 303
    sub = _submissions(page['tid'])[0]
    assert sub.fee_total_cents == 9000
    assert sub.regulations_version_accepted == 4
    print('CONFIRMED prior quote 4000/version 3; settings changed; submit 303 stores 9000/version 4 with no revised review/consent challenge')
