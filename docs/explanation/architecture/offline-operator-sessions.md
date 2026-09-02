# Event-node operator sessions

Event-node operator sessions are short-lived, tournament-scoped credentials
for a WAN outage. They are separate from cloud `auth_sessions`: the token is
stored only as a SHA-256 digest, carries one tournament, authority epoch, and
device identity, and expires after a bounded window (72 hours by default,
168 hours maximum).

Checkout schema v3 also carries an `operatorPolicy` snapshot (schema version
1). It contains the checked-out membership roles plus email/display-name
identity fields, but never password hashes, reset tokens, or cloud session
material. The node imports those users and memberships in the same transaction
as the tournament and authority epoch. Older checkpoints without this optional
field remain import-compatible, but cannot provision an offline operator until
a new checkout supplies the policy.

`POST /tournaments/{id}/authority/offline-session` is available only in the
`event_node` deployment profile and requires the caller to already be an
authorized tournament operator. The node verifies that the authority epoch is
active and belongs to the requested device before setting the HttpOnly
`sw_offline_operator` cookie. Every request still passes the normal tournament
membership check, so the credential cannot be used outside its event.

On a freshly imported node there is no cloud-origin cookie to present. The
installer/onboarding flow calls
`POST /tournaments/{id}/authority/offline-session/bootstrap` with the signed
checkout capability, node id/epoch, and the selected policy member's user id.
The capability is checked against the active authority and is not stored; the
new credential is returned only as an HttpOnly cookie and only its digest is
persisted. This is a node bootstrap proof, not a cloud login or a LAN-wide
anonymous password.

Sessions are revoked through `DELETE
/tournaments/{id}/authority/offline-session` and retain a revocation reason
for audit. They also fail closed as soon as the authority epoch closes, the
device changes, or the operator loses the `operator`/`owner` role. Cloud
login/session behavior is unchanged; cloud sessions are never accepted as
offline credentials and offline credentials are never resolved by the cloud
profile or by a route without that tournament in its path.

Event-node requests do not fall back to the zero-friction `AUTH_MODE=local`
bootstrap identity. Until the bootstrap endpoint establishes an offline
credential, protected tournament routes return `401`; this prevents a browser
on the venue LAN from becoming an operator merely because the embedded runtime
uses local settings. Device enrollment, signed authority checkout, and the
policy snapshot remain prerequisites for production onboarding.
