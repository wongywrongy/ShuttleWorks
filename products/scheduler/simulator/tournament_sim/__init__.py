"""tournament_sim — internal developer tool: full-tournament workflow simulator.

Drives a complete tournament lifecycle (workspace -> roster/draw -> CP-SAT
solve -> operations command lifecycle -> results/advancement) against a
running ShuttleWorks backend over the REAL HTTP API, then verifies the
server's read-models against the simulator's own ledger.

HARD BOUNDARY: this package must never import backend or scheduler_core
code (``app``, ``api``, ``services``, ``database``, ``repositories``,
``adapters``, ``scheduler_core``). All interaction is HTTP. The rule is
enforced by ``tests/test_import_boundary.py``.
"""

__version__ = "0.1.0"
