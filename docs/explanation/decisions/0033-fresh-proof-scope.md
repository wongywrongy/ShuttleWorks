# ADR 0033: Fresh operator proof guards actions and artefacts, not reads

**Status:** Accepted — 2026-09-14. Closes item (1) of debt SGR-20260914-K6.

## Context

Operator sessions carry app-owned MFA (P08). A session lasts at most twelve
hours from issue and one hour idle, and only deliberate input counts as
activity. On top of that, sensitive workspace routes declare
`require_tournament_access(role, fresh=True)`: after the tenant and role checks,
a session whose last authenticator proof is older than five minutes answers
`401 AUTH_REAUTH_REQUIRED`, and the console raises its verification lock and
retries the call once (`apps/console/src/api/sessionRestore.ts`).

The review of P08 found that the bracket and match-state file exports are
fresh-gated while the JSON reads behind the same data are not:
`GET /tournaments/{id}/bracket` returns the body that `export.json` returns, and
`GET /tournaments/{id}/match-states` returns the map the match-state download
contains. A member with a live but stale session can read what an export would
contain.

## Decision

Fresh proof is scoped to **actions and to artefacts that leave the browser**:
deleting a workspace, changing membership or ownership, issuing or revoking
display and staff links, authority lifecycle changes, backup create, download,
delete and restore, bulk file exports, and authenticator management. It does
**not** gate the JSON reads the console renders from, including the reads an
export could be rebuilt from.

## Rationale

- **Gating the reads breaks the product.** The Run, Plan and Display surfaces
  poll those reads continuously. A five-minute fresh window would re-lock every
  operator every five minutes through a live event.
- **The reads are already bounded by the session.** They require a live MFA
  session of a member with the right role: at most one hour since the last
  deliberate input and twelve hours since sign-in, revocable server-side.
- **The fresh gate protects a different thing.** Its purpose is that a walked-up
  or replayed session cannot take irreversible actions or walk away with a file
  in one click. A stolen live session could read the JSON in any case; no
  per-endpoint freshness rule changes that, and the one-hour idle limit is the
  control that bounds it.
- **Alternatives rejected.** A separate export role would split the operator
  role without narrowing who can read the same JSON. A rate limit on reads would
  throttle the polling surfaces before it slowed a determined reader.

## Consequences

- New routes follow one test: if it changes durable state beyond an ordinary
  edit, or produces a file the operator takes away, add `fresh=True`. If the
  console renders from it, do not. Autosave writes (`PATCH /tournaments/{id}`,
  `PUT /tournaments/{id}/state`) are ordinary edits.
- The fresh-gated set is pinned by
  `tests/backend/test_operator_mfa_http.py::test_sensitive_routes_require_fresh_proof_after_tenant_denial`.
- Revisit this if an audit requirement demands step-up for bulk reads. The
  likely shape then is a separate export API, not gating the polling reads.
