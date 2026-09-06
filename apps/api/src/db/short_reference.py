"""The entry reference an entrant can read aloud (V3-24-1 / V3-PE39.1).

A submission's primary key is a UUID, and for a while the receipt showed it:
`/e/{slug}/receipt/6f1c2b0e-...` with "Reference 6f1c2b0e-..." underneath the
organizer's name. That is a correct identifier and a terrible reference. The
entrant who has to quote it at a desk, read it down a phone, or type it into
an email is handling 36 characters of hex with four hyphens, and the failure
mode is not "it does not work" — it is a transcription that resolves to
nothing and cannot be told apart from a wrong account.

So a submission carries a second, short name: eight characters from an
alphabet chosen for being read and re-typed by a human under a bit of
pressure. `0/O`, `1/I/L` are absent because that is where transcription
actually fails; `S/5` and `B/8` are kept, because dropping them too leaves an
alphabet small enough that the code has to grow instead, and a longer code is
its own transcription risk (ruling recorded in the debt-log design for
V3-24-1).

**A reference is an identifier, never a capability.** Shortening one does not
change that and must not be read as changing it: `entries_me._own_submission`
resolves a reference only inside `Submission.account_id == <the calling
session's account>`, and an invalid reference, a missing one, and another
account's answer the identical 404. The code is short enough to guess at in a
way a UUID is not, which is precisely why the account gate is the thing doing
the work and always was.

**Why this module sits under ``db/`` rather than in the entries domain that
owns the concept.** The column takes it as its SQLAlchemy ``default``, so
every path that inserts a submission — the entry form, a partner accepting a
nomination, a fixture, a test constructing a row by hand — gets a reference
without having to remember to, which is what makes the ``NOT NULL`` on the
column an invariant rather than a trap. A default has to be callable from
``db.models``, and ``db`` may not import upward into a domain or into
``shared`` (`apps/api/.importlinter`, persistence-direction). It imports
nothing but the standard library, so the direction rule is satisfied by
construction rather than by exception.

The uniqueness index is GLOBAL (`uq_submissions_short_reference`), unlike the
tenant- and account-scoped idempotency index on the same table. The reason is
different in kind: the idempotency key is client-supplied, so its scope is a
disclosure boundary. This one is server-minted and never compared against
anything a caller sends, so the only question is whether a code names one row,
and the simplest true answer is "yes, everywhere".
"""

from __future__ import annotations

import re
import secrets
from typing import Callable

#: Digits and capitals minus the pairs that transcribe wrong: `0`/`O`,
#: `1`/`I`/`L`. Thirty-one symbols, which at eight characters is ~8.5e11
#: codes — enough that a collision is a curiosity rather than a design
#: pressure, and the retry below is a correctness backstop, not a hot path.
ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"

LENGTH = 8

#: The same alphabet as a validator, for every surface that has to decide
#: whether a path segment is a reference before it uses one. The entrant
#: tier holds a byte-identical copy (`apps/entrant/app/routes/receipt.tsx`)
#: because a Node route cannot import Python; the two are pinned together by
#: `tests/backend/test_entries_me_api.py`.
PATTERN = re.compile(f"^[{ALPHABET}]{{{LENGTH}}}$")

# A collision needs a fresh draw, not a retry of the same one. Bounded so a
# broken generator or an exhausted keyspace fails loudly instead of spinning.
_MAX_ATTEMPTS = 8


def new_reference() -> str:
    """One reference. `secrets`, not `random` — this is a public handle."""
    return "".join(secrets.choice(ALPHABET) for _ in range(LENGTH))


def is_reference(value: object) -> bool:
    """True for exactly the strings `new_reference` can produce."""
    return isinstance(value, str) and PATTERN.match(value) is not None


def unique_reference(taken: Callable[[str], bool]) -> str:
    """A reference no existing row holds, per the caller's `taken` predicate.

    The predicate is passed in rather than a session, so the migration that
    backfills existing rows and the service that mints new ones can share one
    definition of "unique" while asking two different questions (a set built
    once for a whole table; a SELECT for a single insert) — and so this
    module stays a pure value type with no query in it, which is what lets
    it sit under ``db/`` without adding a boundary the inventory has to own.

    This closes the realistic collision — two codes drawn far apart in time
    that happen to match. It does not close the flush-time race between two
    concurrent inserts that both passed the check: that one is refused by
    `uq_submissions_short_reference` and surfaces as an `IntegrityError`,
    which is the correct outcome (nothing is written twice) at a probability
    that does not warrant a second write path.
    """
    for _ in range(_MAX_ATTEMPTS):
        candidate = new_reference()
        if not taken(candidate):
            return candidate
    raise RuntimeError(
        f"could not draw an unused submission reference in {_MAX_ATTEMPTS} "
        "attempts; the keyspace or the generator is wrong"
    )
