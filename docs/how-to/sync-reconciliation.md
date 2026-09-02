# Sync reconciliation

Rejected operation batches are retained in `sync_quarantine` as visible,
append-only evidence. Each record includes the authority epoch, operation id,
sequence/schema details, failure reason, and resolution state. Typical reasons
include `wrong_authority_epoch`, `unsupported_operation_schema`,
`sequence_gap`, and `version_conflict`.

An authorized operator can list open records with:

```text
GET /api/sync/v1/tournaments/{tournamentId}/quarantine
X-ShuttleWorks-Authority-Epoch: {epoch}
Authorization: Bearer {capability}
```

Resolution never edits the rejected operation or its target aggregate. The
operator submits a reason and correction payload to
`POST .../quarantine/{id}/resolve`; the service appends a
`sync.quarantine.correction.v1` operation and marks the evidence resolved in
the same transaction. Retrying an already-resolved record returns the original
correction operation, so a network retry cannot produce two corrections.

The API does not silently replay or auto-rewrite gaps. An operator must first
understand the failure and choose a correction that is valid for the active
authority epoch.
