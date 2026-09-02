# Sync reconciliation

Rejected operation batches are retained in `sync_quarantine` as visible,
append-only evidence. Each record includes the authority epoch, operation id,
sequence/schema details, failure reason, and resolution state. Typical reasons
include `wrong_authority_epoch`, `unsupported_operation_schema`,
`sequence_gap`, and `version_conflict`.

An authorized operator can list open records with:

```text
GET /api/sync/v1/tournaments/{tournamentId}/quarantine
Cookie: authenticated operator session
```

Resolution never edits the rejected operation or its target aggregate. The
operator first applies a normal correction on the authoritative event node and
lets it synchronize. The console obtains eligible, acknowledged operations
from `GET .../quarantine/{id}/corrections`; the operator selects one and sends
its ID plus a reason to `POST .../quarantine/{id}/resolve`. The server repeats
the tournament, epoch, receipt, sequence, and acknowledged-cursor checks before
linking it. The selector is assistance, never authorization. Retrying the same
resolution returns the existing link; a different correction ID is rejected.

The API does not silently replay or auto-rewrite gaps. An operator must first
understand the failure and choose a correction that is valid for the active
authority epoch.
