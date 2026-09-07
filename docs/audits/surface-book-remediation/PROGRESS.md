# Surface-book remediation - PROGRESS

Date: 2026-09-06. The reviewed books remain historical evidence with no implied commit. The source of truth is findings.json (74 rows: 40 operator, 34 public), with source/review pages, baseline ratings, routes, actual files, decisions, evidence, implementationStatus, and remainingSeverity preserved.

Route cleanup update: 2026-09-07. The current route checks are separate from the
historical surface-book checks. They assert canonical destinations and verify
that retired workspace and global URLs stay on their requested URL while
rendering not-found; they do not rewrite or re-score the reviewed evidence.

## Completed evidence

- Final canonical Tailscale capture: operator 37/37 state sheets across 28 canonical destinations; public 40/40 state sheets across 29 canonical destinations, both at 1440x900 and 390x844 DPR2 with continuations. The selected public fixture omits Player detail because it has no routable published person identity. Deployed durable data is T029 with two existing court conflicts; the Korea fixture is supplemental evidence. OC24 display evidence is supplemented by evidence/operator/display-1920.png; physical-distance interaction remains N/R.
- Native evidence is retained under evidence/operator/, including session-layout, roster-width, Taipei OC17 matches, controlled preview/error fallback, setup failure retry, backup inspection/restore, and display revoke confirmation.
- Public coverage includes the canonical route set and explicitly labelled state sheets. Account journey evidence covers real token verification/reset/recovery, password change, old-session revocation, and safe continuation; no external email/payment delivery is claimed.
- Final supplied checks: console 2346 tests across 263 files; entrant 1074 tests across 54 files; backend partner-host coverage 26 passed; browser route checks 8 passed; console accessibility checks 23 passed. Frontend lint, typecheck, builds, and docs checks also pass. Earlier aggregate totals are superseded by these latest counts.
- Persistence boundary evidence covers save/reload, dirty-unmount flush, clean unmount without PUT, opaque court-ID round trip, failed-save retry, and restore without phantom PUT.
- Deployment succeeded via make demo-up after the verified backup at 20260906T032651Z. Services are healthy; authoritative Tailscale captures are complete.
- Deployed accessibility snapshot is retained at evidence/logs/deployed-accessibility-snapshot.json: 0 unnamed controls, 390px document width at 390px viewport, and solid-focus Skip to content across schedule, login, and players. This is limited automated evidence, not a full WCAG or assistive-technology audit.
- Route cleanup: current capture inventory now follows canonical workflow routes only. Console redirect aliases, duplicate public `events`/`seeds`/`winners` index sheets, disabled `/entries` and `/roster` guard aliases, and partner-signup path variants were removed from current capture requests. Historical surface IDs and reviewed PDFs remain unchanged; the current route authority is `WORKFLOW_ROUTES` plus the entrant route registry. Canonical destination counts and additional state sheets are separated in each new manifest.

## Current assessment

All 74 findings are accepted and implemented with remainingSeverity 0. PE23.1 and PE26.1 are closed by the verified account journeys. The operator and public reports contain all 33 and 39 per-surface baseline/current rows and category before/after tables. Current scores are reasoned integrated ratings; no independent review is claimed.

## Remaining boundaries

- Final canonical books and manifests are linked from the handoff; the current deployed stack is healthy.
- External email/payment delivery, full assistive-technology review, and interactive browser offline journey remain outside the recorded evidence boundary.
