"""Hash-seed determinism guard (SP-CLOUD-2 Phase 0.C hardening).

``PYTHONHASHSEED=0`` is a *mask*, not a fix: the engine's model build
iterates hash-ordered sets (``cpsat_backend._player_matches``), so any
interpreter with hash randomization active builds a different CP-SAT
model — and can emit a different schedule at equal objective. The job
rail pins the seed (``solve_runner`` sets the env; ``solve_child``
refuses to run unpinned), but a solve invoked anywhere else — an
in-request interactive solve, an ad-hoc script, a notebook, a bare
pytest run — silently reverts to nondeterministic model builds.

This module makes that reversion loud. It deliberately WARNS rather
than raises outside the job rail: the interactive solve sites
(repair / warm-restart / proposals / director / bracket) legitimately
run in the unpinned API process per the SP-CLOUD-1 C3 decision, and
their results are applied immediately rather than replayed, so
failing them on every dev host would be a regression, not a guard.
The proper fix — sorted iteration at the model-build site — is
tracked in docs/audits/debt-log.md.
"""
from __future__ import annotations

import logging
import sys

log = logging.getLogger("scheduler.determinism")

# Sites that already warned this process — one unmissable line per
# site per interpreter, not one per solve (the suggestions worker can
# solve every few seconds).
_warned_sites: set[str] = set()


def hash_seed_pinned() -> bool:
    """True when this interpreter runs with hash randomization off.

    ``sys.flags.hash_randomization`` is the interpreter's actual state
    (0 exactly when launched with ``PYTHONHASHSEED=0``) — checking it
    beats re-parsing the env var, which can be set-but-ignored (e.g.
    exported after interpreter start).
    """
    return sys.flags.hash_randomization == 0


def warn_if_unpinned(site: str) -> bool:
    """Emit one unmissable error-level line if determinism was requested
    in an unpinned interpreter. Returns True when a warning fired."""
    if hash_seed_pinned():
        return False
    if site in _warned_sites:
        return True
    _warned_sites.add(site)
    log.error(
        "DETERMINISM NOT GUARANTEED [%s]: deterministic solve requested but "
        "this interpreter has hash randomization active "
        "(PYTHONHASHSEED!=0). Model build order — and therefore the "
        "schedule — may differ between runs/hosts at equal objective. "
        "The job rail (solve worker) pins the seed automatically; for "
        "reproducible results elsewhere, launch with PYTHONHASHSEED=0.",
        site,
    )
    return True
