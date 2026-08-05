"""Central input bounds for the API boundary (SP-SEC-1 Phase 1).

One place decides how big any piece of user input may be. Handlers do not
re-check sizes; they receive input that is already bounded, which is the
only arrangement that stays true as endpoints are added — a per-handler
check is a check someone forgets to copy.

Two mechanisms, because Pydantic v2 offers exactly two:

- ``StrictModel`` — a base class carrying ``extra="forbid"`` and a
  generous ``str_max_length`` backstop. Config is inherited through
  subclassing but **does not cascade into nested models**, so every model
  in a request tree must inherit this base for the bound to apply to it.
  Verified, not assumed: a nested plain ``BaseModel`` under a configured
  parent accepts both unknown fields and unbounded strings.
- The ``Annotated`` aliases below — per-field limits for the fields whose
  real-world size is known. A field-level ``max_length`` overrides the
  model-level backstop, so a genuinely long field (an imported CSV) can
  opt out explicitly rather than by omission.

**Why ``extra="forbid"`` is safe on the state blob.** ``PUT
/tournaments/{id}/state`` round-trips a persisted document, so forbidding
unknown keys risks rejecting historical blobs whose shape predates the
current DTO. Checked against every tournament in both local databases
(17 rows): every top-level key and every ``config`` key present in real
stored data is declared on the DTOs. The one server-managed key the
client never sends (``bracket_session``) is merged back in by
``commit_tournament_state`` rather than travelling through the request
model. ``tests/test_input_limits.py`` pins that reasoning with a
real-shaped blob.

**Sizing.** The list caps are set well above any plausible event, not
snugly around today's data: the point is to make a payload that cannot
be a legitimate tournament impossible, not to police tournament size.
The largest real state blob observed is ~20 KB (20 players, 13 matches).
"""
from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

# ---- Whole-request bound ---------------------------------------------

# Ceiling on a single request body, enforced by ``app.body_limit``.
# ~200x the largest observed real state blob. The state PUT is the
# binding case: it carries the whole document, and every write also
# snapshots the prior document into ``tournament_backups``, so an
# oversized body costs storage a multiple of its own size.
MAX_REQUEST_BODY_BYTES = 4 * 1024 * 1024

# ---- String bounds ----------------------------------------------------

# Model-level backstop. Deliberately generous: it exists so that a field
# nobody thought about is still bounded, not to be the real limit. The
# real limits are the aliases below.
DEFAULT_STR_MAX = 10_000

MAX_NAME = 200          # person, group, workspace, event names
MAX_IDENTIFIER = 100    # client-authored ids and slugs
MAX_CODE = 40           # short vocabulary values: ranks, event codes, tags
MAX_NOTES = 2_000       # free-text operator notes
MAX_TIMESTAMP = 64      # ISO-8601 strings
MAX_DESCRIPTION = 2_000 # solver/engine-authored prose (shared req+resp)
MAX_EMAIL = 320         # RFC 5321 maximum
MAX_PASSWORD = 1_024    # above the 128-char policy so an over-long
                        # password is a clean policy error, not a 422
MAX_TOKEN = 512         # reset tokens, idempotency keys
MAX_CSV = 2 * 1024 * 1024   # a pasted roster CSV; bounded by the body
                            # limit anyway, stated here so the field is
                            # explicitly bounded rather than incidentally

Name = Annotated[str, StringConstraints(max_length=MAX_NAME)]
Identifier = Annotated[str, StringConstraints(min_length=1, max_length=MAX_IDENTIFIER)]
OptionalIdentifier = Annotated[str, StringConstraints(max_length=MAX_IDENTIFIER)]
Code = Annotated[str, StringConstraints(max_length=MAX_CODE)]
Notes = Annotated[str, StringConstraints(max_length=MAX_NOTES)]
Timestamp = Annotated[str, StringConstraints(max_length=MAX_TIMESTAMP)]
Description = Annotated[str, StringConstraints(max_length=MAX_DESCRIPTION)]
Email = Annotated[str, StringConstraints(max_length=MAX_EMAIL)]
Password = Annotated[str, StringConstraints(max_length=MAX_PASSWORD)]
Token = Annotated[str, StringConstraints(max_length=MAX_TOKEN)]

# ``#RRGGBB`` or bare ``RRGGBB``. The frontend already normalizes this
# (``resolveTvAccent``), but that is a client-side control on a
# server-stored value, which ASVS v5.0.0-2.2.2 says must not be relied
# on. This is the trusted-layer copy of the same rule.
HexColor = Annotated[str, StringConstraints(pattern=r"^#?[0-9a-fA-F]{6}$")]

# ---- Collection bounds ------------------------------------------------

MAX_PLAYERS = 2_000
MAX_MATCHES = 5_000
MAX_GROUPS = 200
MAX_ASSIGNMENTS = 5_000
MAX_SIDE_MEMBERS = 8        # doubles is 2; 8 leaves room for oddities
MAX_RANKS = 50              # events one player may enter
MAX_WINDOWS = 50            # availability / break windows
MAX_TAGS = 20
MAX_COURT_CLOSURES = 200
MAX_COURTS = 64             # mirrors the existing courtCount bound
MAX_CANDIDATES = 20         # mirrors candidatePoolSize's own ceiling
MAX_HISTORY = 20            # server rotates to 5; 20 tolerates old blobs
MAX_VIOLATIONS = 5_000
MAX_REASONS = 500
MAX_EVENTS = 500
MAX_PLAY_UNITS = 10_000
MAX_ROUNDS = 100            # rounds in a draw (Swiss/RR are the deep ones)

# Ceiling on a client-requested solve budget. The solve rail's own
# determinism defaults bind well below this; it exists so a request
# cannot ask for an unbounded wall-clock spend.
MAX_SOLVE_SECONDS = 300.0


class StrictModel(BaseModel):
    """Base for every model that parses untrusted request input.

    Rejects unknown fields and bounds every string that carries no
    explicit limit of its own. Inherit this on nested models too — the
    config does not reach them otherwise.
    """

    model_config = ConfigDict(extra="forbid", str_max_length=DEFAULT_STR_MAX)


class StrictIgnoringModel(BaseModel):
    """Bounded, but tolerant of unknown fields.

    For the two shapes that must accept input they did not author:
    documents replayed from storage by an older client, and wire formats
    kept deliberately forgiving. Prefer ``StrictModel``; reaching for
    this one needs a reason written at the use site.
    """

    model_config = ConfigDict(extra="ignore", str_max_length=DEFAULT_STR_MAX)
