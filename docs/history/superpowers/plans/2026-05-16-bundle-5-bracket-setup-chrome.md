> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# Bundle 5 — Bracket Setup chrome parity (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the narrow centered bracket Setup form with the same `SettingsShell` sidebar+content chrome the meet uses; add the Tournament-data + Share sections that meet has.

**Architecture:** `BracketTab`'s Setup branch swaps from rendering `<SetupTab />` to rendering `<SettingsShell sections={...} />` with three sections: `Tournament` (refactored from today's `SetupTab` into meet's `SettingsPrimitives` shape and renamed `BracketTournamentSection`), `Tournament data` (new — three Export links reusing `apiClient.bracketExport*Url`), and `Share` (reuse meet's `ShareSettings` unchanged — already kind-agnostic).

**Tech Stack:** TypeScript + React 18 + Vitest + @testing-library/react. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-15-bundle-5-bracket-setup-chrome-design.md`
**Branch:** `feat/bundle-5-bracket-setup-chrome`
**Base SHA:** `e4e3be2` (post-spec commit)

---

## File map

| File | Action | Why |
|---|---|---|
| `products/scheduler/frontend/src/features/bracket/BracketDataSection.tsx` | create | Three Export JSON/CSV/ICS links inside a `SettingsPrimitives.Section` |
| `products/scheduler/frontend/src/lib/__tests__/BracketDataSection.test.tsx` | create | Render + href assertions, mirrors `BracketScheduleHeader.test.tsx` |
| `products/scheduler/frontend/src/features/bracket/BracketTournamentSection.tsx` | create | The existing bracket Setup form refactored to use `SettingsControls.Row` + `SectionHeader` + meet's input primitives. Replaces today's `SetupTab.tsx` |
| `products/scheduler/frontend/src/features/bracket/SetupTab.tsx` | DELETE | Replaced by `BracketTournamentSection`. Only `BracketTab.tsx` imports it today (verified). |
| `products/scheduler/frontend/src/lib/__tests__/SetupTab.test.tsx` | DELETE + replace | Becomes `BracketTournamentSection.test.tsx` with the same field/save assertions adapted to the new control primitives |
| `products/scheduler/frontend/src/lib/__tests__/BracketTournamentSection.test.tsx` | create | Renamed + adapted from `SetupTab.test.tsx` |
| `products/scheduler/frontend/src/features/bracket/BracketTab.tsx` | modify | Setup branch swaps `<SetupTab />` for `<SettingsShell sections={bracketSetupSections} defaultSectionId="tournament" />` |
| `products/scheduler/frontend/src/lib/__tests__/BracketTab.test.tsx` | modify | Add assertion that the bracket-setup tab renders the three section nav items |
| `products/scheduler/frontend/src/features/settings/SettingsShell.tsx` | NO CHANGE | Reused as-is |
| `products/scheduler/frontend/src/features/settings/ShareSettings.tsx` | NO CHANGE | Reused as-is (kind-agnostic) |
| `products/scheduler/frontend/src/features/settings/SettingsControls.tsx` | NO CHANGE | `Row`, `SectionHeader`, `TextInput`, `DateInput`, `NumberInput`, `TimeInput` reused as-is |

---

## Task 1: `BracketDataSection` — Export links inside a Section

### Red

**Files:**
- Create: `products/scheduler/frontend/src/lib/__tests__/BracketDataSection.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/**
 * Tests for BracketDataSection — the 'Tournament data' section inside
 * bracket Setup. Bundle 5 ships exports-only (no import/backup/reset);
 * three plain <a href download> links to the apiClient.bracketExport*Url
 * builders, wrapped in SettingsPrimitives chrome.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BracketDataSection } from '../../features/bracket/BracketDataSection';

vi.mock('../../hooks/useTournamentId', () => ({
  useTournamentId: () => 't1',
}));

describe('<BracketDataSection />', () => {
  it('renders three Export buttons with the correct hrefs', () => {
    render(<BracketDataSection />);
    const json = screen.getByRole('link', { name: /export json/i });
    const csv = screen.getByRole('link', { name: /export csv/i });
    const ics = screen.getByRole('link', { name: /export ics/i });
    expect(json.getAttribute('href')).toMatch(/\/t1\/.*\.json/i);
    expect(csv.getAttribute('href')).toMatch(/\/t1\/.*\.csv/i);
    expect(ics.getAttribute('href')).toMatch(/\/t1\/.*\.ics/i);
  });

  it('renders a section header', () => {
    render(<BracketDataSection />);
    expect(screen.getByText(/^Export$/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/BracketDataSection.test.tsx
```

Expected: import fails — `BracketDataSection` doesn't exist yet.

### Green

**Files:**
- Create: `products/scheduler/frontend/src/features/bracket/BracketDataSection.tsx`

- [ ] **Step 3: Write the component**

```tsx
/**
 * Tournament data section of bracket Setup.
 *
 * Bundle 5 ships exports-only — three Export buttons (JSON / CSV / ICS)
 * via the existing apiClient.bracketExport*Url builders. No import,
 * no backup, no reset. The same export URLs are also linked from
 * BracketScheduleHeader; both surfaces keep the affordance because
 * operators reach for "data ops" from either Setup or Schedule.
 *
 * Wrapped in SettingsPrimitives.SectionHeader + Row so the visual
 * rhythm matches meet's DataSettings.
 */
import { apiClient } from '../../api/client';
import { useTournamentId } from '../../hooks/useTournamentId';
import { Row, SectionHeader } from '../settings/SettingsControls';

const LINK_CLASSES =
  'inline-flex items-center rounded-sm border border-border bg-card px-3 py-1 text-2xs font-medium text-card-foreground hover:bg-muted/40';

export function BracketDataSection() {
  const tid = useTournamentId();
  return (
    <div>
      <SectionHeader>Export</SectionHeader>
      <Row
        label="JSON snapshot"
        control={
          <a className={LINK_CLASSES} href={apiClient.bracketExportJsonUrl(tid)} download>
            Export JSON
          </a>
        }
      />
      <Row
        label="CSV spreadsheet"
        control={
          <a className={LINK_CLASSES} href={apiClient.bracketExportCsvUrl(tid)} download>
            Export CSV
          </a>
        }
      />
      <Row
        label="iCalendar feed"
        control={
          <a className={LINK_CLASSES} href={apiClient.bracketExportIcsUrl(tid)} download>
            Export ICS
          </a>
        }
        last
      />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/BracketDataSection.test.tsx
```

Expected: 2/2 pass.

- [ ] **Step 5: Full suite — no regressions**

```bash
cd products/scheduler/frontend
npx vitest run 2>&1 | tail -5
```

Expected: 156 + 2 = 158 tests pass.

- [ ] **Step 6: Commit**

```bash
git add products/scheduler/frontend/src/features/bracket/BracketDataSection.tsx \
        products/scheduler/frontend/src/lib/__tests__/BracketDataSection.test.tsx
git commit -m "feat(bracket): BracketDataSection — Export links for Setup

Three JSON/CSV/ICS Export links wrapped in SettingsPrimitives chrome
so the section drops cleanly into the SettingsShell that's coming
next. Reuses the existing apiClient.bracketExport*Url builders;
no new backend calls. No import / backup / reset — exports-only scope
per the Bundle 5 spec."
```

---

## Task 2: `BracketTournamentSection` — refactor `SetupTab` into SettingsPrimitives

The existing `SetupTab.tsx` becomes `BracketTournamentSection.tsx` with the same fields/state but the meet's `Row` + `SectionHeader` + input-primitive chrome instead of the hand-rolled `<h2>` + `<Field>` grid. Persist semantics stay the same: the controlled `draft` state updates on `onChange`; the actual store write fires on `onBlur` with a dirty-check.

### Red

**Files:**
- Create: `products/scheduler/frontend/src/lib/__tests__/BracketTournamentSection.test.tsx`

- [ ] **Step 1: Read the existing SetupTab.test.tsx to know what assertions to preserve**

```bash
cat products/scheduler/frontend/src/lib/__tests__/SetupTab.test.tsx
```

Note the field assertions, save-flow assertions, dirty-check assertions. The new test should preserve their intent under the new component name.

- [ ] **Step 2: Write the new test file**

```tsx
/**
 * Tests for BracketTournamentSection — the refactored bracket Setup form
 * that lives inside the SettingsShell's "Tournament" section.
 *
 * Same persist semantics as the prior SetupTab (controlled draft,
 * onBlur dirty-check writes to tournamentStore); only the chrome
 * changed (SectionHeader + Row + meet input primitives in place of
 * hand-rolled <h2> + <Field> + raw <input>).
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BracketTournamentSection } from '../../features/bracket/BracketTournamentSection';
import { useTournamentStore } from '../../store/tournamentStore';

function resetStore() {
  useTournamentStore.setState({
    config: {
      intervalMinutes: 30,
      dayStart: '09:00',
      dayEnd: '18:00',
      breaks: [],
      courtCount: 4,
      defaultRestMinutes: 0,
      freezeHorizonSlots: 0,
      restBetweenRounds: 1,
      tournamentName: 'Bracket A',
      tournamentDate: '2026-05-15',
    },
  });
}

beforeEach(() => {
  resetStore();
});

describe('<BracketTournamentSection />', () => {
  it('renders the Tournament name field bound to store config', () => {
    render(<BracketTournamentSection />);
    const input = screen.getByLabelText(/Tournament name/i) as HTMLInputElement;
    expect(input.value).toBe('Bracket A');
  });

  it('renders the Tournament date field bound to store config', () => {
    render(<BracketTournamentSection />);
    const input = screen.getByLabelText(/Tournament date/i) as HTMLInputElement;
    expect(input.value).toBe('2026-05-15');
  });

  it('renders Courts, Slot duration, Start time, End time, Rest between rounds', () => {
    render(<BracketTournamentSection />);
    expect(screen.getByLabelText(/Courts/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Slot duration/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Start time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/End time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Rest between rounds/i)).toBeInTheDocument();
  });

  it('writes Tournament name to the store on blur when value changed', () => {
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    render(<BracketTournamentSection />);
    const input = screen.getByLabelText(/Tournament name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Renamed Bracket' } });
    fireEvent.blur(input);
    expect(setConfig).toHaveBeenCalled();
    const lastCall = setConfig.mock.calls[setConfig.mock.calls.length - 1];
    expect((lastCall[0] as { tournamentName?: string }).tournamentName).toBe('Renamed Bracket');
  });

  it('does NOT write to the store on blur when value unchanged (dirty-check)', () => {
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    render(<BracketTournamentSection />);
    const input = screen.getByLabelText(/Tournament name/i) as HTMLInputElement;
    fireEvent.blur(input);
    expect(setConfig).not.toHaveBeenCalled();
  });

  it('renders Identity + Schedule & venue section headers', () => {
    render(<BracketTournamentSection />);
    expect(screen.getByText(/^Identity$/i)).toBeInTheDocument();
    expect(screen.getByText(/Schedule.*venue/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/BracketTournamentSection.test.tsx
```

Expected: import fails — `BracketTournamentSection` doesn't exist yet.

### Green

**Files:**
- Create: `products/scheduler/frontend/src/features/bracket/BracketTournamentSection.tsx`

- [ ] **Step 4: Write the component**

```tsx
/**
 * BracketTournamentSection — the Tournament section of bracket Setup.
 *
 * Replaces the prior `SetupTab.tsx` flat form. Same fields, same
 * controlled-draft + onBlur dirty-check semantics — but laid out in
 * meet's SettingsPrimitives chrome (SectionHeader + Row) so bracket
 * Setup visually matches meet Setup once the SettingsShell wraps it.
 *
 * Persist path: every field writes through `setConfig` on blur (only
 * when changed). `useTournamentState`'s 500ms debounce coalesces the
 * subsequent PUT.
 */
import { useEffect, useState } from 'react';
import { useTournamentStore } from '../../store/tournamentStore';
import type { TournamentConfig } from '../../api/dto';
import { Row, SectionHeader } from '../settings/SettingsControls';

interface DraftState {
  tournamentName: string;
  tournamentDate: string;
  courtCount: string;
  intervalMinutes: string;
  dayStart: string;
  dayEnd: string;
  restBetweenRounds: string;
}

function configToDraft(config: TournamentConfig | null): DraftState {
  return {
    tournamentName: config?.tournamentName ?? '',
    tournamentDate: config?.tournamentDate ?? '',
    courtCount: String(config?.courtCount ?? 4),
    intervalMinutes: String(config?.intervalMinutes ?? 30),
    dayStart: config?.dayStart ?? '09:00',
    dayEnd: config?.dayEnd ?? '18:00',
    restBetweenRounds: String(config?.restBetweenRounds ?? 1),
  };
}

const FALLBACK_CONFIG: TournamentConfig = {
  intervalMinutes: 30,
  dayStart: '09:00',
  dayEnd: '18:00',
  breaks: [],
  courtCount: 4,
  defaultRestMinutes: 0,
  freezeHorizonSlots: 0,
  restBetweenRounds: 1,
};

const TEXT_INPUT_CLASSES =
  'rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

export function BracketTournamentSection() {
  const config = useTournamentStore((s) => s.config);
  const setConfig = useTournamentStore((s) => s.setConfig);

  const [draft, setDraft] = useState<DraftState>(() => configToDraft(config));

  // Resync draft when store config changes (hydrate, another tab, etc.).
  useEffect(() => {
    setDraft(configToDraft(config));
  }, [config]);

  const update = (patch: Partial<TournamentConfig>) => {
    setConfig({ ...(config ?? FALLBACK_CONFIG), ...patch });
  };

  return (
    <div>
      <SectionHeader>Identity</SectionHeader>
      <Row
        label="Tournament name"
        control={
          <input
            type="text"
            aria-label="Tournament name"
            value={draft.tournamentName}
            onChange={(e) => setDraft((d) => ({ ...d, tournamentName: e.target.value }))}
            onBlur={(e) => {
              if (e.target.value !== (config?.tournamentName ?? '')) {
                update({ tournamentName: e.target.value });
              }
            }}
            className={`${TEXT_INPUT_CLASSES} w-64`}
          />
        }
      />
      <Row
        label="Tournament date"
        control={
          <input
            type="date"
            aria-label="Tournament date"
            value={draft.tournamentDate}
            onChange={(e) => setDraft((d) => ({ ...d, tournamentDate: e.target.value }))}
            onBlur={(e) => {
              if (e.target.value !== (config?.tournamentDate ?? '')) {
                update({ tournamentDate: e.target.value || undefined });
              }
            }}
            className={`${TEXT_INPUT_CLASSES} w-44`}
          />
        }
        last
      />

      <SectionHeader>Schedule &amp; venue</SectionHeader>
      <Row
        label="Courts"
        control={
          <input
            type="number"
            min={1}
            max={32}
            aria-label="Courts"
            value={draft.courtCount}
            onChange={(e) => setDraft((d) => ({ ...d, courtCount: e.target.value }))}
            onBlur={(e) => {
              const next = Number(e.target.value);
              if (next !== (config?.courtCount ?? 4)) update({ courtCount: next });
            }}
            className={`${TEXT_INPUT_CLASSES} w-20`}
          />
        }
      />
      <Row
        label="Slot duration (minutes)"
        control={
          <input
            type="number"
            min={5}
            max={240}
            aria-label="Slot duration (minutes)"
            value={draft.intervalMinutes}
            onChange={(e) => setDraft((d) => ({ ...d, intervalMinutes: e.target.value }))}
            onBlur={(e) => {
              const next = Number(e.target.value);
              if (next !== (config?.intervalMinutes ?? 30)) update({ intervalMinutes: next });
            }}
            className={`${TEXT_INPUT_CLASSES} w-20`}
          />
        }
      />
      <Row
        label="Start time"
        control={
          <input
            type="time"
            aria-label="Start time"
            value={draft.dayStart}
            onChange={(e) => setDraft((d) => ({ ...d, dayStart: e.target.value }))}
            onBlur={(e) => {
              if (e.target.value !== (config?.dayStart ?? '09:00')) update({ dayStart: e.target.value });
            }}
            className={`${TEXT_INPUT_CLASSES} w-32`}
          />
        }
      />
      <Row
        label="End time"
        control={
          <input
            type="time"
            aria-label="End time"
            value={draft.dayEnd}
            onChange={(e) => setDraft((d) => ({ ...d, dayEnd: e.target.value }))}
            onBlur={(e) => {
              if (e.target.value !== (config?.dayEnd ?? '18:00')) update({ dayEnd: e.target.value });
            }}
            className={`${TEXT_INPUT_CLASSES} w-32`}
          />
        }
      />
      <Row
        label="Rest between rounds (slots)"
        control={
          <input
            type="number"
            min={0}
            max={32}
            aria-label="Rest between rounds (slots)"
            value={draft.restBetweenRounds}
            onChange={(e) => setDraft((d) => ({ ...d, restBetweenRounds: e.target.value }))}
            onBlur={(e) => {
              const next = Number(e.target.value);
              if (next !== (config?.restBetweenRounds ?? 1)) update({ restBetweenRounds: next });
            }}
            className={`${TEXT_INPUT_CLASSES} w-20`}
          />
        }
        last
      />
    </div>
  );
}
```

- [ ] **Step 5: Run tests**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/BracketTournamentSection.test.tsx
```

Expected: 6/6 pass.

- [ ] **Step 6: Delete the old SetupTab.tsx + SetupTab.test.tsx**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
git rm products/scheduler/frontend/src/features/bracket/SetupTab.tsx \
       products/scheduler/frontend/src/lib/__tests__/SetupTab.test.tsx
```

If `SetupTab.tsx` is imported anywhere besides `BracketTab.tsx`, that import will break — confirm with `rg`:

```bash
rg -n 'features/bracket/SetupTab' products/scheduler/frontend/src
```

Expected: only `BracketTab.tsx` references it (which Task 3 updates).

- [ ] **Step 7: Run the wider suite — expect ONE TypeScript / import error**

```bash
cd products/scheduler/frontend
npx vitest run 2>&1 | tail -15
```

Expected: `BracketTab.tsx`'s `import { SetupTab } from './SetupTab'` fails because the file is gone. That's Task 3's job.

- [ ] **Step 8: Commit the new section + the delete-old together**

```bash
git add products/scheduler/frontend/src/features/bracket/BracketTournamentSection.tsx \
        products/scheduler/frontend/src/lib/__tests__/BracketTournamentSection.test.tsx
git rm products/scheduler/frontend/src/features/bracket/SetupTab.tsx \
       products/scheduler/frontend/src/lib/__tests__/SetupTab.test.tsx
git commit -m "refactor(bracket): SetupTab -> BracketTournamentSection in SettingsPrimitives

Same fields, same controlled-draft + onBlur dirty-check persist
semantics. New chrome: SettingsControls.SectionHeader + Row instead
of hand-rolled <h2> + <Field> + grid. Visually matches meet's
TournamentConfigForm so bracket Setup feels uniform once the
SettingsShell wraps it (next commit).

BracketTab.tsx is the only consumer (verified); next commit rewires
it to render the new component inside SettingsShell."
```

---

## Task 3: `BracketTab.tsx` — wire the Setup branch to `SettingsShell`

### Red

**Files:**
- Modify: `products/scheduler/frontend/src/lib/__tests__/BracketTab.test.tsx`

- [ ] **Step 1: Add a new test case for the Setup chrome**

Append this to `BracketTab.test.tsx` (after the existing `describe('BracketTab — Schedule chrome (data populated)', ...)` block):

```tsx
describe('BracketTab — Setup chrome', () => {
  it('renders the three Setup sections in the SettingsShell nav', () => {
    // Default mock (null data) is fine — Setup doesn't depend on bracket data.
    useUiStore.setState({ activeTab: 'bracket-setup' });
    renderBracketTab();
    // The SettingsNav renders a button per section in the left rail.
    // The three section labels must all be present.
    expect(screen.getByRole('button', { name: /^Tournament$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Tournament data$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Share$/i })).toBeInTheDocument();
  });

  it('renders the Tournament section content by default', () => {
    useUiStore.setState({ activeTab: 'bracket-setup' });
    renderBracketTab();
    // Tournament section shows the name field
    expect(screen.getByLabelText(/Tournament name/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd products/scheduler/frontend
npx vitest run src/lib/__tests__/BracketTab.test.tsx
```

Expected: the new tests fail because `BracketTab.tsx` still imports `SetupTab` (which no longer exists), so the file errors at import time. Once Task 3 rewires the import, the new tests pass.

If the import error is too noisy to read the test results, switch to running just the file: `npx vitest run src/lib/__tests__/BracketTab.test.tsx -t "Setup chrome"`.

### Green

**Files:**
- Modify: `products/scheduler/frontend/src/features/bracket/BracketTab.tsx`

- [ ] **Step 3: Update imports**

Replace the existing `SetupTab` import with the three new pieces:

```tsx
// REMOVE this line:
// import { SetupTab } from './SetupTab';

// ADD these lines (find a sensible location near other imports):
import { Sliders, Database, Share as ShareIcon } from '@phosphor-icons/react';
import { SettingsShell, type SettingsSectionDef } from '../settings/SettingsShell';
import { ShareSettings } from '../settings/ShareSettings';
import { BracketTournamentSection } from './BracketTournamentSection';
import { BracketDataSection } from './BracketDataSection';
```

(`Share` is imported with an alias because `Share` may collide with the `Share` icon symbol used elsewhere or with React's `Share` from another module.)

- [ ] **Step 4: Define the sections inside `BracketTab`**

Inside the `BracketTab` function body, before the `return` statement (alongside other `useMemo` / state), add:

```tsx
const bracketSetupSections = useMemo<SettingsSectionDef[]>(
  () => [
    {
      id: 'tournament',
      label: 'Tournament',
      icon: Sliders,
      render: () => <BracketTournamentSection />,
    },
    {
      id: 'data',
      label: 'Tournament data',
      icon: Database,
      render: () => <BracketDataSection />,
    },
    {
      id: 'share',
      label: 'Share',
      icon: ShareIcon,
      render: () => <ShareSettings />,
    },
  ],
  [],
);
```

If `useMemo` isn't already in the existing `react` import, add it.

- [ ] **Step 5: Replace the Setup branch**

Find the line:

```tsx
{view === 'setup' && <SetupTab />}
```

Replace with:

```tsx
{view === 'setup' && (
  <SettingsShell
    sections={bracketSetupSections}
    defaultSectionId="tournament"
  />
)}
```

- [ ] **Step 6: Run tests**

```bash
cd products/scheduler/frontend
npx vitest run
```

Expected: 158 + 6 (BracketTournamentSection) + 2 (new BracketTab Setup chrome) = 166 tests pass. The `SetupTab.test.tsx` deletion removes a small number of prior assertions, so the actual delta may differ — confirm via the post-run count.

- [ ] **Step 7: TypeScript check**

```bash
cd products/scheduler/frontend
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add products/scheduler/frontend/src/features/bracket/BracketTab.tsx \
        products/scheduler/frontend/src/lib/__tests__/BracketTab.test.tsx
git commit -m "feat(bracket): wire Setup branch to SettingsShell with 3 sections

BracketTab.Setup renders <SettingsShell sections=[...] /> with:
  01 Tournament       — BracketTournamentSection (renamed from SetupTab)
  02 Tournament data  — BracketDataSection (new — 3 Export links)
  03 Share            — meet's ShareSettings reused unchanged

The SettingsShell's URL ?section= query param drives which section
is active. Bracket Setup now mirrors meet Setup's sidebar+content
layout instead of the narrow centered form.

Closes the structural half of the audit's 'not everything is full
screen, not as comprehensive' complaint for the bracket Setup tab."
```

---

## Task 4: Manual browser walk-through

No automated assertion for this task — visual + interaction verification.

- [ ] **Step 1: Start vite**

```bash
cd products/scheduler/frontend
npm run dev
```

Note the port (5173 or higher).

- [ ] **Step 2: Open a bracket tournament's Setup**

Navigate to `http://localhost:<port>/tournaments/7fa7210a-b8fb-4301-8b04-8c4c2fb9e43a/bracket-setup`

Verify:
- Left sidebar with three numbered items: `01 Tournament` (Sliders icon), `02 Tournament data` (Database icon), `03 Share` (Share icon).
- Right pane content header reads `SETUP  ⚙ Tournament`.
- Right pane body shows the Tournament name, date, courts, slot duration, start time, end time, rest between rounds — laid out as label-left / control-right rows, matching meet's Setup.

- [ ] **Step 3: Click each sidebar section**

Click `02 Tournament data` → content swaps to the three Export buttons. URL updates to `?section=data`.

Click `03 Share` → content swaps to the members list + invite-link controls (meet's ShareSettings unchanged). URL updates to `?section=share`.

Click `01 Tournament` → back to the form. URL updates to `?section=tournament`.

- [ ] **Step 4: Verify each Export link is well-formed**

In Tournament data section, right-click each Export button → "Copy link". Paste; URLs should look like:

- JSON: `/api/v1/tournaments/<tid>/bracket/export.json` (or similar — match `apiClient.bracketExportJsonUrl`)
- CSV: `/api/v1/tournaments/<tid>/bracket/export.csv`
- ICS: `/api/v1/tournaments/<tid>/bracket/export.ics`

No need to download — just confirm the URLs are formed.

- [ ] **Step 5: Verify the Tournament form still persists on blur**

In the Tournament section: change "Courts" to a different number, blur the input. The change should land in the store (no visible toast; the persist debounces). Refresh the page → the new value should still be there.

- [ ] **Step 6: Verify deep links**

Navigate directly to `http://localhost:<port>/tournaments/7fa7210a-b8fb-4301-8b04-8c4c2fb9e43a/bracket-setup?section=share` → lands on Share section directly.

Navigate to `?section=unknownvalue` → falls back to Tournament (the `defaultSectionId`).

- [ ] **Step 7: Verify other bracket tabs unchanged**

Click through Roster / Events / Draw / Schedule / Live — each should look exactly like before this bundle. The Setup chrome change only affects the Setup tab.

- [ ] **Step 8: Verify meet Setup unchanged**

Open `Audit Meet 2026` (id `09fd8396-e836-4d33-bb97-68fbb27a0cc3`) Setup tab. Should look exactly like before (6 sections in the sidebar including Engine / Public display / Appearance that bracket doesn't have).

- [ ] **Step 9: Stop vite**

Ctrl-C in the dev terminal.

- [ ] **Step 10: Merge to local main**

```bash
cd "/Users/kylewong/Documents/Visual Studio/cp-sat-scheduling-engine"
# Stash any unrelated WIP first if needed (e.g. Toast.tsx from the other branch)
git stash push packages/design-system/components/Toast.tsx -m "wip-toast-bundle5-merge" 2>/dev/null || true
git checkout main
git merge feat/bundle-5-bracket-setup-chrome --no-ff -m "Merge feat/bundle-5-bracket-setup-chrome: bracket Setup parity

Bracket Setup now renders the same SettingsShell sidebar+content
chrome the meet uses, with three sections: Tournament (refactored
from SetupTab), Tournament data (three Export links), Share (meet's
ShareSettings reused). Closes the visual half of the user's
'not everything is full screen, not as comprehensive' complaint
for the bracket Setup tab.

Roster + Events overhauls deferred to Bundles 6 and 7."
# Restore any stash
git stash pop 2>/dev/null || true
```

---

## Spec coverage check

| Spec requirement | Plan task |
|---|---|
| `SettingsShell`-based sidebar+content chrome for bracket Setup | Task 3 |
| Three sections: Tournament, Tournament data, Share | Task 3 (wiring); Tasks 1+2 (content) |
| `BracketTournamentSection` (renamed `SetupTab`) wraps existing fields in `SettingsPrimitives.Section` | Task 2 |
| `BracketDataSection` — three Export links (JSON / CSV / ICS) using `apiClient.bracketExport*Url` | Task 1 |
| `ShareSettings` reused as-is | Task 3 (import only — no new code or tests for ShareSettings) |
| Old `SetupTab.tsx` + `SetupTab.test.tsx` deleted | Task 2 Step 6 |
| `BracketViewHeader` unchanged | Task 3 — no change to its render path |
| URL `/bracket-setup` still routes here; `?section=share` deep-links | Task 4 Step 6 verification |
| Other bracket tabs unchanged | Task 4 Step 7 verification |
| All existing tests pass; new tests pass | Task 3 Step 6 |
| Tournament data: Exports only (no import/backup/reset) | Task 1 (component); Task 3 (wiring) |
| Tournament section: same persist semantics (onBlur dirty-check) | Task 2 |
| Manual browser walk | Task 4 |

No gaps.
