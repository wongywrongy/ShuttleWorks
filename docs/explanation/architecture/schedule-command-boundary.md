# Schedule command boundary

The live proposal commit route (`POST /tournaments/{id}/schedule/proposals/{proposal}/commit`)
now uses the schedule application boundary. Solver computation and proposal review stay
outside the database transaction; the application boundary owns one commit for the
tournament document, normalized `matches` projection, and (on an event-node deployment)
the `EventOperation` + `SyncOutbox` pair.

The operation command is `meet.schedule.commit.v1`, with aggregate
`tournament_schedule/{tournament_id}`. Its payload contains the proposal id, resulting
schedule version, normalized schedule/config, and the replaced-state history entry so a
projection can deterministically rebuild the schedule.

The slice deliberately does not cover direct state PUTs, backup restore, bracket session
metadata, plan-finalized writes, entries mutations, or match state transitions. Those
paths remain legacy persistence paths until their own application boundaries are approved.
