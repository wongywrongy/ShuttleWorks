"""Graph invariants and refusal/transaction semantics of the shared primitive."""
from dataclasses import replace
from types import SimpleNamespace
import uuid

import pytest

from core.state_machine import REGISTRY, Machine, Transition, TransitionError, apply, check
from core.state_machines import MATCH

MACHINES = tuple(REGISTRY.values())
# I4: expanding this set requires explicit review. unit.member_withdrew is the
# fourth and last entry the v2 plan names: a complete unit that loses a member
# returns to the roster queue, which refuses nobody and is operator-reversible.
NON_CONSEQUENTIAL = {"entry.waitlist_at_cap", "entry.verify", "solve_job.reap",
                     "unit.member_withdrew"}


@pytest.mark.parametrize("machine", MACHINES, ids=lambda m: m.name)
def test_structure(machine):
    assert machine.version > 0
    assert machine.initial and machine.initial <= machine.states
    assert machine.terminal <= machine.states
    reached = set(machine.initial)
    while True:
        expanded = reached | {t.to for t in machine.transitions if reached & t.from_states}
        if expanded == reached:
            break
        reached = expanded
    assert reached == machine.states
    pairs = set()
    for t in machine.transitions:
        assert t.actor in {"operator", "entrant", "system", "bind"}
        assert t.from_states and t.from_states <= machine.states
        assert t.to in machine.states
        assert not (t.from_states & machine.terminal)
        for source in t.from_states:
            assert (source, t.event) not in pairs
            pairs.add((source, t.event))


def test_i4_allowlist_is_exact():
    assert {f"{m.name}.{t.event}" for m in MACHINES for t in m.transitions
            if not t.consequential} == NON_CONSEQUENTIAL


def test_named_guards_resolve():
    from entries import lifecycle
    from workspaces import workspace_modules
    registry = {**lifecycle.GUARDS, **workspace_modules.GUARDS}
    for machine in MACHINES:
        for transition in machine.transitions:
            if transition.guard:
                assert callable(registry[transition.guard])


def subject(status="scheduled", **extra):
    return SimpleNamespace(id=uuid.uuid4(), status=status, machine_version=1, **extra)


@pytest.mark.parametrize("status,event,actor,code", [
    ("scheduled", "record", "operator", "INVALID_TRANSITION"),
    ("scheduled", "call", "system", "ACTOR_NOT_ALLOWED"),
    ("retired", "start", "operator", "INVALID_TRANSITION"),
])
def test_refusal_does_not_mutate(status, event, actor, code):
    row = subject(status)
    with pytest.raises(TransitionError) as error:
        apply(MATCH, row, event, actor, guards={}, session=None)
    assert error.value.code == code
    assert row.status == status


def test_version_is_pinned():
    row = subject()
    row.machine_version = 2
    with pytest.raises(TransitionError, match="graph version"):
        apply(MATCH, row, "call", "operator", guards={}, session=None)
    assert row.status == "scheduled"


def test_guards_run_before_mutation_and_missing_guard_refuses():
    graph = replace(MATCH, transitions=(replace(MATCH.transitions[0], guard="ready"),))
    row = subject()
    with pytest.raises(TransitionError, match="Unknown guard"):
        apply(graph, row, "call", "operator", guards={}, session=None)
    def refuse(row, **context):
        assert row.status == "scheduled"
        raise TransitionError("NOT_READY", "Wait for the court")
    with pytest.raises(TransitionError, match="Wait for the court"):
        apply(graph, row, "call", "operator", guards={"ready": refuse}, session=None)
    with pytest.raises(TransitionError, match="Guard ready refused"):
        apply(graph, row, "call", "operator", guards={"ready": lambda *_args, **_kwargs: False}, session=None)
    assert row.status == "scheduled"


def test_check_has_no_side_effects_and_apply_returns_cause():
    row = subject()
    check(MATCH, row, "call", "operator", guards={})
    assert row.status == "scheduled"
    record = apply(MATCH, row, "call", "operator", guards={}, session=None,
                   actor_id="director", reason="Court ready", detail={"court": 2})
    assert row.status == "called"
    assert (record.from_state, record.to_state, record.event) == ("scheduled", "called", "call")
    assert record.actor_id == "director"
    assert record.machine_version == row.machine_version == 1
    assert record.reason == "Court ready" and record.detail == {"court": 2}


def test_ambiguous_graph_refuses():
    transition = Transition("go", frozenset({"a"}), "b", "operator")
    graph = Machine("ambiguous", 1, frozenset({"a", "b"}), frozenset({"a"}),
                    frozenset({"b"}), (transition, transition))
    with pytest.raises(TransitionError):
        apply(graph, subject("a"), "go", "operator", guards={}, session=None)


def test_existing_schema_vocabularies_match_graphs():
    import re
    from db.models import Entry, MatchStatus, MODULE_STATUSES, SolveJobStatus
    from core.state_machines import ENTRY, MATCH, SOLVE_JOB, WORKSPACE_MODULE
    from sqlalchemy import CheckConstraint
    assert MATCH.states == {state.value for state in MatchStatus}
    assert SOLVE_JOB.states == {state.value for state in SolveJobStatus}
    assert WORKSPACE_MODULE.states == set(MODULE_STATUSES)
    constraint = next(c for c in Entry.__table__.constraints
                      if isinstance(c, CheckConstraint) and c.name == "ck_entries_state")
    assert ENTRY.states == set(re.findall(r"'([^']+)'", str(constraint.sqltext)))


# S-3's acceptance criterion: every state the schema can hold appears in
# exactly one machine. The map is explicit because the link between a table and
# its graph is a decision, not something to infer from a name that happens to
# match — `competition_units` is governed by the machine called `unit`.
SCHEMA_VOCABULARIES = {
    "matches": "match",
    "entries": "entry",
    "submissions": "submission",
    "partner_invitations": "partner_invitation",
    "competition_events": "competition_event",
    "competition_units": "unit",
    "unit_memberships": "unit_membership",
    "draw_instances": "draw_instance",
    "sync_quarantine": "sync_quarantine",
    "tournament_authority_epochs": "authority_epoch",
    "node_operator_enrollments": "node_operator_enrollment",
    "operator_mfa_factors": "operator_mfa_factor",
}


def test_every_check_state_appears_in_exactly_one_machine():
    import re
    import sqlalchemy as sa
    from db.models import Base

    found = {}
    for name, table in Base.metadata.tables.items():
        for constraint in table.constraints:
            if not isinstance(constraint, sa.CheckConstraint):
                continue
            match = re.fullmatch(r"(status|state) IN \(([^)]*)\)", str(constraint.sqltext).strip())
            if match:
                found[name] = (match.group(1), set(re.findall(r"'([^']+)'", match.group(2))))
    assert set(found) == set(SCHEMA_VOCABULARIES)
    for table, (attribute, states) in found.items():
        machine = REGISTRY[SCHEMA_VOCABULARIES[table]]
        assert machine.state_attribute == attribute, table
        assert machine.states == states, table
    # Exactly one: no two machines claim the same table's vocabulary.
    assert len(set(SCHEMA_VOCABULARIES.values())) == len(SCHEMA_VOCABULARIES)


def test_export_check_detects_drift_without_overwriting(tmp_path):
    from pathlib import Path
    import subprocess
    import sys
    root = Path(__file__).resolve().parents[3]
    generator = root / "tools/generate_state_machines.py"
    command = [sys.executable, str(generator), "--output-root", str(tmp_path)]
    subprocess.run(command, check=True, capture_output=True)
    subprocess.run([*command, "--check"], check=True, capture_output=True)
    contract = tmp_path / "packages/shared-contract/state-machines.json"
    contract.write_text('{}\n')
    result = subprocess.run([*command, "--check"], capture_output=True, text=True)
    assert result.returncode == 1
    assert 'state-machines.json' in result.stderr
    assert contract.read_text() == '{}\n'
