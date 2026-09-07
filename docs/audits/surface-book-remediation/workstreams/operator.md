# Operator implementation workstream

Status: active; implementation is shared with the integration owner. Runtime
capture and final finding dispositions remain pending.

## Completed in this workstream

- Setup registration method uses a controlled vocabulary (`Not configured`,
  `Online entry`, `Email or paper entry`, `Invitation only`) and preserves the
  existing API codes. This closes OC11.2's unknown-method submission path.
- Setup timezone presents readable city/region labels in the normal operator
  flow and keeps the canonical timezone value behind the controlled selector.
  DST conversion continues to use the stored value. This closes the copy side
  of OC06.3 without changing persisted timestamps.
- Staff contacts use a controlled role vocabulary and the adjacent explanation
  states the visibility boundary before the operator selects Public (OC12.1,
  OC12.2).
- Setup section pages suppress the overall readiness line when it duplicates
  the section status; a differing or blocking overall state remains visible
  (OC06.2).
- Existing operator shell, workflow navigation, shared form grammar, module
  guards, publication/display ownership, backup recovery, and structured setup
  row editor were reviewed and retained where their current implementation
  already satisfies the reviewed acceptance conditions.

## Verification

- `npm run build` in `apps/console`: passed.
- Operator-focused Vitest selection (setup, hub, settings, product-shell):
  30 test files, 233 tests passed.
- Final capture completed all 33 operator surfaces at 1440×900 and 390×844
  against the controlled fixture. Evidence is in
  `docs/screenshots/ui-review/remediation-2026-09-06/final-operator/`;
  `manifest.json` records HTTP 200, final routes, viewport, and zero console
  errors for each capture.
- A second capture is required after the final hub, setup, invitation, and
  module-language fixes below; the previous final artifact predates those
  changes and is retained only as an intermediate checkpoint.
- The latest extracted final images still show unresolved occurrences: a boxed
  glyph in one hub creation action, indistinct upcoming/live wording, wrapped
  event actions, clipped date/court values, and duplicate Publish display links.
  These remain open until a settled recapture proves otherwise.
- The subsequent backup-list ordinal label (`Latest recovery point` / `Earlier
  recovery point`) is covered by the targeted tests below but is not yet in the
  PDF artifact; regenerate the book after shared-worker integration for exact
  visual closure of OC27.2.

## Open integration work

- Reconcile all operator shared occurrences against the reviewed PDFs and
  record dispositions for every OC ID in `register.md`; the final capture is
  evidence of rendered availability, while interaction and conflict checks
  remain integration work.
- Exercise local offline persistence/reconnect, court conflict projection,
  publication links, and keyboard/dialog states in the integrated harness.

## Operator finding dispositions (code review checkpoint)

The following dispositions are based on the current checked-out code and the
operator component ledgers. `accepted` means the implementation satisfies the
book acceptance condition pending native-size capture; `retained` means the
reviewed component is intentionally kept because its current behavior is
already coherent. Runtime screenshots may lower a disposition if a shared
occurrence still fails.

| IDs | Disposition | Route / implementation evidence |
| --- | --- | --- |
| OC02.1, OC02.2 | open-visual | Hub `/`; latest final images still show indistinct lifecycle wording and a boxed glyph in a creation action. |
| OC03.1 | accepted | `/new`, `/administration/modules`; `NewWorkspacePage` describes tournament types and modules in organizer terms; module descriptions avoid engine/solver vocabulary. |
| OC04.1 | accepted | `/settings`; global settings and auth gate provide an adjacent account sign-in path for local bootstrap users. |
| OC06.1, OC06.2 | accepted | `/setup/*`; `ActionsBar`, `PageBody`, and one landing checklist establish shared edges and avoid repeated readiness. |
| OC06.3 | accepted | `/setup/general`; controlled timezone selector now uses readable labels while preserving canonical values. |
| OC07.1, OC07.2 | open-visual | `/setup/dates`, `/setup/venue`; content-sensitive widths and named courts are implemented, but latest capture still clips values. |
| OC09.1 | open-visual | `/setup/events`; domain rows now request no-wrap actions, but latest capture still wraps all five actions. |
| OC10.1 | implemented-pending-visual | `/setup/rules`; `ScoringFields` now labels the control Points per game and retains best-of-three match wording; native capture still required. |
| OC11.1, OC11.2 | accepted | `/setup/entries`; workflow navigation includes Entry rules and registration uses a controlled option set. |
| OC12.1, OC12.2 | accepted | `/setup/people`; contact rows use human role labels and explain public visibility before selection. |
| OC13.1 | accepted | `/setup/public-info`; URL fields include visual preview treatment in the public-information editor. |
| OC14.1 | accepted | `/participants/people`; roster tables reserve space for identity and only surface issue treatment when present. |
| OC15.1 | accepted | `/competition/draws`; draw progress and participant counts include explicit units. |
| OC20.1 | accepted | `/publish/site`, `/publish/draws-results`; shared save states and action placement are covered by publication settings. |
| OC22.1, OC22.2 | open-visual | `/publish/displays`; DisplayConfig is intended as the single link owner and guidance now uses Publish displays, but latest capture still showed duplicate link UI. |
| OC25.1 | accepted | `/administration/team`; `SharingTab` labels email/link delivery by outcome and keeps field labels persistent. |
| OC26.1 | accepted | `/administration/modules`; `ModuleCatalogRow` describes user capabilities and action consequences. |
| OC27.1 | implemented-pending-visual | `/administration/backups`; replication internals removed from ordinary copy; latest capture was still loading and needs settled verification. |
| OC27.2 | open-content-evidence | `/administration/backups`; ordinal labels, timestamp, size, filename, and origin do not yet prove useful content/change differences before restore. |
| OC29.1 | accepted | `/administration/lifecycle`; workspace admin surfaces share the same heading and property-panel grammar. |
| OC30.1, OC32.1, OC33.1 | accepted | module guards and Meet empty states name the unavailable task and provide a valid next action. |
| OC11.3, OC17.2 | withdrawn | Excluded per reviewed v2 ruling; no new evidence to revive them. |

The remaining operator IDs are owned by the foundations/operations workers:
OC05.1, OC16.1, OC16.2, OC17.1, OC18.1, OC18.2, OC19.1, OC19.2, OC24.1,
OC24.2, and OC24.3. Their shared components are retained here and will be
closed only after the integrated evidence pass.
