# Surface-book remediation handoff

Date: 2026-09-06. The implementation is on feat/surface-book-remediation at full HEAD 7cc638c2589cfe412dc97fccc9b2dfe7aa4367a7 with the concurrent dirty tree preserved. The second release patch is tracked at SHA 013e08004c73b1df6064e7023f39d4092ccbf0ce26f8121ea7ff2b466eedf41a (source patch: /tmp/sw-remediation-release-2.patch). The durable demo backup was verified at 20260906T032956Z before the second make demo-up (prior verified backup: 20260906T032651Z). Image IDs and health are copied to the [compact demo status log](evidence/logs/demo-status-release-2.md); credentials and tokens are omitted.

The deployed URLs are http://100.68.168.126:8090/ (operator console) and http://100.68.168.126:8091/e/ (public entrant); API health is on port 8092. The authoritative operator and public capture outputs are the HTML, manifest, and PDF files under docs/screenshots/ui-review/remediation-2026-09-06/tailscale-release/; both are complete with all continuations.

## Verification

Latest supplied checks are backend 2320 passed / 72 skipped, entrant 885 passed across 50 files, console 2046 passed across 229 files, frontend lint 134 warnings / 0 errors, and 7 browser contract tests. Persistence evidence covers save/reload, dirty-unmount flush, clean unmount without PUT, opaque court-ID round trip, failed-save retry, and restore without phantom PUT. Account evidence covers valid/invalid/expired verification and reset tokens, password change, old-session revocation, controlled human-check success, and safe continuation. No external email or payment provider delivery is claimed.

Reproduction commands are make demo-status, npm run docs:paths, npm run docs:build, .venv/bin/pytest -q, npm run -w apps/console test:run, npm run -w apps/entrant test:run, and node tools/surface-capture.mjs. The capture uses the prepared seed manifest and runtime variables WS_ID, SLUG, DRAW_KEY, DOUBLES_DRAW_KEY, DISPLAY_TOKEN, AUTH_ME_URL, PLAYER_KEY, and CAPTURE_SETTLE_MS; values are supplied through the local environment and are not printed here.

## Durable fixture boundary

The deployed data contains eight playing matches on six courts. Court 1 has a durable current-match conflict (Koki/Kunlavut versus Yudai/Zhu), and Court 3 has a second conflict (MD Jin/Lwi versus Goh/Yap, plus WS Tanvi/Pornpawee). Operations displays both records; Display withholds Courts 1 and 3 and projects the other four. The invariant prevents new double-current assignments, but resolving existing records requires an operator decision. No automated resolution was performed.

Cloud reconnect, external image-host availability, external email/payment delivery, full assistive-technology review, and physical-distance interaction are outside the evidence boundary. Physical-distance is N/R even where the 1920px display render is visible.

Deployed accessibility evidence is [the snapshot](evidence/logs/deployed-accessibility-snapshot.json) and [the schedule capture](evidence/public-schedule-release.png): schedule 13 controls, login 8, players 265, zero unnamed controls, no 390px overflow, and a solid-focus Skip to content link. This is limited automated/accessibility evidence and does not constitute a full WCAG or assistive-technology audit. Player filter clear returns 253 players.

## Document index

## Canonical route closeout - 2026-09-07

The canonical route cleanup was verified against the current route registries
and deployed Tailscale services. Operator capture is complete at 37/37 state
sheets across 28 canonical destinations. Public capture is complete at 40/40
state sheets across 29 canonical destinations; the optional player-detail
state is omitted because the selected fixture has no routable published person
identity. No compatibility aliases or duplicate public index tabs are included
in these books. Expected behavior includes the local operator `/login` landing
continuation, public discovery pagination clamping, and not-found responses for
retired routes. Expected capture errors are the invalid operator invite (422)
and protected public receipt (401).

- [canonical operator surface book](../../screenshots/ui-review/canonical-routes-2026-09-07/operator-console-surface-book.pdf)
- [canonical public surface book](../../screenshots/ui-review/canonical-routes-2026-09-07/public-entrant-surface-book.pdf)
- [operator canonical manifest](../../screenshots/ui-review/canonical-routes-2026-09-07/operator-console-surface-book.manifest.json)
- [public canonical manifest](../../screenshots/ui-review/canonical-routes-2026-09-07/public-entrant-surface-book.manifest.json)

The final current gates recorded by the orchestrator are console 2,346 tests
across 263 files, entrant 1,074 tests across 54 files, backend partner-host
coverage 26 passed, browser route checks 8 passed, and console accessibility
checks 23 passed. Services are healthy at [operator](http://100.68.168.126:8090),
[public entrant](http://100.68.168.126:8091/e/), and API port 8092. The verified
backup is `20260907T185511Z`. External email/payment delivery, cloud reconnect,
full assistive-technology review, and physical-distance viewing remain outside
the evidence boundary.

- [findings register](findings.json), [implementation register](register.md), [route map](route-map.md), and [design contract](design-contract.md).
- [Runtime findings](runtime-findings.md) records RT-12–RT-14 separately from the historical 74-row register.
- [operator review](operator-implementation-review.md) and [public review](public-implementation-review.md).
- Original reviewed books and extracted evidence: [book notes](book-notes.md).
- Final capture files are stored at docs/screenshots/ui-review/remediation-2026-09-06/tailscale-release/operator-console-surface-book.html and operator-console-surface-book.pdf; the reviewable native supplement is [tailscale display](evidence/operator/tailscale-display.png).
- Native evidence: [operator display image](evidence/operator/tailscale-display.png) and [account journey README](evidence/account-journey/README.md).
## Current amendment — 2026-09-08

The current source-based review and rebuilt books are recorded in
[canonical-review.md](canonical-review.md), including the full surface ledger,
fixture corrections, route exclusions, and verification results. The current
operator book has 36 surfaces and 345 PDF pages; the public book has 45 surfaces
and 227 PDF pages. Prior evidence above describes its dated deployment only.
