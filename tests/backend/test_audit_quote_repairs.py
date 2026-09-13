"""Reviewed terms cannot silently change underneath an entry submission."""
import uuid
import test_entries_submit_api as fixtures

client = fixtures.client
turnstile = fixtures.turnstile
page = fixtures.page
entrant = fixtures.entrant


def test_stale_review_creates_nothing_and_replay_survives_closed_page(client, page, entrant):
    from db.models import EntryPage
    from db.session import SessionLocal

    form = {"playerName": "Alice Chen", "gender": "F", "events": [f"0:{page['ws']}"],
            "acknowledged": "on", "_csrf": fixtures._csrf_token(client, page),
            "idempotencyKey": str(uuid.uuid4())}
    quote_url = f"/e/api/quote/{page['slug']}"
    submit_url = f"/e/api/submit/{page['slug']}"
    quoted = client.post(quote_url, data=form)
    assert quoted.status_code == 200
    form["reviewedQuote"] = quoted.json()["reviewedQuote"]
    with SessionLocal() as session:
        row = session.get(EntryPage, uuid.UUID(page["tid"]))
        row.fee_schedule = {"1": 9000}
        row.regulations_version = 4
        session.commit()
    refused = client.post(submit_url, data=form, follow_redirects=False)
    assert refused.status_code == 307
    assert fixtures._submissions(page["tid"]) == []
    form["reviewedQuote"] = client.post(quote_url, data=form).json()["reviewedQuote"]
    saved = client.post(submit_url, data=form, follow_redirects=False)
    assert saved.status_code == 303
    submission, = fixtures._submissions(page["tid"])
    assert submission.fee_total_cents == 9000
    assert submission.regulations_version_accepted == 4
    with SessionLocal() as session:
        row = session.get(EntryPage, uuid.UUID(page["tid"]))
        row.is_open = False
        row.regulations_version = 5
        session.commit()
    replayed = client.post(submit_url, data=form, follow_redirects=False)
    assert replayed.status_code == 303
    assert replayed.headers["location"] == saved.headers["location"]
    assert len(fixtures._submissions(page["tid"])) == 1


def test_missing_review_cannot_submit(client, page, entrant):
    response = client.post(f"/e/api/submit/{page['slug']}", data={
        "playerName": "Alice Chen", "gender": "F", "events": [f"0:{page['ws']}"],
        "acknowledged": "on", "_csrf": fixtures._csrf_token(client, page),
    }, follow_redirects=False)
    assert response.status_code == 307
    assert fixtures._submissions(page["tid"]) == []
