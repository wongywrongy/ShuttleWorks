# Design Unification — Dashboard + Bracket Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the scheduler's dashboard (`TournamentListPage`) and entire bracket surface (`features/bracket/*`) onto the inter-collegiate meet's setup-page design language, consuming primitives from `@scheduler/design-system`. End-state: one design source of truth, every surface DESIGN.md-compliant.

**Architecture:** Three sequential commits. (1) Cleanup — retire `products/scheduler/frontend/src/components/ui/{button,card,input,label,separator}.tsx` (a pre-design-system shadcn copy) and repoint nine importers to `@scheduler/design-system`. (2) Dashboard — `TournamentListPage` swaps its hand-rolled `StatusPill`, two `Modal`s, and inline eyebrow strings for canonical primitives. (3) Bracket — reuse the meet's existing `SettingsShell` + `SettingsNav` (a generic numbered stepper at `products/scheduler/frontend/src/features/settings/`) for both the `SetupForm` empty state (3 sections: Configuration / Events / Generate) and the post-creation `BracketTabBody` (3 sections: Draw / Schedule / Live, replacing the top sub-tab strip). Custom CSS classes (`card`, `btn`, `btn-primary`, `btn-outline`, `btn-ghost`, `pill`) in the bracket files get replaced with `Button` / `Card` / `StatusPill` from the design system.

**Tech Stack:** TypeScript · React 19 · Vite · Tailwind 3 · `@scheduler/design-system` (npm workspace package) · Playwright (E2E) · pytest (backend regression).

**Reference spec:** `docs/superpowers/specs/2026-05-13-design-unification-dashboard-bracket-design.md` (committed at `958d441`).

---

## File Structure

```
products/scheduler/frontend/src/
├── components/ui/                            # DELETED in Phase 1
│   ├── button.tsx                            # → @scheduler/design-system
│   ├── card.tsx                              # → @scheduler/design-system
│   ├── input.tsx                             # → @scheduler/design-system
│   ├── label.tsx                             # → @scheduler/design-system
│   └── separator.tsx                         # → @scheduler/design-system
│
├── pages/
│   ├── LoginPage.tsx                         # Phase 1: imports repoint
│   ├── InvitePage.tsx                        # Phase 1: imports repoint
│   └── TournamentListPage.tsx                # Phase 1+2: imports + full JSX refactor
│
├── features/
│   ├── settings/
│   │   ├── EngineSettings.tsx                # Phase 1: imports repoint
│   │   ├── ShareSettings.tsx                 # Phase 1: imports repoint
│   │   ├── DataSettings.tsx                  # Phase 1: imports repoint
│   │   ├── SettingsShell.tsx                 # Phase 3: reused as bracket stepper shell (read-only ref)
│   │   └── SettingsNav.tsx                   # Phase 3: reused (read-only ref)
│   │
│   ├── tournaments/
│   │   ├── TournamentConfigForm.tsx          # Phase 1: imports repoint
│   │   ├── TournamentFileManagement.tsx      # Phase 1: imports repoint
│   │   └── PublicDisplaySettings.tsx         # Phase 1: imports repoint
│   │
│   └── bracket/
│       ├── BracketTab.tsx                    # Phase 3: refactor to use SettingsShell for sub-step nav
│       ├── SetupForm.tsx                     # Phase 3: split into 3-step shell
│       ├── TopBar.tsx                        # Phase 3: chrome lockup rework (event selector / counters / export move to context bar)
│       ├── DrawView.tsx                      # Phase 3: custom-class cleanup
│       ├── ScheduleView.tsx                  # Phase 3: custom-class cleanup
│       ├── LiveView.tsx                      # Phase 3: custom-class cleanup
│       └── setupForm/
│           ├── EventEditor.tsx               # Phase 3: custom-class cleanup
│           └── helpers.ts                    # unchanged
```

Each phase is one atomic commit. Phases land in order — do not interleave.

---

## Phase 1 — Cleanup

### Task 1.1: Pre-flight diff confirmation

**Files:**
- Read: `products/scheduler/frontend/src/components/ui/button.tsx`
- Read: `packages/design-system/components/Button.tsx`

- [ ] **Step 1: Confirm canonical Button supports every variant + size used in the codebase**

Run:

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
grep -RhE "<Button[^>]+(size|variant)=\"[a-z-]+\"" products/scheduler/frontend/src | grep -oE "(size|variant)=\"[a-z-]+\"" | sort -u
```

Expected output (any `size=` value must exist in canonical Button at `packages/design-system/components/Button.tsx`, any `variant=` value likewise):

```
size="default"
size="icon"
size="icon-sm"
size="icon-xs"
size="sm"
size="xs"
variant="brand"
variant="default"
variant="destructive"
variant="ghost"
variant="link"
variant="outline"
variant="secondary"
variant="toolbar"
```

Verify against canonical Button source: all `size` values exist (`default`, `sm`, `lg`, `xs`, `icon`, `icon-sm`, `icon-xs`); all `variant` values exist (`default`, `destructive`, `outline`, `secondary`, `ghost`, `link`, `brand`, `toolbar`). If any value appears in the codebase but not the canonical Button, stop and add it to the canonical Button before continuing. (Pre-checked at plan-write time: no gap.)

### Task 1.2: Repoint nine importers

**Files (all in `products/scheduler/frontend/src/`):**
- Modify: `pages/LoginPage.tsx` (line 16-17)
- Modify: `pages/InvitePage.tsx` (line 17-18)
- Modify: `pages/TournamentListPage.tsx` (line 40-41)
- Modify: `features/settings/EngineSettings.tsx` (line 18)
- Modify: `features/settings/ShareSettings.tsx` (line 26-27)
- Modify: `features/settings/DataSettings.tsx` (line 15)
- Modify: `features/tournaments/TournamentConfigForm.tsx` (line 19)
- Modify: `features/tournaments/TournamentFileManagement.tsx` (line 16)
- Modify: `features/tournaments/PublicDisplaySettings.tsx` (line 19)

- [ ] **Step 1: Repoint Button-only importers (6 files)**

Replace the single import line in each of these files:

`features/settings/EngineSettings.tsx` line 18:
```diff
-import { Button } from '@/components/ui/button';
+import { Button } from '@scheduler/design-system';
```

`features/settings/DataSettings.tsx` line 15: same diff.

`features/tournaments/TournamentConfigForm.tsx` line 19: same diff.

`features/tournaments/TournamentFileManagement.tsx` line 16: same diff.

`features/tournaments/PublicDisplaySettings.tsx` line 19: same diff.

- [ ] **Step 2: Repoint Button+Card importers (3 files)**

`pages/LoginPage.tsx` lines 16-17:
```diff
-import { Button } from '../components/ui/button';
-import { Card } from '../components/ui/card';
+import { Button, Card } from '@scheduler/design-system';
```

`pages/InvitePage.tsx` lines 17-18: same diff.

`pages/TournamentListPage.tsx` lines 40-41: same diff.

- [ ] **Step 3: Repoint ShareSettings (relative-depth-2 importer)**

`features/settings/ShareSettings.tsx` lines 26-27:
```diff
-import { Button } from '../../components/ui/button';
-import { Card } from '../../components/ui/card';
+import { Button, Card } from '@scheduler/design-system';
```

- [ ] **Step 4: Run type-check + lint**

Run:

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
npm run -w products/scheduler/frontend lint
```

Expected: zero errors. If any importer pulls a CardHeader / CardFooter / CardTitle / CardDescription / CardContent / Input / Label / Separator subexport that the diff above missed, add it to the named-import list. (Pre-checked: only Button + Card are used at these call-sites.)

```bash
npm run build:scheduler
```

Expected: TypeScript compiles, Vite production build succeeds. If errors mention `cn` or `INTERACTIVE_BASE` (utilities re-exported from `@/lib/utils` in the local shim), see Task 1.3.

### Task 1.3: Delete local components/ui/* files

**Files:**
- Delete: `products/scheduler/frontend/src/components/ui/button.tsx`
- Delete: `products/scheduler/frontend/src/components/ui/card.tsx`
- Delete: `products/scheduler/frontend/src/components/ui/input.tsx`
- Delete: `products/scheduler/frontend/src/components/ui/label.tsx`
- Delete: `products/scheduler/frontend/src/components/ui/separator.tsx`

- [ ] **Step 1: Verify no remaining importers of any deleted file**

Run:

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
grep -RnE "components/ui/(button|card|input|label|separator)" products/scheduler/frontend/src 2>/dev/null
```

Expected: empty output. If any line returns, repoint that importer before proceeding.

- [ ] **Step 2: Delete the five files**

```bash
rm products/scheduler/frontend/src/components/ui/button.tsx
rm products/scheduler/frontend/src/components/ui/card.tsx
rm products/scheduler/frontend/src/components/ui/input.tsx
rm products/scheduler/frontend/src/components/ui/label.tsx
rm products/scheduler/frontend/src/components/ui/separator.tsx
```

- [ ] **Step 3: Check if `components/ui/` directory has any other files; remove dir if empty**

```bash
ls products/scheduler/frontend/src/components/ui/ 2>/dev/null
```

If empty, `rmdir products/scheduler/frontend/src/components/ui/`. If anything remains (unlikely — only the five files we deleted lived there per the plan-time directory listing), leave it.

- [ ] **Step 4: Re-run type-check and build**

```bash
npm run -w products/scheduler/frontend lint && npm run build:scheduler
```

Expected: clean. If TypeScript fails on imports, the repoint missed a file — go back to Task 1.2.

### Task 1.4: Phase 1 verification + commit

**Files:** verification only (no edits).

- [ ] **Step 1: Run pytest backend regression**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
make test
```

Expected: existing pytest suite passes (no backend changes; should be a no-op).

- [ ] **Step 2: Browser-harness sweep of collateral surfaces**

The seven secondary surfaces that pick up the canonical Card's stricter defaults (no `rounded-lg`, no `shadow-sm`). Capture before/after screenshots; flag layout breakage (not just visual shift — that's accepted).

```bash
# Stack should already be up (frontend on :80, backend on :8000).
# If not: make scheduler
browser-harness <<'PY'
import time
paths = [
    ("/login", "/tmp/p1-login.png"),
    ("/", "/tmp/p1-dashboard.png"),
]
for url, out in paths:
    goto_url(f"http://localhost{url}")
    wait_for_load()
    time.sleep(1)
    capture_screenshot(path=out, full=True, max_dim=1800)
    print("saved:", out)
PY
```

Then navigate manually (or scripted) through each settings pane and tournament-config sub-feature for a meet tournament (`/tournaments/1200fc74-2436-4163-9868-5054c96f2be5/setup` with each section, `?section=engine`, `?section=display`, `?section=appearance`, `?section=data`, `?section=share`). Visual diff each.

Expected outcome:
- All seven surfaces still render (no white screen, no React errors in console)
- Layout intact (no nested-card breakage from radius loss, no overflow regressions)
- Some surfaces look slightly different (sharper corners, no soft shadow) — that's the accepted shift

If any layout breaks, fix inline before commit (e.g. a nested card relying on `rounded-lg` for its inner radius mask).

- [ ] **Step 3: Audit grep for DESIGN.md violations introduced (sanity check)**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
git grep -nE "rounded-(md|lg|xl|2xl|full)" products/scheduler/frontend/src
git grep -nE "shadow-(sm|md|lg|xl|2xl)" products/scheduler/frontend/src
```

Expected: results still exist (Phase 2 + Phase 3 will eliminate them). What you're looking for here is that no NEW violations got introduced. Compare against the pre-phase-1 line count if you saved one.

- [ ] **Step 4: Commit Phase 1**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
git add -A products/scheduler/frontend/src
git status
```

Expected status: 9 files modified (imports), 5 files deleted (local ui/*).

```bash
git commit -m "$(cat <<'EOF'
refactor(frontend): retire local components/ui/* in favor of @scheduler/design-system

Delete the pre-design-system shadcn copies at
products/scheduler/frontend/src/components/ui/{button,card,input,label,separator}.tsx
and repoint all nine importers to @scheduler/design-system.

The local Card defaulted to rounded-lg + shadow-sm, both of which
disagree with DESIGN.md §1.2/§1.3. Canonical Card ships neither. The
two implementations are otherwise structurally identical (Button is a
strict superset on the canonical side).

Visual shift on seven collateral surfaces (login, invite, settings
panes, tournament-config sub-features): accepted per the design-
unification spec — sharp corners and substrate elevation are the
brand-correct end state.
EOF
)"
```

---

## Phase 2 — Dashboard refactor

### Task 2.1: Replace local StatusPill with canonical

**Files:**
- Modify: `products/scheduler/frontend/src/pages/TournamentListPage.tsx`

- [ ] **Step 1: Add StatusPill to the design-system import line**

Modify line 40 (which after Phase 1 reads `import { Button, Card } from '@scheduler/design-system';`):

```diff
-import { Button, Card } from '@scheduler/design-system';
+import { Button, Card, StatusPill } from '@scheduler/design-system';
```

- [ ] **Step 2: Delete the local StatusPill function**

Delete lines 49–68 of `TournamentListPage.tsx` — the entire `function StatusPill({ status }: { status: TournamentStatus }) { … }` block.

- [ ] **Step 3: Update the call-site to pass the tone prop**

Find the `<StatusPill status={tournament.status} />` usage (currently line 104). Replace with tone mapping:

```tsx
<StatusPill
  tone={
    tournament.status === 'active'
      ? 'live'
      : tournament.status === 'archived'
        ? 'idle'
        : 'done'
  }
>
  {tournament.status}
</StatusPill>
```

The canonical `StatusPill` accepts `tone: PillTone` (live | called | started | blocked | warning | idle | done) and renders children as the visible label. The mapping above preserves the visual meaning of the old local implementation.

- [ ] **Step 4: Type-check**

```bash
npm run -w products/scheduler/frontend lint
```

Expected: no errors. If `PillTone` is missing a value the call-site needs, check the canonical `StatusPill.tsx` for the exported type and adjust the mapping.

### Task 2.2: Replace the delete-confirmation modal with canonical Modal

**Files:**
- Modify: `products/scheduler/frontend/src/pages/TournamentListPage.tsx`

- [ ] **Step 1: Add Modal to the design-system import line**

```diff
-import { Button, Card, StatusPill } from '@scheduler/design-system';
+import { Button, Card, Modal, StatusPill } from '@scheduler/design-system';
```

- [ ] **Step 2: Replace the hand-rolled delete modal (lines 361–408)**

Find the `{deleteTarget && ( … )}` block. Replace the entire block with:

```tsx
<Modal
  open={!!deleteTarget}
  onOpenChange={(open) => { if (!open) closeDeleteDialog(); }}
  aria-labelledby="delete-tournament-heading"
  role="alertdialog"
>
  {deleteTarget && (
    <>
      <div className="mb-4 space-y-0.5">
        <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-destructive">
          DELETE {deleteTarget.kind === 'bracket' ? 'TOURNAMENT' : 'MEET'}
        </span>
        <h2
          id="delete-tournament-heading"
          className="text-base font-semibold text-foreground"
        >
          Delete &ldquo;{deleteTarget.name || 'Untitled'}&rdquo;?
        </h2>
        <p className="text-xs text-muted-foreground">
          This permanently removes the {deleteTarget.kind === 'bracket' ? 'tournament' : 'meet'},
          its members, invites, and{' '}
          {deleteTarget.kind === 'bracket' ? 'bracket events + matches + results' : 'matches + match-states + backups'}.
          Can&rsquo;t be undone.
        </p>
      </div>
      <div className="mt-6 flex justify-between">
        <Button
          variant="ghost"
          onClick={closeDeleteDialog}
          disabled={deleting}
        >
          Cancel
        </Button>
        <Button
          onClick={handleDelete}
          disabled={deleting}
          variant="destructive"
        >
          {deleting ? 'Deleting…' : 'Delete permanently'}
        </Button>
      </div>
    </>
  )}
</Modal>
```

What changed:
- Removed `fixed inset-0 z-modal flex items-center justify-center bg-black/50` overlay (Modal handles)
- Removed `bg-card text-card-foreground rounded-lg shadow-lg p-6 w-full max-w-md mx-4` inner panel chrome (Modal handles, DESIGN.md §1.2/§1.3-compliant)
- Removed `onClick={closeDeleteDialog}` outer + `onClick={(e) => e.stopPropagation()}` inner (Modal handles)
- Removed manual `role="alertdialog"` + `aria-modal="true"` (Modal handles; we forward `role` + `aria-labelledby` props through)
- Delete button now uses `variant="destructive"` instead of inline `className="bg-destructive text-destructive-foreground hover:opacity-90"`

- [ ] **Step 3: Confirm the canonical Modal accepts the props we pass**

Read `packages/design-system/components/Modal.tsx` to verify it accepts `open`, `onOpenChange`, `role`, `aria-labelledby` (or equivalent). If the API differs (e.g. `isOpen`/`onClose` instead of `open`/`onOpenChange`), adjust the call-site.

```bash
grep -E "interface ModalProps|^export.*Modal" packages/design-system/components/Modal.tsx
```

If the canonical Modal doesn't carry `role` / `aria-labelledby` forwarding, leave manual `aria-labelledby` and `role` on the inner content `<div>` — accessibility is not negotiable.

### Task 2.3: Replace the new-event modal with canonical Modal

**Files:**
- Modify: `products/scheduler/frontend/src/pages/TournamentListPage.tsx`

- [ ] **Step 1: Replace the hand-rolled new-event modal (lines 410–432)**

Find `{showNewDialog && ( … )}` and replace:

```tsx
<Modal
  open={showNewDialog}
  onOpenChange={(open) => { if (!open) closeNewDialog(); }}
>
  <NewEventForm
    kind={newKind}
    name={newName}
    date={newDate}
    creating={creating}
    onKindChange={setNewKind}
    onNameChange={setNewName}
    onDateChange={setNewDate}
    onCancel={closeNewDialog}
    onSubmit={handleCreate}
  />
</Modal>
```

- [ ] **Step 2: Type-check**

```bash
npm run -w products/scheduler/frontend lint && npm run build:scheduler
```

Expected: clean.

### Task 2.4: Replace page-header eyebrow lockup with PageHeader

**Files:**
- Modify: `products/scheduler/frontend/src/pages/TournamentListPage.tsx`

- [ ] **Step 1: Add PageHeader to imports**

```diff
-import { Button, Card, Modal, StatusPill } from '@scheduler/design-system';
+import { Button, Card, Modal, PageHeader, StatusPill } from '@scheduler/design-system';
```

- [ ] **Step 2: Replace lines 308–319 (the eyebrow + h1 + p + New-button section)**

Find:

```tsx
<section className="flex items-end justify-between gap-4">
  <div className="space-y-0.5">
    <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      DASHBOARD
    </span>
    <h1 className="text-xl font-semibold tracking-tight">Your events</h1>
    <p className="text-sm text-muted-foreground">
      Meets and tournaments you own or have been invited to.
    </p>
  </div>
  <Button onClick={() => setShowNewDialog(true)}>New</Button>
</section>
```

Replace with:

```tsx
<PageHeader
  eyebrow="DASHBOARD"
  title="Your events"
  description="Meets and tournaments you own or have been invited to."
  actions={<Button onClick={() => setShowNewDialog(true)}>New</Button>}
/>
```

If the canonical `PageHeader` doesn't accept the `actions` prop or names it differently (e.g. `right`), read `packages/design-system/components/PageHeader.tsx` and adjust.

```bash
grep -A5 "export.*PageHeader\|interface PageHeaderProps" packages/design-system/components/PageHeader.tsx
```

- [ ] **Step 3: Replace Section helper's eyebrow + h2 (lines 152–157)**

In the `Section` function, find:

```tsx
<div className="space-y-0.5">
  <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
    {eyebrow}
  </span>
  <h2 className="text-base font-semibold text-foreground">{title}</h2>
</div>
```

Replace with:

```tsx
<PageHeader eyebrow={eyebrow} title={title} size="sub" />
```

If `PageHeader` doesn't support `size="sub"`, fall back to leaving this block inline (already DESIGN.md-compliant — eyebrow class is canonical). Either way, do not let inline eyebrow strings leak across new code.

### Task 2.5: Strip rounded on KindOption

**Files:**
- Modify: `products/scheduler/frontend/src/pages/TournamentListPage.tsx`

- [ ] **Step 1: Replace KindOption's `rounded` class (line ~568)**

Find inside `KindOption`:

```tsx
className={[
  'rounded border p-3 text-left transition-colors',
  selected
    ? 'border-foreground bg-muted/30 text-foreground'
    : 'border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground',
  disabled ? 'cursor-not-allowed opacity-60' : '',
]
```

Replace `'rounded border p-3 text-left transition-colors'` with `'border p-3 text-left transition-colors'`. (DESIGN.md §1.3 — no rounded on cards/pressables.)

- [ ] **Step 2: Type-check + lint**

```bash
npm run -w products/scheduler/frontend lint && npm run build:scheduler
```

### Task 2.6: Phase 2 verification + commit

**Files:** verification only.

- [ ] **Step 1: Browser-harness dashboard sweep**

```bash
browser-harness <<'PY'
import time
goto_url("http://localhost/")
wait_for_load()
time.sleep(1)
capture_screenshot(path="/tmp/p2-dashboard.png", full=True, max_dim=1800)
print("dashboard:", "/tmp/p2-dashboard.png")
PY
```

Then open `/tmp/p2-dashboard.png` via the harness Read flow and confirm:
- DASHBOARD eyebrow + "Your events" title + description + New button render correctly
- Rows render with `StatusPill` pills using the canonical tone palette
- No `rounded-lg` corners visible anywhere
- No soft shadows visible anywhere

- [ ] **Step 2: Trigger the New-event modal — verify it renders via canonical Modal**

```bash
browser-harness <<'PY'
import time
goto_url("http://localhost/")
wait_for_load()
# Click "New" button — find its rough viewport coords via screenshot first
capture_screenshot(path="/tmp/p2-pre.png", max_dim=1800)
# Use coordinate-click; the New button is in the top-right of the page
# header; coordinates depend on viewport — read the screenshot.
PY
```

Inspect `/tmp/p2-pre.png` for the button's pixel location, then run a second harness call to click + screenshot. Confirm the modal renders, has sharp corners, has the hard-offset shadow from `--shadow-hard`, and the click-outside / X close behavior works.

- [ ] **Step 3: Trigger the Delete modal — same procedure**

Click the Delete button on `test_tournament` (or any tournament row) and screenshot. Verify:
- Modal renders with brutalist chrome
- `DELETE TOURNAMENT` eyebrow renders in destructive color
- Cancel + Delete-permanently buttons render via canonical Button variants
- Click outside closes; click Cancel closes; Delete-permanently fires `handleDelete`

If the delete is dangerous on real data, target the `test_tournament` row (this is dev data; safe to delete and recreate).

- [ ] **Step 4: Dark-mode sweep**

```bash
browser-harness <<'PY'
import time
goto_url("http://localhost/")
wait_for_load()
# Toggle to dark via the moon-icon in the top-right ThemeToggle.
# (Or evaluate document.documentElement.classList.toggle('dark') if you
#  want to skip the click.)
js("document.documentElement.classList.add('dark')")
time.sleep(0.5)
capture_screenshot(path="/tmp/p2-dashboard-dark.png", full=True, max_dim=1800)
print("dark:", "/tmp/p2-dashboard-dark.png")
PY
```

Inspect — every token-driven element should auto-flip via the `.dark` selector in `tokens.css`. No mode-specific JS branches should be needed.

- [ ] **Step 5: Run regression tests**

```bash
make test && make test-e2e
```

Expected: existing tests pass. The dashboard has no Playwright spec today (per the README "Status" section), so this is mostly a backend regression check.

- [ ] **Step 6: Commit Phase 2**

```bash
git add products/scheduler/frontend/src/pages/TournamentListPage.tsx
git commit -m "$(cat <<'EOF'
refactor(dashboard): consume design-system primitives

TournamentListPage now uses StatusPill, Modal, and PageHeader from
@scheduler/design-system instead of hand-rolling them.

- Local StatusPill function (lines 49-68) deleted; canonical
  StatusPill called with tone={'live'|'idle'|'done'} mapped from the
  TournamentStatus.
- Two hand-rolled modal overlays (delete-confirmation, new-event)
  replaced by the canonical Modal — drops rounded-lg shadow-lg inner
  chrome (DESIGN.md §1.2/§1.3 violations) and the manual click-
  outside / aria-modal plumbing.
- Inline eyebrow + h1 + h2 blocks replaced by PageHeader.
- KindOption pressable strips its leftover `rounded` class.

Dashboard is now fully DESIGN.md-compliant; no inline visual
primitives left in this page.
EOF
)"
```

---

## Phase 3 — Bracket structural mirror

### Task 3.1: Refactor SetupForm into a 3-step SettingsShell

**Files:**
- Modify: `products/scheduler/frontend/src/features/bracket/SetupForm.tsx`
- Read-only ref: `products/scheduler/frontend/src/features/settings/SettingsShell.tsx`, `SettingsNav.tsx`

- [ ] **Step 1: Pick the three step icons from `@phosphor-icons/react`**

The existing meet stepper uses Phosphor icons (`Sliders`, `Cpu`, `Monitor`, `Palette`, `Database`, `Share`). For the bracket SetupForm:
- `01 Configuration` — `Sliders` (parity with meet's Tournament step)
- `02 Events` — `ListBullets`
- `03 Generate` — `Lightning`

Import these alongside the existing imports at the top of `SetupForm.tsx`.

- [ ] **Step 2: Restructure SetupForm.tsx**

Replace the current `return (…)` block (lines 149–247) with a SettingsShell wrapper. The form state (events, courts, totalSlots, intervalMinutes, restBetweenRounds, startTime, error, submitting) stays at the SetupForm level; each step's render function reads/writes that state via closure.

Pseudocode for the new return:

```tsx
import { SettingsShell, type SettingsSectionDef } from '../settings/SettingsShell';
import { Sliders, ListBullets, Lightning } from '@phosphor-icons/react';
import { Button } from '@scheduler/design-system';

// … existing useState, callbacks unchanged …

const sections: SettingsSectionDef[] = [
  {
    id: 'configuration',
    label: 'Configuration',
    icon: Sliders,
    render: () => (
      <div className="space-y-6 py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Courts">
            <NumInput value={courts} setValue={setCourts} min={1} max={32} />
          </Field>
          <Field label="Total slots">
            <NumInput value={totalSlots} setValue={setTotalSlots} min={4} max={1024} />
          </Field>
          <Field label="Slot length (minutes)">
            <NumInput value={intervalMinutes} setValue={setIntervalMinutes} min={5} max={240} />
          </Field>
          <Field label="Rest between rounds">
            <NumInput value={restBetweenRounds} setValue={setRestBetweenRounds} min={0} max={32} />
          </Field>
          <Field label="Start time (local)">
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>
        </div>
      </div>
    ),
  },
  {
    id: 'events',
    label: 'Events',
    icon: ListBullets,
    render: () => (
      <div className="space-y-3 py-6">
        <div className="flex items-center justify-between">
          <h3 className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Events ({events.length})
          </h3>
          <Button variant="outline" size="sm" onClick={addEvent}>+ Add event</Button>
        </div>
        {events.map((ev, i) => (
          <EventEditor
            key={i}
            value={ev}
            onChange={(patch) => updateEvent(i, patch)}
            onRemove={events.length > 1 ? () => removeEvent(i) : undefined}
          />
        ))}
      </div>
    ),
  },
  {
    id: 'generate',
    label: 'Generate',
    icon: Lightning,
    render: () => (
      <div className="space-y-6 py-6">
        <div className="text-sm text-muted-foreground">
          <p>{events.length} event{events.length === 1 ? '' : 's'} · {events.reduce((sum, e) => sum + e.participantsText.split('\n').filter(Boolean).length, 0)} participants · {totalSlots} slots × {intervalMinutes} min</p>
        </div>
        {error && (
          <div className="text-sm text-status-blocked bg-status-blocked-bg border border-status-blocked/40 rounded-sm px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2 items-center">
          <label className="cursor-pointer">
            <Button variant="ghost" asChild>
              <span>Import draw…</span>
            </Button>
            <input
              type="file"
              accept=".json,.csv,application/json,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
              }}
            />
          </label>
          <Button
            variant="brand"
            disabled={disabled || submitting}
            onClick={submit}
          >
            {submitting ? 'Creating…' : 'Generate draws'}
          </Button>
        </div>
      </div>
    ),
  },
];

return (
  <SettingsShell
    sections={sections}
    defaultSectionId="configuration"
    eyebrow="NEW BRACKET"
  />
);
```

- [ ] **Step 3: Type-check**

```bash
npm run -w products/scheduler/frontend lint && npm run build:scheduler
```

Expected: clean. If TypeScript complains about `Field` / `NumInput` imports (they currently come from `setupForm/EventEditor`), leave those imports alone — they still work.

- [ ] **Step 4: Visual check**

```bash
browser-harness <<'PY'
import time
goto_url("http://localhost/tournaments/88ab4b4a-85eb-4280-b954-44b8b019374e/bracket")
wait_for_load()
time.sleep(2)
capture_screenshot(path="/tmp/p3-setup-config.png", full=True, max_dim=1800)
print("config step:", "/tmp/p3-setup-config.png")
PY
```

Inspect. Should look like the meet's Setup page: left numbered stepper (01 Configuration · 02 Events · 03 Generate), eyebrow + section header strip, right pane with the form fields. Then re-run with `?section=events` and `?section=generate` in the URL to confirm step swapping.

### Task 3.2: BracketTab post-creation — replace TopBar sub-tab strip with SettingsShell

**Files:**
- Modify: `products/scheduler/frontend/src/features/bracket/BracketTab.tsx`
- Modify: `products/scheduler/frontend/src/features/bracket/TopBar.tsx`

- [ ] **Step 1: Build a post-creation SettingsShell config in BracketTab**

In `BracketTab.tsx`, replace the post-creation render block (the `if (!data) return …` falls through to the existing tabbed render starting at line 104). The new render should be:

```tsx
import { SettingsShell, type SettingsSectionDef } from '../settings/SettingsShell';
import { TreeView, CalendarBlank, Broadcast } from '@phosphor-icons/react';

// … existing state (subTab is now obsolete; eventId stays) …

const sections: SettingsSectionDef[] = [
  {
    id: 'draw',
    label: 'Draw',
    icon: TreeView,
    render: () => (
      <DrawView
        data={data}
        eventId={eventId}
        onChange={setData}
        refresh={refresh}
      />
    ),
  },
  {
    id: 'schedule',
    label: 'Schedule',
    icon: CalendarBlank,
    render: () => (
      <ScheduleView
        data={data}
        eventId={eventId}
        onChange={setData}
        refresh={refresh}
      />
    ),
  },
  {
    id: 'live',
    label: 'Live',
    icon: Broadcast,
    render: () => (
      <LiveView
        data={data}
        eventId={eventId}
        onChange={setData}
        refresh={refresh}
      />
    ),
  },
];

return (
  <div className="flex h-full flex-col bg-background">
    <TopBar
      data={data}
      eventId={eventId}
      onEventId={setEventId}
      onReset={handleReset}
    />
    {error && (
      <div className="mx-4 mt-4 rounded-sm border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        {error}
      </div>
    )}
    <div className="min-h-0 flex-1">
      <SettingsShell
        sections={sections}
        defaultSectionId="draw"
        eyebrow="TOURNAMENT"
      />
    </div>
  </div>
);
```

The local `subTab` state + `setSubTab` callbacks can be deleted entirely — the `SettingsShell`'s URL-synced `?section=` mechanism replaces them. Remove the `useState<SubTab>('draw')` + `SubTab` type alias at the top of the function.

- [ ] **Step 2: Strip TopBar's sub-tab nav**

TopBar currently renders three concerns: (a) event selector + format pill + summary, (b) sub-tab strip, (c) counters + export + reset. Remove (b) — the sub-tab strip moves to the SettingsShell sidebar.

In `TopBar.tsx`, delete the `<nav className="flex items-center gap-1">…</nav>` block (lines 55–70) and its `tab`/`onTab` props from `Props` + the destructuring on line 14–21.

The TopBar's signature becomes:

```ts
interface Props {
  data: TournamentDTO;
  eventId: string;
  onEventId: (id: string) => void;
  onReset: () => void;
}
```

- [ ] **Step 3: Add brand chrome lockup to TopBar**

The current TopBar has no back-arrow / wordmark / brand status pill. Add them so the bracket surface matches the meet's `TabBar` lockup:

Replace TopBar's outer `<header className="border-b border-border bg-card">` block with:

```tsx
import { Link } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';
import { ShuttleWorksMark } from '../../components/ShuttleWorksMark';
import { Button, StatusPill, INTERACTIVE_BASE } from '@scheduler/design-system';

// … export function TopBar ({…}) {

return (
  <header className="sticky top-0 z-chrome flex h-12 flex-shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
    <div className="flex min-w-0 items-center gap-3">
      <Link
        to="/"
        aria-label="Back to dashboard"
        title="Back to dashboard"
        className={[
          INTERACTIVE_BASE,
          'inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border text-muted-foreground',
          'hover:bg-muted/40 hover:text-foreground',
        ].join(' ')}
      >
        <ArrowLeft size={14} aria-hidden="true" />
      </Link>
      <Link
        to="/"
        aria-label="Back to dashboard"
        title="Back to dashboard"
        className={`${INTERACTIVE_BASE} hidden sm:inline-flex`}
      >
        <ShuttleWorksMark />
      </Link>
      <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        TOURNAMENT
      </span>
    </div>
    {/* The event-selector + counters + export + reset block becomes a
        horizontal context bar inside each view's content area in the
        next task. For now keep it inline so the surface doesn't lose
        affordances mid-refactor. */}
    <div className="flex items-center gap-3 flex-wrap">
      <select
        value={eventId}
        onChange={(e) => onEventId(e.target.value)}
        className="rounded-sm border border-border bg-bg-elev px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {data.events.map((e) => (
          <option key={e.id} value={e.id}>
            {e.id} · {e.discipline}
          </option>
        ))}
      </select>
      <Counters event={eventCounts} global={globalCounts} />
      <ExportMenu api={api} />
      <Button variant="outline" size="sm" onClick={onReset}>Reset</Button>
      <StatusPill tone="idle">Idle</StatusPill>
    </div>
  </header>
);
```

- [ ] **Step 4: Build + type-check**

```bash
npm run -w products/scheduler/frontend lint && npm run build:scheduler
```

Expected: clean. If `ShuttleWorksMark` or `INTERACTIVE_BASE` resolves wrong, check the import paths in `TabBar.tsx` for reference — they import from `../../components/ShuttleWorksMark` and `@scheduler/design-system` respectively.

- [ ] **Step 5: Visual check**

```bash
browser-harness <<'PY'
import time
# Create a bracket from the test_tournament SetupForm so DrawView/etc render with data.
# (Out of band: do this via the UI — open /tournaments/<bracket-id>/bracket?section=generate
#  and click "Generate draws" with the seeded sample participants. Or skip if the bracket
#  is already created.)
goto_url("http://localhost/tournaments/88ab4b4a-85eb-4280-b954-44b8b019374e/bracket")
wait_for_load()
time.sleep(2)
capture_screenshot(path="/tmp/p3-bracket-shell.png", full=True, max_dim=1800)
print("shell:", "/tmp/p3-bracket-shell.png")
PY
```

Inspect: brand chrome on the top row (back-arrow + ShuttleWorks mark + TOURNAMENT eyebrow + Idle pill); below it, three left-rail steps (01 Draw / 02 Schedule / 03 Live) with the active step's content on the right.

### Task 3.3: Custom-class cleanup in DrawView

**Files:**
- Modify: `products/scheduler/frontend/src/features/bracket/DrawView.tsx`

- [ ] **Step 1: Identify custom-class usages**

```bash
grep -nE "className=\"[^\"]*(card|btn|btn-primary|btn-outline|btn-ghost|pill)[^\"]*\"" products/scheduler/frontend/src/features/bracket/DrawView.tsx
```

Each match needs the custom CSS class swapped for a design-system primitive.

- [ ] **Step 2: Substitute the primitives**

For each instance:
- `<div className="card …">` → wrap with `<Card variant="frame" className="…">` (removing the custom class)
- `<button className="btn btn-primary">` → `<Button variant="default">` or `<Button variant="brand">` for THE primary action
- `<button className="btn btn-outline">` → `<Button variant="outline">`
- `<button className="btn btn-ghost">` → `<Button variant="ghost">`
- `<span className="pill …">` → `<StatusPill tone="…">…</StatusPill>` if it's status-bearing, otherwise inline a `text-2xs font-semibold uppercase tracking-wider` span (matches the meet's eyebrow micro-pattern)

Import the design-system primitives at the top of the file:

```ts
import { Button, Card, StatusPill } from '@scheduler/design-system';
```

- [ ] **Step 3: Add section eyebrow at top of view**

At the top of DrawView's main render, add a small section eyebrow:

```tsx
<div className="px-4 pt-4">
  <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
    DRAW
  </span>
</div>
```

(This is redundant with the active-step label in the rail, but consistent with how the meet's tabs label their content.)

- [ ] **Step 4: Type-check**

```bash
npm run -w products/scheduler/frontend lint && npm run build:scheduler
```

### Task 3.4: Custom-class cleanup in ScheduleView

**Files:**
- Modify: `products/scheduler/frontend/src/features/bracket/ScheduleView.tsx`

- [ ] **Step 1: Identify custom-class usages**

```bash
grep -nE "className=\"[^\"]*(card|btn|btn-primary|btn-outline|btn-ghost|pill)[^\"]*\"" products/scheduler/frontend/src/features/bracket/ScheduleView.tsx
```

- [ ] **Step 2: Substitute primitives (same mapping as Task 3.3)**

Same patterns. Same imports.

- [ ] **Step 3: Add section eyebrow `SCHEDULE`**

```tsx
<div className="px-4 pt-4">
  <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
    SCHEDULE
  </span>
</div>
```

- [ ] **Step 4: Type-check**

```bash
npm run -w products/scheduler/frontend lint && npm run build:scheduler
```

### Task 3.5: Custom-class cleanup in LiveView

**Files:**
- Modify: `products/scheduler/frontend/src/features/bracket/LiveView.tsx`

- [ ] **Step 1: Identify custom-class usages**

```bash
grep -nE "className=\"[^\"]*(card|btn|btn-primary|btn-outline|btn-ghost|pill)[^\"]*\"" products/scheduler/frontend/src/features/bracket/LiveView.tsx
```

- [ ] **Step 2: Substitute primitives (same mapping as Task 3.3)**

- [ ] **Step 3: Add section eyebrow `LIVE`**

```tsx
<div className="px-4 pt-4">
  <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
    LIVE
  </span>
</div>
```

- [ ] **Step 4: Type-check**

```bash
npm run -w products/scheduler/frontend lint && npm run build:scheduler
```

### Task 3.6: Custom-class cleanup in EventEditor

**Files:**
- Modify: `products/scheduler/frontend/src/features/bracket/setupForm/EventEditor.tsx`

- [ ] **Step 1: Identify custom-class usages**

```bash
grep -nE "className=\"[^\"]*(card|btn|btn-primary|btn-outline|btn-ghost|pill)[^\"]*\"" products/scheduler/frontend/src/features/bracket/setupForm/EventEditor.tsx
```

- [ ] **Step 2: Substitute primitives (same mapping as Task 3.3)**

The `Field` and `NumInput` helpers exported from EventEditor stay; they're called from SetupForm. Inside Field/NumInput, replace any `rounded-sm border border-ink-300 bg-bg-elev` → keep `rounded-sm border border-border bg-bg-elev` (border-ink-300 isn't canonical; border-border is). Replace any `text-ink` → keep (canonical). Replace any `text-ink-500` → keep (canonical).

- [ ] **Step 3: Type-check**

```bash
npm run -w products/scheduler/frontend lint && npm run build:scheduler
```

### Task 3.7: BracketTab error-banner cleanup

**Files:**
- Modify: `products/scheduler/frontend/src/features/bracket/BracketTab.tsx`

- [ ] **Step 1: Replace the missing-tournament-id hint**

Find:

```tsx
<div className="p-6 text-sm text-muted-foreground">
  Missing tournament id in route.
</div>
```

The canonical `Hint` is small and inline. Check whether `Hint` from `@scheduler/design-system` accepts text content directly or expects a structured prop:

```bash
grep -A10 "export.*Hint\|function Hint" packages/design-system/components/Hint.tsx
```

If `Hint` is a tooltip-style primitive (not a banner), keep the inline div — DESIGN.md doesn't require Hint for static text. If it's a banner-style primitive accepting a message + level, use:

```tsx
<Hint level="warning">Missing tournament id in route.</Hint>
```

Don't force a primitive that doesn't fit the shape.

- [ ] **Step 2: Type-check**

```bash
npm run -w products/scheduler/frontend lint && npm run build:scheduler
```

### Task 3.8: Phase 3 verification + commit

**Files:** verification only.

- [ ] **Step 1: Create a real bracket draw so DrawView/ScheduleView/LiveView render with data**

In your browser at `http://localhost/tournaments/88ab4b4a-85eb-4280-b954-44b8b019374e/bracket?section=generate`, click "Generate draws" with the default sample participants. Confirm the draw lands and DrawView populates. If a draw already exists from a prior session, skip.

- [ ] **Step 2: Browser-harness sweep of all four bracket states**

```bash
browser-harness <<'PY'
import time
URLS = [
    # Empty-state SetupForm (pre-creation). Use the URL of a bracket-kind
    # tournament that has no draws yet, OR if test_tournament has been
    # generated, reset it via the API or UI first to get the empty state.
    # If you can't easily reach the empty state, skip this URL.
    ("/tournaments/88ab4b4a-85eb-4280-b954-44b8b019374e/bracket", "/tmp/p3-setup-config.png"),
    ("/tournaments/88ab4b4a-85eb-4280-b954-44b8b019374e/bracket?section=events", "/tmp/p3-setup-events.png"),
    ("/tournaments/88ab4b4a-85eb-4280-b954-44b8b019374e/bracket?section=generate", "/tmp/p3-setup-generate.png"),
    # Post-creation views
    ("/tournaments/88ab4b4a-85eb-4280-b954-44b8b019374e/bracket?section=draw", "/tmp/p3-draw.png"),
    ("/tournaments/88ab4b4a-85eb-4280-b954-44b8b019374e/bracket?section=schedule", "/tmp/p3-schedule.png"),
    ("/tournaments/88ab4b4a-85eb-4280-b954-44b8b019374e/bracket?section=live", "/tmp/p3-live.png"),
]
for url, out in URLS:
    goto_url(f"http://localhost{url}")
    wait_for_load()
    time.sleep(2)
    capture_screenshot(path=out, full=True, max_dim=1800)
    print("saved:", out)
PY
```

For each screenshot, verify:
- Brand chrome on the top row (ArrowLeft + ShuttleWorks mark + TOURNAMENT eyebrow + Idle pill)
- Left-rail stepper with the right step active (01 Draw / 02 Schedule / 03 Live for post-creation; 01 Configuration / 02 Events / 03 Generate for SetupForm)
- Sharp 90° corners everywhere; no soft shadows
- All buttons render via canonical Button variants (no `btn-primary`/`btn-outline`/`btn-ghost` strings in rendered DOM)
- Status pills use canonical `--status-*` tokens

- [ ] **Step 3: Dark-mode sweep**

```bash
browser-harness <<'PY'
import time
js("document.documentElement.classList.add('dark')")
time.sleep(0.5)
goto_url("http://localhost/tournaments/88ab4b4a-85eb-4280-b954-44b8b019374e/bracket?section=draw")
wait_for_load()
time.sleep(2)
capture_screenshot(path="/tmp/p3-draw-dark.png", full=True, max_dim=1800)
print("dark draw:", "/tmp/p3-draw-dark.png")
PY
```

Inspect: every token-driven element should flip via `.dark` selector. Reset to light when done: `js("document.documentElement.classList.remove('dark')")`.

- [ ] **Step 4: Compare bracket vs meet side-by-side**

Open the meet Setup at `http://localhost/tournaments/1200fc74-2436-4163-9868-5054c96f2be5/setup` and the bracket at `http://localhost/tournaments/88ab4b4a-85eb-4280-b954-44b8b019374e/bracket?section=draw`. Both should now have:
- Same top chrome lockup
- Same numbered stepper sidebar visual style
- Same eyebrow + section title strip in the header
- Same sharp corners
- Same Signal Orange active indicator

If anything reads visibly different (different stepper width, different active-state styling, different eyebrow tracking), trace back to where the meet uses `SettingsShell` and confirm the bracket call passes the same props.

- [ ] **Step 5: Regression tests**

```bash
make test && make test-e2e
```

Expected: pass. The Playwright suite at `products/scheduler/e2e/` does not cover the bracket UI (per spec), so this is mostly meet-tab regression.

- [ ] **Step 6: Final DESIGN.md audit grep**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
git grep -nE "rounded-(md|lg|xl|2xl|full)" products/scheduler/frontend/src
git grep -nE "shadow-(sm|md|lg|xl|2xl)" products/scheduler/frontend/src
```

Expected output:
- Zero `rounded-lg` / `rounded-md` / etc. — these should all be gone
- Zero `shadow-sm` / `shadow-md` / etc. — the Tailwind preset remaps any survivor to `--shadow-hard`, but no product code should reference them directly anyway

If matches remain in non-test, non-skip-link code, fix inline. Test files and skip-link allowances can stay.

- [ ] **Step 7: Commit Phase 3**

```bash
git add products/scheduler/frontend/src/features/bracket
git commit -m "$(cat <<'EOF'
refactor(bracket): structural mirror of meet design language

The entire bracket surface now reuses the meet's SettingsShell +
SettingsNav stepper components, so the bracket reads with the same
visual + structural language as the meet Setup page.

SetupForm (pre-creation) splits into a 3-step shell:
  01 Configuration (courts, slots, slot length, rest, start time)
  02 Events       (event editors)
  03 Generate     (summary + import + generate)

BracketTabBody (post-creation) replaces the top sub-tab strip in
TopBar with a left-side stepper:
  01 Draw     (DrawView)
  02 Schedule (ScheduleView)
  03 Live     (LiveView)

TopBar gains the brand chrome lockup (back-to-dashboard ArrowLeft +
ShuttleWorks mark + TOURNAMENT eyebrow + Idle StatusPill). Event
selector + counters + export + reset stay in the TopBar's right
cluster for now.

Bracket view files (DrawView, ScheduleView, LiveView, EventEditor)
swap their pre-merge custom CSS classes (card, btn, btn-primary,
btn-outline, btn-ghost, pill) for design-system primitives (Card,
Button, StatusPill). Each view gains a section eyebrow at the top of
its content.

End-state: no `rounded-lg|md|xl|2xl|full` and no `shadow-sm|md|lg|xl|
2xl` survive in product code. Light + dark both verified via
browser-harness sweep. make test + make test-e2e green.
EOF
)"
```

---

## End-to-end verification

After all three commits land:

- [ ] **Step 1: Confirm three commits are in the log**

```bash
git log --oneline -5
```

Expected (most recent first):

```
<hash>  refactor(bracket): structural mirror of meet design language
<hash>  refactor(dashboard): consume design-system primitives
<hash>  refactor(frontend): retire local components/ui/* in favor of @scheduler/design-system
<hash>  docs(spec): design unification — dashboard + bracket surface
bc938c6  fix(arch): bracket-tournament UX flash + wasted meet polling
```

- [ ] **Step 2: Full audit grep returns no violations in product code**

```bash
git grep -nE "rounded-(md|lg|xl|2xl|full)" products/scheduler/frontend/src
git grep -nE "shadow-(sm|md|lg|xl|2xl)" products/scheduler/frontend/src
git grep -nE "from ['\"]@/components/ui/" products/scheduler/frontend/src
git grep -nE "from ['\"]\\.\\./components/ui/" products/scheduler/frontend/src
git grep -nE "from ['\"]\\.\\./\\.\\./components/ui/" products/scheduler/frontend/src
```

Expected: all five empty.

- [ ] **Step 3: Full stack smoke**

```bash
make scheduler           # rebuild if needed
make test
make test-e2e
npm run build:scheduler  # one more clean build
```

Expected: all green. If `make test-e2e` fails on a bracket-related spec, the spec doesn't exist (per scope) — failure must be in a meet tab, which means regression. Trace, fix, recommit.

- [ ] **Step 4: Visual cross-check meet vs bracket**

Side-by-side screenshots of:
- `/tournaments/<meet-id>/setup` ← reference, unchanged
- `/tournaments/<bracket-id>/bracket?section=draw` ← unified target

Both should be visually consistent: same chrome lockup, same numbered stepper, same eyebrow ladder, same accent color, same corner radii, same shadow language. Any visible mismatch is a Phase 3 follow-up.

---

## Self-review notes (resolved at plan-write time)

1. **Spec coverage:** Every section of the spec (end-state definition, Phase 1 file list + change pattern, Phase 2 swap list, Phase 3 stepper structure + view cleanup, Risks → addressed) has a corresponding task.
2. **Open questions from spec:** Both resolved at plan-write time and documented in the plan header (Architecture line). Q1 (stepper extractability) → use existing `SettingsShell` + `SettingsNav`. Q2 (Button variant gap) → canonical is a superset, no migration needed.
3. **Placeholder scan:** No "TBD" / "TODO" strings. The two places I say "fall back to leaving this block inline" (Task 2.4 Step 3) and "skip if you can't easily reach the empty state" (Task 3.8 Step 2) are honest contingency notes for a known shape — they don't mean "decide later," they specify the fallback path.
4. **Type consistency:** `Button` props (`variant`, `size`) match the canonical Button signature. `Modal` props use `open` / `onOpenChange` per the recommended modal pattern; if the canonical Modal uses different names, Task 2.2 Step 3 covers reconciliation. `SettingsSectionDef` matches the shape exported from `features/settings/SettingsShell.tsx`.
