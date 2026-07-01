> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# Sharing & Collaboration (sub-project #6) — design

**Date:** 2026-06-23
**Status:** accepted (user said "continue")
**Branch:** `dev/workspace-suite`
**Program:** Workspace-modules control plane. Fills the People & Access + Sharing tabs of the Settings center (#5) using endpoints that already exist. Pure frontend.

## Goal

Turn Sharing from a basic panel into a real access surface: members + roles, invite links (role / status / expiry / copy / revoke), and the public display link as its own sharing primitive — all in the Settings center's **People & Access** and **Sharing** tabs.

## Existing API (no backend change)

- `apiClient.listMembers(tid)` → `TournamentMemberDTO[] = { userId, role, joinedAt }`.
- `apiClient.listInvites(tid)` → `InviteSummaryDTO[] = { token, tournamentId, role, createdAt, expiresAt, revokedAt, valid }`.
- `apiClient.createInvite(tid, { role })` (`InviteRole = 'operator' | 'viewer'`) → created invite; refetch the list after.
- `apiClient.revokeInvite(token)` → void.
- Invite link URL: `${window.location.origin}/invite/${token}` (route exists). Public display link: `${origin}/display?id=${tid}`.

## People & Access tab (`PeopleAccessTab`)

- **Roles legend:** Owner — full control (modules, sharing, delete); Operator — run event operations; Viewer — read-only / display support.
- **Members list:** the owner (from the workspace summary's `ownerName`, role `owner`) plus `listMembers` rows — each showing the member (userId, truncated/monospace), role badge, and joined date. Read-only this slice (no role-change endpoint exists; editing roles is deferred).
- Loading + empty states.

## Sharing tab (`SharingTab`)

- **Public display link** (its own primitive, separate from collaborator invites): the `${origin}/display?id=${tid}` URL shown read-only with **Copy** and **Open fullscreen** (opens the link in a new tab). Short note that anyone with the link can view the read-only display.
- **Invite links:** a create row — role `<select>` (Operator / Viewer) + **Create invite** (`createInvite` then refetch) — and a list of `listInvites` rows. Each row: role badge, **status** (`Revoked` if `revokedAt`, else `Expired` if `expiresAt` past, else `Active` if `valid`, else `Inactive`), expiry (or "No expiry"), **Copy** (`/invite/${token}`), **Revoke** (when active → `revokeInvite` then refetch).
- Copy uses `navigator.clipboard.writeText`; a brief "Copied" affordance.

## Components (`products/settings/`)

- `PeopleAccessTab.tsx` — fetches `listMembers`; renders roles legend + members; takes `summary` for the owner row.
- `SharingTab.tsx` — fetches `listInvites`; public-display-link block + invite create/list/revoke.
- `inviteStatus.ts` — pure `inviteStatus(invite, nowMs)` → `'active' | 'revoked' | 'expired' | 'inactive'` (unit-tested; `nowMs` injected for determinism).
- `WorkspaceSettingsPage.tsx` — replace the `people` and `sharing` `ComingSoonTab` placeholders with the new tabs (pass `tid` + `summary`).

## Constraints

- No backend/DB/DTO/route changes. Uses existing member/invite endpoints. Meet untouched.
- Read-only where no endpoint exists (member role editing deferred). Honest — no fake mutate controls.
- Copy/revoke errors surface via the existing axios toast interceptor.
- tsc clean; full `npx vitest run` green; `npm run build` clean.

## Tests

- `inviteStatus`: revoked (has `revokedAt`), expired (`expiresAt` past + not revoked), active (`valid` + future/no expiry), inactive (`!valid`, no revoke, no past expiry) — with injected `nowMs`.
- `PeopleAccessTab`: renders the roles legend; lists members from `listMembers` (mock); shows the owner row from `summary`.
- `SharingTab`: shows the public display link containing `/display?id=<tid>`; "Create invite" calls `createInvite(tid, { role })` then refetches; an active invite shows Revoke which calls `revokeInvite(token)`; a revoked invite shows status Revoked and no Revoke button.
- `WorkspaceSettingsPage`: the People & Access and Sharing tabs now render the real surfaces (not the "coming in a later phase" placeholder).
- Run focused settings/sharing tests, full Vitest, build before committing.

## Acceptance criteria

1. People & Access shows roles legend + members (owner + `listMembers`), read-only.
2. Sharing shows the public display link (copy + open fullscreen) and invite-link management (create with role, list with status/expiry, copy, revoke) against the real endpoints.
3. Status derivation is correct (active/revoked/expired); no fake controls; errors toast.
4. No backend/route/Meet changes; tsc + suite + build green.

## Deferred

Member role editing + removal (needs backend); invite expiry selection on create (backend takes only role); invite-link analytics; #7 UI polish pass.
