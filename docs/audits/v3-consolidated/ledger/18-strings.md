# Ledger — package 18 (account, team, tools, settings)

Columns per plan §4: string key/file:line · surface · state · current text · verdict · final text · factual prerequisite · finding IDs · evidence.

## Local profile (V3-OC04.1)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `GlobalSettingsPage.tsx` `ProfilePage` locked block | Settings → Account → Profile | `isBootstrap` (local mode) | Placement: reason + link sat below the read-only fields, after "Change photo"/fields | change (reorder + reword) | New block leads the page: "Sign in with an account to edit your profile." + a "Sign in" link, before the avatar/fields | `useAuth().isBootstrap` gates all edit affordances already (unchanged logic, only placement/copy) | V3-OC04.1 | `apps/console/src/modules/settings/__tests__/GlobalSettingsPage.test.tsx` new `describe('V3-OC04.1…')`, asserts DOM order via `compareDocumentPosition` |
| same block, link text | same | same | "Sign in to edit your profile" (a plain text link, secondary-looking, below the form) | change | "Sign in" (primary-positioned action inside the lead block) | same | V3-OC04.1 | same test |

Save/Discard hiding itself (package 08's `V3-OC04.1's "disabled Save with no reason"` fix) was already correct and is unchanged here — this package only fixes ordering/emphasis (08's report explicitly deferred this to 18).

## Team access / invitations (V3-OC25.1)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `SharingTab.tsx` eyebrow, `scope="team"` | Administration → Team → Invitations | any | "COLLABORATOR INVITES" | change | "INVITATIONS" | none needed (heading only) | V3-OC25.1 | `SharingTab.test.tsx` `getByText('INVITATIONS')` |
| `SharingTab.tsx` empty invite list | same | `invites.length === 0`, email mode | "No invite links yet." (same text regardless of mode) | change | "No invitations sent yet." | matches selected delivery mode | V3-OC25.1 | `SharingTab.test.tsx` |
| `SharingTab.tsx` empty invite list | same | `invites.length === 0`, link mode | "No invite links yet." | change | "No invitation links created yet." | matches selected delivery mode | V3-OC25.1 | `SharingTab.test.tsx` |
| `SharingTab.tsx` delivery-mode picker | same | rendered unconditionally, defaulting to "Send by email" | Radio choice always offered, even where the server cannot deliver email | change | Radio choice offered only when `authMode === 'cloud' && user.emailConfigured`; otherwise link-only, no picker | `core/email.py`'s `console` backend (local default) only logs — it never leaves the host; `settings.email_backend` is the real signal | V3-OC25.1 (ruling: "invitation mode must match what the backend actually does") | `apps/api/src/core/email.py:6-11`, `apps/api/src/core/config.py:302`; new `UserDTO.emailConfigured` (`auth_routes.py`); `tests/backend/test_auth_endpoints.py::test_email_configured_reflects_the_real_delivery_backend`; `SharingTab.test.tsx` `describe('V3-OC25.1…')` |

## Workspace settings (V3-OC29.1)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `GeneralSettingsTab.tsx` `Row label` | Settings → Workspace settings | any | "Lifecycle" | change | "Tournament status" | Overview/Hub name the same derived fact without "lifecycle" jargon | V3-OC29.1 | `GeneralSettingsTab.test.tsx` |
| `GeneralSettingsTab.tsx` footnote | same | any | "To retire the workspace, use Archive below." | change | "Archive this workspace to remove it from the active list." | Matches the archive action's real, sole effect (see DangerZoneTab verification below) | V3-OC29.1 | `GeneralSettingsTab.test.tsx` |
| `GeneralSettingsTab.tsx` tournament date | same | `summary.tournamentDate` set | raw ISO string (e.g. `2026-05-15`) rendered verbatim | change | shared `formatDateTime(date, 'date_with_year')` (e.g. `Fri, May 15, 2026`) | X6: no raw ISO in ordinary prose | V3-OC29.1 | `GeneralSettingsTab.test.tsx`; `apps/console/src/lib/formatDateTime.ts` |
| `DangerZoneTab.tsx` archive/delete copy | Settings → Archive or delete | any | (unchanged — verified against backend, already accurate) | verified, kept | "Hide it from the active list. Unarchive any time." / "Permanently removes the workspace, its members, invites, and all data. Can't be undone." | `TournamentsRepo.delete` cascades match_states+backups+members+invite_links; no route gates public display or membership on `status == 'archived'` (only `core/tournament_phase.py`'s derived label) | V3-OC29.1 acceptance ("archive and delete consequences remain distinct") | new `DangerZoneTab.test.tsx`; `apps/api/src/repositories/local.py:305-312`; `tests/backend/test_tournaments.py::test_delete_cascades_backups`; `apps/api/src/core/tournament_phase.py:65` |

## Entries unavailable (V3-OC30.1)

| string key/file:line | surface | state | current text | verdict | final text | factual prerequisite | finding IDs | evidence |
|---|---|---|---|---|---|---|---|---|
| `ModuleUnavailablePanel.tsx` title | any module-unavailable panel | `reason === 'unavailable'` | "{label} isn't available in this workspace" (generic, same as every other reason) | change | "{label} isn't available for this tournament type" | `reason: 'unavailable'` only fires when the module is absent from the workspace's kind-derived/real catalog entirely (`resolveActivePane`), i.e. a tournament-type incompatibility, not a disabled/not-enabled module | V3-OC30.1 | `AppShell.tsx::resolveActivePane`; `ModuleUnavailablePanel.test.tsx` |
| `ModuleUnavailablePanel.tsx` `REASON_COPY.unavailable` | same | same | "This workspace type does not include this module. Open Administration · Modules to see the enabled workflow and continue there." (names a destination) | change | "This workspace type does not include this module." (destination now stated once, by the button alone) | Removes the duplicated/conflicting navigation instruction | V3-OC30.1 | `ModuleUnavailablePanel.test.tsx` |
| `ModuleUnavailablePanel.tsx` primary button | same | same | "Go to {primaryLabel}" (e.g. "Go to Setup · General") while `onGoToPrimary` actually navigated to Administration · Modules (`AppShell.tsx` already special-cased the href for this reason, pre-existing) | change | "View available tools" (button text now matches its real destination) | `AppShell.tsx`'s `onGoToPrimary` routes `reason === 'unavailable'` to `/administration/modules`, unconditionally of `primaryLabel` | V3-OC30.1 | `ModuleUnavailablePanel.test.tsx` new case; `AppShell.guard.test.tsx` (unchanged assertions, comment corrected) |

## Operator sign-in (OC01 — evidence gap, plan §7)

No finding text exists for OC01 (it is an "evidence/state coverage" gap in plan.md §6, not a numbered defect). Verified truthful and now covered by tests:
- Local mode (bootstrap session already present): `LoginPage` redirects away immediately — the wall never renders. New test: `LoginPage.test.tsx` `"OC01: a local-mode bootstrap (or any signed-in) session never sees the sign-in wall"`.
- Cloud mode, signed out: the real sign-in/register/forgot-password form renders (already covered by the file's existing 8 tests — unchanged).

No copy changes were needed here; this closes the evidence gap rather than fixing a defect.
