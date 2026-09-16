"""Exportable definitions. No database, web framework, or domain imports."""
from core.state_machine import Machine, Transition, register


def edge(event, sources, target, actor="operator", guard=None, consequential=True, description=""):
    return Transition(event, frozenset(sources.split()), target, actor, guard, consequential, description)


def machine(name, states, initial, terminal, transitions, attribute="status"):
    return register(Machine(name, 1, frozenset(states.split()), frozenset(initial.split()),
                            frozenset(terminal.split()), tuple(transitions), attribute))


DISPLAY_CAPABILITY = machine("display_capability", "inactive active", "inactive", "", [
    edge("issue", "inactive active", "active"),
    edge("revoke", "inactive active", "inactive"),
])


OPERATOR_MFA_FACTOR = machine("operator_mfa_factor", "unconfigured active", "unconfigured", "", [
    edge("begin", "unconfigured", "unconfigured"),
    edge("begin", "active", "active"),
    edge("activate", "unconfigured active", "active"),
    edge("authenticate", "active", "active"),
    edge("recover", "active", "active"),
    edge("password_change", "active", "active"),
    edge("reissue_recovery_codes", "active", "active"),
    edge("disable", "active", "unconfigured"),
    edge("administrator_reset", "unconfigured active", "unconfigured", "system"),
])

# No terminal state: explicit administrator recovery returns a consumed
# enrollment row to pending, so `consumed` is an end of the happy path only.
NODE_OPERATOR_ENROLLMENT = machine("node_operator_enrollment", "pending consumed", "pending", "", [
    edge("issue", "pending", "pending", "system"),
    edge("activate", "pending", "consumed", "operator"),
    edge("administrator_reset", "pending consumed", "pending", "system"),
])


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

# ---- S-3, derived 2026-09-15 ------------------------------------------
# Six registration/competition graphs plus the two CHECK vocabularies that
# had transition code and no machine (SMV2-3). Derived from the CHECK
# constraints, ADR 0030 and the existing write paths; the appendix in
# docs/explanation/state-machines-v2-defined-plan.md records the derivation
# line by line, including which paths are deliberately NOT modelled.

PARTNER_INVITATION = machine("partner_invitation", "sent accepted expired revoked",
                             "sent", "accepted expired revoked", [
    edge("accept", "sent", "accepted", "entrant",
         description="The named partner completed their own entry; the token is spent."),
    edge("revoke", "sent", "revoked", "entrant",
         description="A fresh invitation supersedes the live one, which is withdrawn with its token."),
    edge("expire", "sent", "expired", "system",
         description="The invitation deadline passed. No write path reaches this today; resolution refuses an expired token by deadline rather than by status."),
])

# No `submit` edge: a submission is created in the state it is meant to
# hold, and `delete_draft` removes a draft rather than moving it.
SUBMISSION = machine("submission", "draft submitted cancelled", "draft submitted", "cancelled", [
    edge("cancel", "submitted", "cancelled",
         description="The desk cancels a submitted record; its live entries are withdrawn and nothing is refunded."),
])

COMPETITION_EVENT = machine("competition_event", "scheduled in_progress completed",
                            "scheduled", "completed", [
    edge("start", "scheduled", "in_progress",
         description="S-8.5: the director starts the event explicitly, before any result."),
    edge("first_result", "scheduled", "in_progress", "system",
         description="S-8.5: the first recorded result starts the event. Today the draw reaching `started` is that signal."),
    edge("complete", "scheduled in_progress", "completed", "system",
         description="The event's draw reached `completed`."),
])

UNIT = machine("unit", "pending confirmed withdrawn", "pending", "withdrawn", [
    edge("roster_complete", "pending", "confirmed", "system", description="The roster reached the format's bounds."),
    edge("member_withdrew", "confirmed", "pending", "system", consequential=False,
         description="I4: a member left a complete unit before the draw. A queue position, not a decision — the desk re-pairs or withdraws."),
    edge("member_withdrew_after_draw", "pending confirmed", "withdrawn", "system",
         description="S-8.4: a member withdrew after the draw was made. Re-pairing is a new unit, so this one ends."),
    edge("withdraw", "pending confirmed", "withdrawn",
         description="The director withdraws the whole unit; every active membership goes with it."),
])

UNIT_MEMBERSHIP = machine("unit_membership", "active withdrawn", "active", "withdrawn", [
    edge("withdraw", "active", "withdrawn", "system",
         description="The entry behind this membership was withdrawn, or the unit was."),
])

# A draw instance MIRRORS the bracket event's status, so every ordered pair
# is reachable: a re-import can move a started draw back to generated. The
# graph is permissive on purpose and says so rather than refusing a move the
# mirror has always made.
DRAW_INSTANCE = machine("draw_instance", "draft generated started completed superseded",
                        "draft generated started completed", "superseded", [
    edge("generate", "draft started completed", "generated", "system"),
    edge("start", "draft generated completed", "started", "system",
         description="The first result on a generated event."),
    edge("complete", "draft generated started", "completed", "system"),
    edge("supersede", "draft generated started completed", "superseded", "system",
         description="The event left the drawn states, or was deleted; this revision stops being current."),
])


SYNC_QUARANTINE = machine("sync_quarantine", "open resolved", "open", "resolved", [
    edge("resolve", "open", "resolved",
         description="An accepted correction operation supersedes the rejected envelope, which stays as evidence."),
])

AUTHORITY_EPOCH = machine("authority_epoch", "preparing active closed recovered cloud",
                          "preparing active cloud", "closed recovered", [
    edge("ready", "preparing", "active", description="The node presented its readiness proof."),
    edge("close", "active", "closed", description="Check-in or handoff drained the operation log."),
    edge("recover", "preparing active", "recovered",
         description="Lost-node recovery rebuilt from a backup plus the receipted operation suffix."),
], "state")
