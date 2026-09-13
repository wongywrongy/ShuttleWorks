"""Manual signed ledger. Records never confirm entries; corrections append."""
import uuid
from sqlalchemy import func, select, update
from db.models import Entry, Payment, Submission

AWAITING_PAYMENT = 'awaiting_payment'


def owes_payment(fee_total_cents):
    return fee_total_cents is not None and fee_total_cents > 0


def initial_reasons(fee_total_cents):
    return [AWAITING_PAYMENT] if owes_payment(fee_total_cents) else []


def entries_of(session, submission):
    return list(session.scalars(select(Entry).where(Entry.tournament_id == submission.tournament_id,
        Entry.submission_id == submission.id).order_by(Entry.submitted_at, Entry.id)))


def balance(submission):
    paid = sum(p.amount_cents for p in submission.payments)
    owed = submission.fee_total_cents
    return {'paidCents': paid, 'outstandingCents': None if owed is None else owed - paid,
            'currency': submission.fee_currency}


def record_payment(session, submission, *, amount_cents, currency, note, actor_id, request_id):
    if not isinstance(amount_cents, int) or isinstance(amount_cents, bool) or amount_cents == 0:
        raise ValueError('Record a nonzero amount in cents')
    if not request_id or len(request_id) > 100:
        raise ValueError('A request identity is required')
    # Serialize ledger changes on SQLite and PostgreSQL, including retry lookup.
    session.execute(update(Submission).where(Submission.tournament_id == submission.tournament_id,
        Submission.id == submission.id).values(version=Submission.version))
    session.refresh(submission)
    currency = currency.strip().upper()
    if submission.status == 'draft':
        raise ValueError('Payments require a submitted record')
    if not submission.fee_currency or currency != submission.fee_currency:
        raise ValueError('Payment currency must match the frozen submission currency')
    existing = session.scalar(select(Payment).where(Payment.tournament_id == submission.tournament_id,
        Payment.submission_id == submission.id, Payment.request_id == request_id))
    if existing:
        if (existing.amount_cents, existing.currency, existing.note, existing.actor_id) != (amount_cents, currency, note, actor_id):
            raise ValueError('Request identity was already used for a different payment')
        return existing
    payment = Payment(tournament_id=submission.tournament_id, submission_id=submission.id,
        amount_cents=amount_cents, currency=currency, note=note, actor_id=actor_id, request_id=request_id)
    session.add(payment)
    submission.version += 1
    session.flush()
    session.expire(submission, ['payments'])
    from entries.lifecycle import recompute_reasons
    for entry in entries_of(session, submission):
        recompute_reasons(session, entry)
    return payment


def unpaid_submission_ids(session, tournament_id) -> list[uuid.UUID]:
    paid = select(func.coalesce(func.sum(Payment.amount_cents), 0)).where(
        Payment.tournament_id == Submission.tournament_id, Payment.submission_id == Submission.id).scalar_subquery()
    return list(session.scalars(select(Submission.id).where(Submission.tournament_id == tournament_id,
        Submission.fee_total_cents > paid)))
