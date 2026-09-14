# Event-node operator sessions

Event-node operator sessions are short-lived, tournament-scoped credentials
for a WAN outage. They are separate from cloud `auth_sessions`: the token is
stored only as a SHA-256 digest, carries one tournament, authority epoch, and
device identity, and follows the operator session policy (twelve hours
absolute, one hour idle, five minutes for sensitive actions).

Checkout schema v3 also carries an `operatorPolicy` snapshot (schema version
1). It contains the checked-out membership roles plus email/display-name
identity fields, but never password hashes, reset tokens, or cloud session
material. The node imports those users and memberships in the same transaction
as the tournament and authority epoch. Older checkpoints without this optional
field remain import-compatible, but cannot provision an offline operator until
a new checkout supplies the policy.

Each person enrolls individually. A trusted local OS administrator issues a
ten-minute, one-use activation file with `tools/node-operator-enrollment.py`;
the operator exchanges it at `POST /auth/node/activate`, chooses a node-only
password, and enrolls an authenticator on that node. Later sign-ins use
`POST /auth/login?workspaceId=...` followed by the authenticator ceremony. The
HttpOnly `sw_offline_operator` cookie carries the credential, and every request
still passes the normal tournament membership check, so it cannot be used
outside its event. See [security operations](../../how-to/security-operations.md#individual-offline-operators).

The earlier shared-session routes, `POST /tournaments/{id}/authority/offline-session`
and its capability-authenticated `/bootstrap` variant, were retired with operator
MFA. They minted a cookie without an individual password or authenticator proof,
so on an MFA-enforcing node the credential could never authenticate. Both now
answer `410 AUTH_ENDPOINT_GONE` to a member, `404` to a non-member and `401`
anonymously. A shared authority capability cannot establish an individual.

Sessions are revoked through `DELETE
/tournaments/{id}/authority/offline-session` and retain a revocation reason
for audit. They also fail closed as soon as the authority epoch closes, the
device changes, or the operator loses the `operator`/`owner` role. Cloud
login/session behavior is unchanged; cloud sessions are never accepted as
offline credentials and offline credentials are never resolved by the cloud
profile or by a route without that tournament in its path.

Event-node requests do not fall back to the zero-friction `AUTH_MODE=local`
bootstrap identity. Until an individual activation establishes an offline
credential, protected tournament routes return `401`; this prevents a browser
on the venue LAN from becoming an operator merely because the embedded runtime
uses local settings. Device enrollment, signed authority checkout, and the
policy snapshot remain prerequisites for production onboarding.
