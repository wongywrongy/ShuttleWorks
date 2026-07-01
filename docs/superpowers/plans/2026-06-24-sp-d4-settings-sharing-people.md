> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# SP-D4 — Settings / Sharing / People + Hub Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Settings a real control plane — an Overview tab, a Modules *catalog* (capabilities + dependencies + actions), trustworthy People, split Sharing (public link vs invites) with safety language, and a *real* Sync & Backups tab wired to the existing backup endpoints — and reality-check the Hub summary band to operational metrics.

**Architecture:** Frontend-only (the backend already exposes everything needed — list `signals`, backup endpoints, module rules). Add small tested modules for the metrics revision, module catalog metadata, member identity formatting, and backup API methods; recompose the Settings tabs to consume them. Hide the dead Appearance tab; add Overview as the default tab.

**Tech Stack:** React 19, TS, Tailwind, `@scheduler/design-system`, the SP-D2 `control-plane/` primitives + `hubSignals`, Vitest + @testing-library/react.

## Global Constraints

- Branch `dev/workspace-suite`. **Frontend-only — no backend contract change.** The list endpoint already returns `signals` + `modules` (`api/tournaments.py:224`, 6 batched queries); the running docker backend is stale, so metrics degrade safely until it is rebuilt.
- **No route-path change.** Settings tabs are query-addressable via the SP-D2 `?tab=` seam (validated against the tab list). `kind` preserved; module status vocabulary unchanged.
- Backend identity reality: `TournamentMemberDTO = { userId(UUID), role, joinedAt }` — **no email/name**. `ownerName` is on the summary. People must de-emphasize the UUID (cannot invent identity).
- Module rules to surface as guidance (server enforces, returns 409): `coming_soon` immutable; Display needs ≥1 enabled operational module (meet|bracket); a module with data can't be disabled; the last enabled operational module can't be disabled. **No backend capability metadata** — descriptions are a frontend constant.
- Backups are per-tournament: `GET /tournaments/{id}/state/backups` → `{ backups: [{ filename, sizeBytes, modifiedAt }] }`; `POST /tournaments/{id}/state/backup` → `{ created, filename }`; `POST /tournaments/{id}/state/restore/{filename}`.
- Reuse the SP-D2 visual language + primitives (`SectionCard`, `HealthDot`, `MetricStat`, `EmptyState`). Existing tokens only.
- Run from `products/scheduler/frontend`. Per task: focused test, then `npx vitest run`. Gate before done: `npx tsc -b`, `npx vitest run`, `npm run build`.

---

### Task 1: Hub summary band → operational metrics

Reality-check the band: drop Pending invites + Shared (collaboration belongs in the inspector/People), keep operational signal, and compute Enabled modules from `modules[]` (robust when `signals` is absent).

**Files:**
- Modify: `src/products/hub/hubMetrics.ts` (compute `enabledModules` from `modules[]`; keep the type but the band uses a subset)
- Modify: `src/products/hub/HubSummaryBar.tsx` (render Workspaces · Needs attention · Active · Enabled modules)
- Modify: `src/products/hub/__tests__/hubMetrics.test.ts`, `src/products/hub/__tests__/HubSummaryBar.test.tsx`

**Interfaces:**
- `hubMetrics(list)` unchanged signature; `enabledModules` now = count of `modules[]` entries with status `enabled` (fallback to `moduleCountsOf(t)?.enabled` only when `modules` absent).
- `HubSummaryBar` renders four `MetricStat`s; attention/active stay filter buttons (`onPickFilter`), Workspaces + Enabled modules are read-only.

- [ ] **Step 1: Update the failing tests**

In `hubMetrics.test.ts`, the existing case has each row's `modules` absent → keep asserting `enabledModules` from signals as a fallback, AND add a case with `modules` present:

```ts
it('counts enabled modules from modules[] when present', () => {
  const list = [
    base({ id: 'a', modules: [{ moduleId: 'meet', status: 'enabled', config: null }, { moduleId: 'display', status: 'enabled', config: null }, { moduleId: 'bracket', status: 'available', config: null }] }),
    base({ id: 'b', modules: [{ moduleId: 'bracket', status: 'enabled', config: null }] }),
  ];
  expect(hubMetrics(list).enabledModules).toBe(3); // 2 + 1
});
```

In `HubSummaryBar.test.tsx`, change the metric-pick assertion set to the operational four and assert the dropped ones are gone:

```ts
it('renders the operational metrics and routes attention to the filter', () => {
  const onPick = vi.fn();
  render(<HubSummaryBar list={[t({}), t({ role: 'viewer' })]} onPickFilter={onPick} />);
  expect(screen.getByTestId('metric-workspaces')).toHaveTextContent('2');
  expect(screen.getByTestId('metric-modules')).toBeInTheDocument();
  expect(screen.queryByTestId('metric-invites')).toBeNull(); // dropped from the band
  expect(screen.queryByTestId('metric-shared')).toBeNull();  // dropped from the band
  fireEvent.click(screen.getByTestId('metric-attention'));
  expect(onPick).toHaveBeenCalledWith('attention');
});
```

- [ ] **Step 2: Run to verify failure → implement → pass**

Run: `npx vitest run src/products/hub/__tests__/hubMetrics.test.ts src/products/hub/__tests__/HubSummaryBar.test.tsx` → FAIL.

In `hubMetrics.ts` replace the `enabledModules` accumulation:

```ts
import { needsAttention, collaborationOf, moduleCountsOf } from './hubSignals';
import { modulesFromDto } from '../../platform/domain/moduleModel';
// inside the loop:
enabledModules += t.modules
  ? modulesFromDto(t.modules).filter((m) => m.status === 'enabled').length
  : (moduleCountsOf(t)?.enabled ?? 0);
```
(Keep computing `shared`/`pendingInvites` in `hubMetrics` — they remain available for other surfaces — only the band stops showing them.)

In `HubSummaryBar.tsx` render exactly four cells: Workspaces (`metric-workspaces`), Needs attention (button → `onPickFilter('attention')`, `metric-attention`, accent when >0), Active (button → `active`, `metric-active`), Enabled modules (`metric-modules`). Remove the Shared + Pending-invites cells. Run again → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/products/hub/hubMetrics.ts src/products/hub/HubSummaryBar.tsx src/products/hub/__tests__/hubMetrics.test.ts src/products/hub/__tests__/HubSummaryBar.test.tsx
git commit -m "feat(sp-d4): Hub band → operational metrics (drop pending-invites/shared; enabled from modules[])"
```

---

### Task 2: Module catalog metadata + `ModuleCatalog`

Replace the bare enable/disable list with a catalog: per-module capability description + dependency note + status + action, surfacing the server rules as inline guidance.

**Files:**
- Create: `src/products/settings/moduleCatalog.ts` (frontend capability/dependency metadata)
- Create: `src/products/settings/ModuleCatalogRow.tsx`
- Modify: `src/products/settings/ModulesSettingsTab.tsx` (render the catalog)
- Test: `src/products/settings/__tests__/moduleCatalog.test.ts`, `src/products/settings/__tests__/ModulesSettingsTab.test.tsx` (or extend existing settings test)

**Interfaces:**
- `moduleCatalog.ts`: `interface ModuleMeta { id: 'meet'|'bracket'|'display'; name: string; capability: string; dependency?: string }`; `MODULE_CATALOG: Record<ModuleId, ModuleMeta>` (meet: "Roster, CP-SAT scheduling, live match control."; bracket: "Events, seeding, draw generation, advancement, results."; display: "Read-only public display — live matches, draw, results.", dependency: "Needs Meet or Bracket enabled.").
- `ModuleCatalogRow`: presentational — name + capability + dependency + a `StatusPill`/chip + an enable/disable `Button` (driven by the existing `useWorkspaceModules` enable/disable from the tab). Action errors (409) surface via the tab's existing error handling.

- [ ] **Step 1: Write the failing tests**

`moduleCatalog.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MODULE_CATALOG } from '../moduleCatalog';

describe('MODULE_CATALOG', () => {
  it('describes each module with a capability; display notes its dependency', () => {
    expect(MODULE_CATALOG.meet.capability).toMatch(/schedul/i);
    expect(MODULE_CATALOG.display.dependency).toMatch(/Meet or Bracket/i);
    expect(MODULE_CATALOG.bracket.dependency).toBeUndefined();
  });
});
```

Extend the modules-tab render test to assert a capability description shows:

```tsx
it('Modules catalog shows capability + dependency text', async () => {
  mount({ current: '' });
  fireEvent.click(screen.getByTestId('settings-tab-modules'));
  await waitFor(() => expect(screen.getByTestId('settings-module-display')).toBeInTheDocument());
  const row = screen.getByTestId('settings-module-display');
  expect(within(row).getByText(/public display/i)).toBeInTheDocument();
  expect(within(row).getByText(/Needs Meet or Bracket/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure → implement → pass**

Implement `moduleCatalog.ts` with the metadata above. Implement `ModuleCatalogRow.tsx` (name, capability line, dependency line when present, status chip, enable/disable button preserving the existing `data-testid={`settings-module-${id}`}` + the `Enable`/`Disable` button names the current tests use). In `ModulesSettingsTab.tsx`, render a `ModuleCatalogRow` per module from `useWorkspaceModules`, keeping the existing enable/disable handlers + the dependency-rules helper text. Run again → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/products/settings/moduleCatalog.ts src/products/settings/ModuleCatalogRow.tsx src/products/settings/ModulesSettingsTab.tsx src/products/settings/__tests__/moduleCatalog.test.ts src/products/settings/__tests__/WorkspaceSettingsPage.test.tsx
git commit -m "feat(sp-d4): Modules tab → catalog with capabilities + dependency guidance"
```

---

### Task 3: Settings Overview tab

A real Overview: workspace identity + the signal summary (health, readiness checklist, module map, people/share counts) — the inspector's action-panel content, full-width — as the default tab.

**Files:**
- Create: `src/products/settings/OverviewTab.tsx`
- Modify: `src/products/settings/settingsTabs.ts` (add `overview` first; remove `appearance`)
- Modify: `src/products/settings/WorkspaceSettingsPage.tsx` (default tab `overview`; render `OverviewTab`; drop the Appearance branch)
- Test: `src/products/settings/__tests__/settingsTabs.test.ts` (update), `WorkspaceSettingsPage.test.tsx` (Overview default)

**Interfaces:**
- `OverviewTab({ summary }: { summary: TournamentSummaryDTO | null })` — uses `hubSignals` accessors (`workspaceHealth`, `readinessOf`, `attentionReasons`, `collaborationOf`, `moduleCountsOf`) + `HealthDot`/`SectionCard`. `data-testid="overview-tab"`.
- `SETTINGS_TABS` becomes `overview, general, modules, people, sharing, sync, danger` (no `appearance`); `SettingsTabId` drops `'appearance'`, gains `'overview'`.

- [ ] **Step 1: Update tests**

`settingsTabs.test.ts`: assert the order starts with `overview`, contains no `appearance`. In `WorkspaceSettingsPage.test.tsx`, the default-tab test now expects Overview:

```tsx
it('defaults to the Overview tab', async () => {
  mount({ current: '' });
  expect(screen.getByTestId('overview-tab')).toBeInTheDocument();
});
```
(Update the prior "defaults to General" test: General is now reached by clicking its tab; keep the name-load assertion behind a `settings-tab-general` click. Also update the `?tab=sharing` deep-link test — still valid.)

- [ ] **Step 2: Run to verify failure → implement → pass**

Add `overview` to `settingsTabs.ts` (first; label "Overview"), remove `appearance`. Implement `OverviewTab.tsx` (SectionCards: SIGNAL with HealthDot + readiness checklist from `signals.setup`; MODULES counts; PEOPLE member/invite counts; degrade when `summary`/signals absent). In `WorkspaceSettingsPage.tsx`: default `useState<SettingsTabId>(initialTab)` where the `?tab=` fallback is now `'overview'`; render `<OverviewTab summary={summary} />` for `overview`; delete the `appearance` ComingSoon branch. Run again → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/products/settings/OverviewTab.tsx src/products/settings/settingsTabs.ts src/products/settings/WorkspaceSettingsPage.tsx src/products/settings/__tests__/settingsTabs.test.ts src/products/settings/__tests__/WorkspaceSettingsPage.test.tsx
git commit -m "feat(sp-d4): Settings Overview tab (default); drop dead Appearance tab"
```

---

### Task 4: People & Access — readable identity

De-emphasize the raw UUID (backend has no email/name): role-forward rows with a short id chip + a deterministic initial, the owner shown by `ownerName`, joined date, and a clear role legend.

**Files:**
- Create: `src/products/settings/memberIdentity.ts` (pure: `shortId(userId)`, `initialFor(userId)`)
- Modify: `src/products/settings/PeopleAccessTab.tsx`
- Test: `src/products/settings/__tests__/memberIdentity.test.ts`, extend `PeopleAccessTab.test.tsx`

**Interfaces:**
- `memberIdentity.ts`: `shortId(userId: string): string` (e.g. first 8 chars, uppercased) and `initialFor(userId: string): string` (first alphanumeric char, uppercased). Pure.
- `PeopleAccessTab` takes the existing members + an optional `ownerName`/`ownerId` (from the summary) so the owner row shows the name. It renders a role-forward row: initial avatar + `shortId` chip (mono, muted, small) + role pill + joined date — no full-width raw UUID.

- [ ] **Step 1: Write the failing tests**

`memberIdentity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shortId, initialFor } from '../memberIdentity';
describe('memberIdentity', () => {
  it('shortens a UUID and derives an initial', () => {
    expect(shortId('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe('3F2504E0');
    expect(initialFor('3f2504e0-...')).toBe('3');
  });
});
```

Extend `PeopleAccessTab.test.tsx`: a member with a UUID renders a short id chip, not the full UUID.

```tsx
it('shows a short id chip, not the full raw UUID', () => {
  // render with one member userId 'aaaaaaaa-bbbb-...'; assert the full uuid string is NOT in the DOM text
  expect(screen.queryByText('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBeNull();
  expect(screen.getByTestId('member-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toHaveTextContent('AAAAAAAA');
});
```
(Keep the existing `member-${userId}` testid for stability.)

- [ ] **Step 2: Run to verify failure → implement → pass**

Implement `memberIdentity.ts`. Recompose `PeopleAccessTab.tsx` rows: a small rounded initial badge, the role pill, `shortId(userId)` in a muted mono chip, joined date; keep the role legend; keep `data-testid={`member-${userId}`}`. Run again → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/products/settings/memberIdentity.ts src/products/settings/PeopleAccessTab.tsx src/products/settings/__tests__/memberIdentity.test.ts src/products/settings/__tests__/PeopleAccessTab.test.tsx
git commit -m "feat(sp-d4): People & Access — readable identity (de-emphasize raw UUID)"
```

---

### Task 5: Sharing — split public link vs invites + safety language

Two clearly separated sections: a Public display link (read-only, "anyone with the link") and Collaborator invites (role, status/expiry, copy, revoke), each with safety copy.

**Files:**
- Modify: `src/products/settings/SharingTab.tsx`
- Test: extend `src/products/settings/__tests__/SharingTab.test.tsx`

**Interfaces:**
- `SharingTab` keeps its data (public link + `listInvites`/`createInvite`/`revokeInvite`) but renders two `SectionCard`s: `data-testid="sharing-public"` (the display link + "Anyone with this link can view the live display" safety note + copy/open) and `data-testid="sharing-invites"` (create-with-role + the invite list with status/expiry/copy/revoke + "Invited people can sign in and operate this workspace" safety note).

- [ ] **Step 1: Extend the failing test**

```tsx
it('separates the public display link from collaborator invites with safety copy', async () => {
  // mount Sharing tab
  const pub = screen.getByTestId('sharing-public');
  expect(pub).toHaveTextContent(/anyone with (this|the) link/i);
  expect(screen.getByLabelText('Public display link')).toBeInTheDocument();
  const inv = screen.getByTestId('sharing-invites');
  expect(within(inv).getByText(/operate this workspace/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure → implement → pass**

Wrap the existing public-link UI in a `SectionCard eyebrow="PUBLIC DISPLAY LINK"` (`data-testid="sharing-public"`) with the safety note; wrap the invite create+list in a `SectionCard eyebrow="COLLABORATOR INVITES"` (`data-testid="sharing-invites"`) with its safety note. Preserve the existing `Public display link` label, the role select, and the `invite-${token}` rows + copy/revoke. Run again → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/products/settings/SharingTab.tsx src/products/settings/__tests__/SharingTab.test.tsx
git commit -m "feat(sp-d4): Sharing — split public display link vs collaborator invites + safety copy"
```

---

### Task 6: Sync & Backups — real

Wire the existing per-tournament backup endpoints into a working tab: list backups, create a backup, restore one (with confirm).

**Files:**
- Modify: `src/api/client.ts` (+ `src/api/dto.ts`) — add `listBackups`, `createBackup`, `restoreBackup`
- Create: `src/products/settings/SyncBackupsTab.tsx`
- Modify: `src/products/settings/WorkspaceSettingsPage.tsx` (render `SyncBackupsTab` for `sync` instead of ComingSoon)
- Test: `src/products/settings/__tests__/SyncBackupsTab.test.tsx`

**Interfaces:**
- `dto.ts`: `interface BackupEntryDTO { filename: string; sizeBytes: number; modifiedAt: string }`; `interface BackupListDTO { backups: BackupEntryDTO[] }`.
- `client.ts`: `listBackups(id): Promise<BackupListDTO>` (`GET /tournaments/${id}/state/backups`), `createBackup(id): Promise<{ created: boolean; filename: string | null }>` (`POST …/state/backup`), `restoreBackup(id, filename): Promise<void>` (`POST …/state/restore/${encodeURIComponent(filename)}`). Mirror the existing client method patterns.
- `SyncBackupsTab({ tid }: { tid: string })` — lists backups (filename, human size, date), a "Create backup" button, and a per-row "Restore" with a confirm modal. `data-testid="sync-tab"`, rows `data-testid={`backup-${filename}`}`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SyncBackupsTab } from '../SyncBackupsTab';
import { apiClient } from '../../../api/client';

vi.mock('../../../api/client', () => ({ apiClient: { listBackups: vi.fn(), createBackup: vi.fn(), restoreBackup: vi.fn() } }));

beforeEach(() => {
  vi.mocked(apiClient.listBackups).mockResolvedValue({ backups: [{ filename: 'b1.json', sizeBytes: 2048, modifiedAt: '2026-06-01T00:00:00Z' }] } as never);
  vi.mocked(apiClient.createBackup).mockResolvedValue({ created: true, filename: 'b2.json' } as never);
});

describe('SyncBackupsTab', () => {
  it('lists backups and creates one', async () => {
    render(<SyncBackupsTab tid="t1" />);
    await waitFor(() => expect(screen.getByTestId('backup-b1.json')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /create backup/i }));
    await waitFor(() => expect(apiClient.createBackup).toHaveBeenCalledWith('t1'));
  });
});
```

- [ ] **Step 2: Run to verify failure → implement → pass**

Add the DTOs + client methods (follow the existing `apiClient` request helper). Implement `SyncBackupsTab.tsx`: load `listBackups(tid)` on mount; render an `EmptyState` when none; a `SectionCard` listing each backup (filename, `formatBytes(sizeBytes)`, date) with a Restore button; a "Create backup" action that calls `createBackup` then reloads; a restore confirm modal calling `restoreBackup`. Wire it for the `sync` tab in `WorkspaceSettingsPage.tsx`. Run again → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/api/client.ts src/api/dto.ts src/products/settings/SyncBackupsTab.tsx src/products/settings/WorkspaceSettingsPage.tsx src/products/settings/__tests__/SyncBackupsTab.test.tsx
git commit -m "feat(sp-d4): real Sync & Backups tab (list/create/restore via existing endpoints)"
```

---

### Task 7: Integration — gate + visual QA

**Files:** none new — verification + any wiring cleanup.

- [ ] **Step 1: Full gate**

Run: `npx tsc -b` then `npx vitest run` then `npm run build` — all green/clean. Fix any cross-tab fallout (e.g. the `ComingSoonTab` is now only used by `sync`? — it is removed from both `sync` and `appearance`; if unused, delete it and its import).

- [ ] **Step 2: Visual QA**

With the dev server (`:5173`), capture Settings → Overview / Modules / People / Sharing / Sync via browser-harness; confirm the redesign and no dead "Coming in a later phase" copy remains (Appearance gone, Sync real). Note that real Hub metrics need a rebuilt backend container.

- [ ] **Step 3: Commit any cleanup**

```bash
git add -A && git commit -m "chore(sp-d4): remove unused ComingSoonTab; settings integration green"
```

---

## Self-Review

**Spec coverage (SP-D4 scope):**
- Overview tab → Task 3. ✓
- Modules → catalog (capabilities/deps/status/actions, 409 guidance) → Task 2. ✓
- People readable identity (hide raw UUID) → Task 4. ✓ (constrained by backend: no email/name — de-emphasize, can't show real names)
- Sharing split (public link vs invites) + safety → Task 5. ✓
- Sync & Backups real → Task 6. ✓ ; Appearance de-emphasized (removed) → Task 3. ✓
- Hub metric reality-check (operational set) → Task 1. ✓ (user-directed)
- No backend change; `?tab=` seam; tokens-only → Global Constraints. ✓

**Placeholder scan:** none. Pure logic (`hubMetrics` enabled-from-modules, `memberIdentity`, `moduleCatalog`, backup client) fully specified + tested; presentational tabs described against the SP-D2 primitives with concrete testids.

**Type consistency:** `SettingsTabId` drops `'appearance'`, gains `'overview'` (Tasks 3) — the `?tab=` validator already checks against `SETTINGS_TABS`, so it stays sound. `BackupEntryDTO`/`BackupListDTO` flow client → tab (Task 6). `ModuleMeta`/`MODULE_CATALOG` keyed by module id (Task 2). `shortId`/`initialFor` consumed by People (Task 4). `hubMetrics.enabledModules` semantics change but the field/type are unchanged (Task 1).

**Scale note:** SP-D4 is the largest slice (7 tasks). Natural checkpoint after Task 3 (Hub + Modules + Overview) if a mid-review is wanted; otherwise build through Task 7 and review the whole slice.
