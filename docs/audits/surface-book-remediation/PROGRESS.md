# Surface-book remediation - PROGRESS

Date: 2026-09-06. The reviewed books remain historical evidence with no implied commit. The source of truth is findings.json (74 rows: 40 operator, 34 public), with source/review pages, baseline ratings, routes, actual files, decisions, evidence, implementationStatus, and remainingSeverity preserved.

## Completed evidence

- Operator authoritative Tailscale capture: 33/33 routes at 1440x900 DPR2; public authoritative Tailscale capture: 39/39 routes with continuations. Deployed durable data is T029 with two existing court conflicts; the Korea fixture is supplemental evidence. OC24 display evidence is supplemented by evidence/operator/display-1920.png; physical-distance interaction remains N/R.
- Native evidence is retained under evidence/operator/, including session-layout, roster-width, Taipei OC17 matches, controlled preview/error fallback, setup failure retry, backup inspection/restore, and display revoke confirmation.
- Public coverage includes 39 declared routes plus runtime player detail. Account journey evidence covers real token verification/reset/recovery, password change, old-session revocation, and safe continuation; no external email/payment delivery is claimed.
- Latest supplied checks: backend 2320 passed / 72 skipped; entrant 885 tests across 50 files; console 2046 tests across 229 files; frontend lint 134 warnings / 0 errors. Earlier public aggregate totals are superseded by these latest counts.
- Persistence boundary evidence covers save/reload, dirty-unmount flush, clean unmount without PUT, opaque court-ID round trip, failed-save retry, and restore without phantom PUT.
- Deployment succeeded via make demo-up after the verified backup at 20260906T032651Z. Services are healthy; authoritative Tailscale captures are complete.
- Deployed accessibility snapshot is retained at evidence/logs/deployed-accessibility-snapshot.json: 0 unnamed controls, 390px document width at 390px viewport, and solid-focus Skip to content across schedule, login, and players. This is limited automated evidence, not a full WCAG or assistive-technology audit.

## Current assessment

All 74 findings are accepted and implemented with remainingSeverity 0. PE23.1 and PE26.1 are closed by the verified account journeys. The operator and public reports contain all 33 and 39 per-surface baseline/current rows and category before/after tables. Current scores are reasoned integrated ratings; no independent review is claimed.

## Remaining checkpoints

- Root owns the final gate and second-build provenance; authoritative Tailscale captures are complete and linked from the handoff.
- Root owns the final full-gate record after the last session-input fix and documentation check.
- External email/payment delivery, full assistive-technology review, and interactive browser offline journey remain outside the recorded evidence boundary.
