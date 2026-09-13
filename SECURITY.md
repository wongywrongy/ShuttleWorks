# Security

ShuttleWorks is tournament-management software from Yunavero for badminton events. It holds
participant names — including minors' — schedules, and operator accounts, and
it is reachable from the public internet.

This document states what is defended, what is deliberately not, and how to
report something we missed.

## Reporting a vulnerability

Email **avlis828@gmail.com** with "Yunavero / ShuttleWorks security" in the subject.
Include what you found, how to reproduce it, and what you think the impact is.

We will acknowledge within a few days. This is a solo-maintained project, so
please allow reasonable time before disclosing publicly. There is no bounty
programme.

Please do **not** open a public GitHub issue for a vulnerability.

## Standard

OWASP ASVS 5.0 is the review framework. Level 1 overall and Level 2 for
identity, sessions, access control and validation are **targets, not a claim of
conformance**. Operator MFA, idle expiry, sensitive-action reauthentication and
other controls remain incomplete.

The [2026-09-13 golden-rule review](docs/reviews/security-golden-rules-2026-09-13.md)
records the verified baseline, including failures and missing tests. The
[remediation program](docs/reference/security-debt-remediation.md) tracks current
implementation; the [debt log](docs/reference/debt-log.md) retains residual work.
A passing test for one control does not establish chapter-wide conformance.

## Threat model

### In scope

The classic web-application threats that free-text fields and public exposure
create:

- **Injection** — SQL, and injection into *derived* outputs. The derived
  surfaces are the dangerous ones: a name that is harmless in the React app can
  still be an attack when it reaches a CSV, an `.ics` file, or an email header,
  because none of those inherit React's escaping.
- **Stored XSS** — a malicious participant, workspace, or organisation name
  stored and later rendered.
- **Input validation and mass assignment** — unbounded fields, malformed
  payloads, and clients setting fields they should not (`role`, `org_id`, `id`,
  ownership, version columns).
- **Resource exhaustion** — open registration plus a compute-heavy solver.
- **Enumeration and information disclosure** — user existence, verbose errors,
  internal topology.
- **Multi-tenant isolation** — one workspace's members must not reach another's
  data, or learn that it exists.

### Explicitly out of scope

**Prompt injection and LLM attacks.** ShuttleWorks has no LLM anywhere in its
request path. The scheduling engine is CP-SAT — a constraint solver over
structured numeric input. There is no model for user text to be injected into,
so there is nothing to defend and no "AI security" surface to audit. We mention
this because it is now a common assumption; here it is simply false.

Also out of scope: physical security of the director's laptop, denial of
service against Cloudflare's edge, and social engineering of tournament staff.

## What is defended

| Control | Mechanism |
|---|---|
| Password storage | Argon2id (`argon2-cffi`, RFC-9106 defaults), transparent rehash on parameter upgrade |
| Password policy | Length-only per NIST 800-63B (no composition rules, no rotation) plus a bundled 5000-entry breached-password blocklist, screened offline |
| Sessions | Opaque server-side rows; the cookie carries a random 256-bit token and only its SHA-256 is stored, so a database leak cannot be replayed |
| CSRF | `SameSite=Lax` plus a required `X-ShuttleWorks-CSRF` header on cookie-carrying writes |
| Credential stuffing | Per-account and per-IP throttle with windowed counts and doubling lockouts |
| Registration abuse | Separate per-IP registration bucket charging **successful** signups, plus `limit_req` at the edge |
| Solver abuse | One active job per workspace (DB partial index) and a per-user cap across all their workspaces |
| Tenancy | Every workspace route requires `Depends(require_tournament_access(role))` and answers a uniform 404 to non-members; a test derives all such routes from the OpenAPI schema and fails CI on a missing seam |
| Input bounds | One central layer (`apps/api/src/core/limits.py`): `extra="forbid"` plus an explicit size vocabulary across every request model |
| Request size | 4 MB ceiling enforced as pure ASGI middleware that counts bytes as they arrive, so omitting `Content-Length` does not bypass it |
| Output encoding | CSV formula-injection prefixing, ICS CR/LF escaping, email header flattening |
| Response headers | CSP (`script-src 'self'`, no `unsafe-inline`), `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors`, conditional HSTS |
| Operational endpoints | `/health/ready\|deep\|metrics` require `X-ShuttleWorks-Ops-Token`; `/health` stays open as dependency-free liveness |
| API documentation | `/docs`, `/redoc`, `/openapi.json` disabled in cloud mode |
| Secrets | File-backed settings are supported; the [inventory](docs/how-to/security-operations.md) names current exceptions and remaining rotation work |
| Database | Postgres bound to the tailnet, never `0.0.0.0` |

Control claims are scoped to their recorded evidence. Historical findings do not
establish that a growing codebase has no injection, outbound-request or rendering
surfaces; the current review and executable checks must identify the actual paths.

### Verification policy

Safety tests must fail when their guard is removed. Record that negative control
alongside the passing check; missing evidence remains an open finding. The dated
review separates executed checks from source inspection and untested claims.

## Known gaps and accepted risks

Stated rather than hidden. Each carries the condition that would change the
decision.

- **Operator/owner MFA is not implemented.** It is required by the approved
  remediation policy, including offline operators; this is an open gap.
- **Operator sessions currently last 30 days without idle expiry or sensitive-action
  reauthentication.** The approved target is 12 hours absolute, one hour idle and
  five-minute authentication freshness for sensitive actions. Those targets are
  not yet enforced.
- **Password minimum is eight characters.** Stronger single-factor policy remains
  an open authentication decision; existing accounts do not establish conformance.
- **`style-src` permits `unsafe-inline`.** The display board computes lane
  colours and a configurable accent into inline `style` attributes. Inline style
  is a far weaker vector than inline script, `script-src` permits neither
  `unsafe-inline` nor `unsafe-eval`, and the accent value is server-side
  pattern-validated. Trigger: any new inline-style surface that carries
  attacker-controlled text rather than colour values.
- **The display plane is a capability URL.** `/display/{token}/*` is
  unauthenticated by design — the link gets typed into a venue television.
  Tokens are 192-bit and rotatable, the projection is a strict allowlist with no
  operator material, and the route is rate-limited and cached. Anyone holding
  the link can read that board; that is the feature.
- **No penetration test has been performed.** This document records an internal
  audit, which is what should precede an external one, not a substitute for it.

## Reporting scope

In scope for a report: anything in the threat model above, on the deployed
application or in this repository.

Out of scope: denial of service, automated scanner output without a demonstrated impact, and
prompt-injection reports (see above — there is no LLM in the request path).
