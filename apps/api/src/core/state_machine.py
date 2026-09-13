"""Pure transition definitions and a transaction-neutral execution primitive."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Literal, Mapping
import uuid

Actor = Literal["entrant", "operator", "system", "bind"]
GuardRegistry = Mapping[str, Callable[..., bool | None]]


@dataclass(frozen=True)
class Transition:
    event: str
    from_states: frozenset[str]
    to: str
    actor: Actor
    guard: str | None = None
    consequential: bool = True
    description: str = ""


@dataclass(frozen=True)
class Machine:
    name: str
    version: int
    states: frozenset[str]
    initial: frozenset[str]
    terminal: frozenset[str]
    transitions: tuple[Transition, ...]
    state_attribute: str = "status"

    def edge(self, current: str, event: str) -> Transition:
        matches = [t for t in self.transitions if current in t.from_states and t.event == event]
        if len(matches) != 1:
            raise TransitionError("INVALID_TRANSITION", f"Cannot {event} {self.name} from '{current}'")
        return matches[0]

    def targets(self, current: str) -> list[str]:
        return list(dict.fromkeys(t.to for t in self.transitions if current in t.from_states))


class TransitionError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class TransitionRecord:
    machine: str
    machine_version: int
    subject_type: str
    subject_id: str
    tournament_id: uuid.UUID | None
    from_state: str
    to_state: str
    event: str
    actor_type: Actor
    actor_id: str | None
    reason: str | None
    detail: dict
    occurred_at: datetime

    def persist(self, session):
        # Lazy import keeps definitions/export independent of database and routes.
        from dataclasses import asdict
        from db.models import StateTransition
        row = StateTransition(**asdict(self))
        session.add(row)
        return row


REGISTRY: dict[str, Machine] = {}
GUARDS: dict[str, Callable[..., bool | None]] = {}


def set_transition_actor(session, actor_type: Actor, actor_id) -> None:
    """Attach the authenticated principal to a request-scoped unit of work."""
    session.info["transition_actor"] = {"type": actor_type, "id": str(actor_id)}


def register(machine: Machine) -> Machine:
    if machine.name in REGISTRY and REGISTRY[machine.name] != machine:
        raise ValueError(f"Machine already registered: {machine.name}")
    REGISTRY[machine.name] = machine
    return machine


def check(machine: Machine, row: Any, event: str, actor: Actor, *,
          guards: GuardRegistry, session=None, context=None) -> Transition:
    version = getattr(row, "machine_version", None)
    if version is not None and version != machine.version:
        raise TransitionError("MACHINE_VERSION_MISMATCH", f"Unsupported {machine.name} graph version {version}")
    transition = machine.edge(getattr(row, machine.state_attribute), event)
    if transition.actor != actor:
        raise TransitionError("ACTOR_NOT_ALLOWED", f"Only {transition.actor} may {event} {machine.name}")
    if transition.guard:
        guard = guards.get(transition.guard)
        if guard is None:
            raise TransitionError("GUARD_NOT_REGISTERED", f"Unknown guard: {transition.guard}")
        if guard(row, session=session, **(context or {})) is False:
            raise TransitionError("GUARD_REFUSED", f"Guard {transition.guard} refused {event}")
    return transition


def apply(machine: Machine, row: Any, event: str, actor: Actor, *,
          guards: GuardRegistry, session, actor_id=None, reason=None,
          detail=None, context=None) -> TransitionRecord:
    """Validate before mutation. Return one record; the caller adds it, never commits.

    Detached objects are supported for domain validation. Persisted callers must
    add the returned record in the same transaction as the subject mutation.
    """
    transition = check(machine, row, event, actor, guards=guards, session=session, context=context)
    previous = getattr(row, machine.state_attribute)
    if actor_id is None and session is not None:
        identity = session.info.get("transition_actor", {})
        if identity.get("type") == actor:
            actor_id = identity.get("id")
    record = TransitionRecord(
        machine.name, machine.version, getattr(row, "__tablename__", machine.name),
        str(row.id), getattr(row, "tournament_id", None), previous, transition.to,
        event, actor, str(actor_id) if actor_id is not None else None, reason,
        dict(detail or {}), datetime.now(timezone.utc),
    )
    setattr(row, machine.state_attribute, transition.to)
    if hasattr(row, "machine_version"):
        row.machine_version = machine.version
    return record
