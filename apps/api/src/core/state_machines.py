"""Exportable definitions. No database, web framework, or domain imports."""
from core.state_machine import Machine, Transition, register


def edge(event, sources, target, actor="operator", guard=None, consequential=True, description=""):
    return Transition(event, frozenset(sources.split()), target, actor, guard, consequential, description)


def machine(name, states, initial, terminal, transitions, attribute="status"):
    return register(Machine(name, 1, frozenset(states.split()), frozenset(initial.split()),
                            frozenset(terminal.split()), tuple(transitions), attribute))


MATCH = machine("match", "scheduled called playing finished retired", "scheduled", "retired", [
    edge("call", "scheduled", "called"),
    edge("start", "called", "playing"),
    edge("record", "playing", "finished"),
    edge("retire", "playing", "retired"),
    edge("postpone", "called playing", "scheduled"),
    edge("undo_finish", "finished", "playing", description="Undo finish corrects a live-day mis-tap and removes the match from standings again. Retirement remains terminal."),
])
SOLVE_JOB = machine("solve_job", "queued claimed running succeeded failed infeasible cancelled",
                    "queued", "succeeded failed infeasible cancelled", [
    edge("claim", "queued", "claimed", "system"),
    edge("run", "claimed", "running", "system"),
    edge("succeed", "running", "succeeded", "system"),
    edge("infeasible", "running", "infeasible", "system"),
    edge("fail", "claimed running", "failed", "system"),
    edge("reap", "claimed running", "queued", "system", consequential=False),
    edge("cancel", "queued claimed running", "cancelled"),
])
WORKSPACE_MODULE = machine("workspace_module", "available enabled disabled coming_soon",
                          "available coming_soon", "coming_soon", [
    edge("enable", "available disabled", "enabled", guard="display_has_operator"),
    edge("disable", "enabled", "disabled", guard="keeps_one_operational"),
])
ENTRY = machine("entry", "unverified pending waitlisted confirmed rejected withdrawn",
                "unverified pending", "rejected withdrawn", [
    edge("verify", "unverified", "pending", "system", consequential=False),
    edge("waitlist_at_cap", "pending unverified", "waitlisted", "system", guard="at_capacity", consequential=False),
    edge("confirm", "pending", "confirmed", guard="is_pending_exactly"),
    edge("reject", "unverified pending waitlisted", "rejected"),
    edge("promote", "waitlisted", "pending"),
    edge("withdraw", "unverified pending waitlisted confirmed", "withdrawn", "entrant", "before_withdrawal_deadline"),
    edge("operator_withdraw", "unverified pending waitlisted confirmed", "withdrawn"),
], "state")
