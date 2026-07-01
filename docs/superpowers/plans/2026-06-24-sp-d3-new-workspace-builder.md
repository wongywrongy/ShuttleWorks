> ⚠️ **HISTORICAL SNAPSHOT** — point-in-time design/plan/spec doc, not current truth. For current state see `docs/audits/06-state-of-codebase.md` and `REFACTOR_PROGRESS.md`. (Labeled in SP-REFACTOR Phase 6.)

# SP-D3 — New Workspace Module/Template Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/new` from a 2×2 card pile + equal-weight name/date into a workspace *system builder*: templates that clearly show which modules are enabled vs available, a Custom path that toggles each module's seed, name/date demoted to secondary details, and a principled landing route (a workspace with nothing enabled lands on Modules setup, not a silently-opened Meet).

**Architecture:** Extract the template data and the create/landing logic out of `NewWorkspacePage` into tested modules (`newWorkspaceTemplates.ts`, `workspaceCreateFlow.ts`); add a presentational `TemplateCard` (enabled/available chip distinction reusing the Hub's chip language) and a `CustomModulesBuilder` (per-module tri-state → `modules[]` seed). `NewWorkspacePage` orchestrates: template grid + Custom, then a compact secondary details block.

**Tech Stack:** React 19, TypeScript, Tailwind, `@scheduler/design-system` (`Button`), Vitest + @testing-library/react. Reuses SP-D2 control-plane chip/section language (no new deps).

## Global Constraints

- Branch `dev/workspace-suite`. Frontend-only; **no backend contract changes**; `kind` preserved (still sent on create); module status vocabulary unchanged (`enabled|available|disabled|coming_soon`).
- **No route-path changes.** Blank/custom land on the existing Settings route via the `?tab=modules` query seam added in SP-D2 (query string, not a new path).
- Existing `modules[]` create-seed API is the contract (SP-A/SP-C). Custom seeds are validated server-side; surface a 409/error inline (don't pre-block client-side beyond a soft hint).
- Reuse the SP-D2 chip visual language (enabled = accent-filled chip + filled dot; available = outline chip + ring dot). Existing design tokens only.
- All create flows open the workspace via the **returned** modules (no hardcoded destinations) — through `landingRoute(created)`.
- Run from `products/scheduler/frontend`. Per task: focused test, then `npx vitest run` before committing. Gate before done: `npx tsc -b`, `npx vitest run`, `npm run build`.

---

### Task 1: Extract templates + `workspaceCreateFlow.landingRoute`

Pull the template data out of the page and add the landing-route rule: **a created workspace with no enabled module lands on Modules setup** (`/settings?tab=modules`), otherwise on its primary module's tab.

**Files:**
- Create: `src/products/hub/newWorkspaceTemplates.ts` (move `Template`, `TemplateId`, `seed`, `TEMPLATES`, `MODULE_LABELS` from the page)
- Create: `src/products/hub/workspaceCreateFlow.ts`
- Modify: `src/products/hub/NewWorkspacePage.tsx` (import from the new modules; route via `landingRoute`)
- Test: `src/products/hub/__tests__/workspaceCreateFlow.test.ts`
- Modify: `src/products/hub/__tests__/NewWorkspacePage.test.tsx` (Blank now → `/settings?tab=modules`)

**Interfaces:**
- Consumes: `modulesFromDto`, `modulesForWorkspace`, `primaryModuleForOpen`, `defaultTabForModule` (moduleModel); `TournamentSummaryDTO`.
- Produces:
  - `newWorkspaceTemplates.ts`: `type TemplateId`, `interface Template { id; title; blurb; kind; seed }`, `TEMPLATES: Template[]`, `MODULE_LABELS`, `seed()`.
  - `workspaceCreateFlow.ts`: `landingRoute(created: Pick<TournamentSummaryDTO,'id'|'kind'|'modules'>): string` — returns `/tournaments/${id}/settings?tab=modules` when no module is `enabled`, else `/tournaments/${id}/${defaultTabForModule(primaryModuleForOpen(mods))}`.

- [ ] **Step 1: Write the failing test**

`workspaceCreateFlow.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { landingRoute } from '../workspaceCreateFlow';

const mod = (moduleId: string, status: string) => ({ moduleId, status, config: null });

describe('landingRoute', () => {
  it('opens the primary enabled module tab (meet → setup)', () => {
    expect(landingRoute({ id: 'w1', kind: 'meet', modules: [mod('meet', 'enabled'), mod('display', 'enabled')] }))
      .toBe('/tournaments/w1/setup');
  });
  it('opens bracket-setup when bracket is the enabled operator', () => {
    expect(landingRoute({ id: 'w2', kind: 'bracket', modules: [mod('bracket', 'enabled'), mod('meet', 'available')] }))
      .toBe('/tournaments/w2/bracket-setup');
  });
  it('lands on Modules setup when NOTHING is enabled (blank/custom)', () => {
    expect(landingRoute({ id: 'w3', kind: 'meet', modules: [mod('meet', 'available'), mod('bracket', 'available'), mod('display', 'disabled')] }))
      .toBe('/tournaments/w3/settings?tab=modules');
  });
  it('falls back to kind-derived modules when modules absent', () => {
    expect(landingRoute({ id: 'w4', kind: 'meet', modules: undefined }))
      .toBe('/tournaments/w4/setup');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/products/hub/__tests__/workspaceCreateFlow.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`workspaceCreateFlow.ts`:

```ts
import type { TournamentSummaryDTO } from '../../api/dto';
import {
  modulesFromDto,
  modulesForWorkspace,
  primaryModuleForOpen,
  defaultTabForModule,
} from '../../platform/domain/moduleModel';

type CreatedLike = Pick<TournamentSummaryDTO, 'id' | 'kind' | 'modules'>;

/** Where to land after creating a workspace. A workspace with no enabled module
 *  (Blank / a fully-available Custom build) opens on Modules setup rather than
 *  silently opening an available operator. Otherwise opens its primary module tab. */
export function landingRoute(created: CreatedLike): string {
  const mods = created.modules ? modulesFromDto(created.modules) : modulesForWorkspace(created.kind);
  const anyEnabled = mods.some((m) => m.status === 'enabled');
  if (!anyEnabled) return `/tournaments/${created.id}/settings?tab=modules`;
  return `/tournaments/${created.id}/${defaultTabForModule(primaryModuleForOpen(mods))}`;
}
```

`newWorkspaceTemplates.ts` — move the existing `MODULE_LABELS`, `TemplateId`, `Template`, `seed`, `TEMPLATES` verbatim from `NewWorkspacePage.tsx` (lines 23–75), exporting each:

```ts
import type { WorkspaceModuleDTO } from '../../api/dto';

export type TemplateId = 'meet-day' | 'bracket-tournament' | 'hybrid' | 'blank' | 'custom';

export const MODULE_LABELS: Record<WorkspaceModuleDTO['moduleId'], string> = {
  meet: 'Meet',
  bracket: 'Bracket',
  display: 'Display',
};

export interface Template {
  id: TemplateId;
  title: string;
  blurb: string;
  kind: 'meet' | 'bracket';
  seed: WorkspaceModuleDTO[];
}

export const seed = (
  moduleId: WorkspaceModuleDTO['moduleId'],
  status: WorkspaceModuleDTO['status'],
): WorkspaceModuleDTO => ({ moduleId, status, config: null });

export const TEMPLATES: Template[] = [
  { id: 'meet-day', title: 'Meet Day', blurb: 'Roster, CP-SAT schedule, live cockpit, and a venue display.', kind: 'meet',
    seed: [seed('meet', 'enabled'), seed('bracket', 'available'), seed('display', 'enabled')] },
  { id: 'bracket-tournament', title: 'Bracket Tournament', blurb: 'Events, seeding, draw generation, advancement, and results.', kind: 'bracket',
    seed: [seed('bracket', 'enabled'), seed('meet', 'available'), seed('display', 'available')] },
  { id: 'hybrid', title: 'Hybrid Event', blurb: 'Meet and Bracket modules together in one workspace, plus a display.', kind: 'meet',
    seed: [seed('meet', 'enabled'), seed('bracket', 'enabled'), seed('display', 'enabled')] },
  { id: 'blank', title: 'Blank Workspace', blurb: 'Start empty and turn on modules from Settings as you go.', kind: 'meet',
    seed: [seed('meet', 'available'), seed('bracket', 'available'), seed('display', 'disabled')] },
];
```
(Note `TemplateId` gains `'custom'` now; `TEMPLATES` does NOT include a custom entry — Custom is handled separately in Task 3. The `blank` blurb is updated to mention Settings.)

- [ ] **Step 4: Wire `NewWorkspacePage` to the extracted modules**

In `NewWorkspacePage.tsx`: delete the moved `MODULE_LABELS`/`TemplateId`/`Template`/`seed`/`TEMPLATES` definitions; `import { TEMPLATES, MODULE_LABELS, type Template, type TemplateId } from './newWorkspaceTemplates';` and `import { landingRoute } from './workspaceCreateFlow';`. Replace the `handleCreate` routing block (the `modulesFromDto`/`primaryModuleForOpen`/`defaultTabForModule` lines) with `navigate(landingRoute(created));`. Remove now-unused moduleModel imports from the page.

- [ ] **Step 5: Update the Blank routing test + run**

In `NewWorkspacePage.test.tsx`, the Blank test currently expects `/tournaments/w4/setup`. Change its `waitFor` to `expect(loc.current).toBe('/tournaments/w4/settings')` (the `LocationProbe` reads `loc.pathname`, which drops the `?tab=` query — so assert the pathname `/tournaments/w4/settings`). Update the test title to "Blank: nothing enabled → routes to Modules setup".

Run: `npx vitest run src/products/hub/__tests__/workspaceCreateFlow.test.ts src/products/hub/__tests__/NewWorkspacePage.test.tsx` then `npx tsc -b`
Expected: PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/products/hub/newWorkspaceTemplates.ts src/products/hub/workspaceCreateFlow.ts src/products/hub/NewWorkspacePage.tsx src/products/hub/__tests__/workspaceCreateFlow.test.ts src/products/hub/__tests__/NewWorkspacePage.test.tsx
git commit -m "feat(sp-d3): extract templates + landingRoute (no-enabled → Modules setup)"
```

---

### Task 2: `TemplateCard` with enabled/available chip distinction

A presentational card that shows a template's modules as chips that distinguish **enabled** (accent-filled) from **available** (outline) — the Hub chip language.

**Files:**
- Create: `src/products/hub/TemplateCard.tsx`
- Test: `src/products/hub/__tests__/TemplateCard.test.tsx`

**Interfaces:**
- Consumes: `Template`, `MODULE_LABELS` (newWorkspaceTemplates).
- Produces: `TemplateCard({ template, selected, onSelect }: { template: Template; selected: boolean; onSelect: () => void })` — a `button` with `data-testid={`template-${template.id}`}`, `aria-pressed={selected}`; renders title, blurb, and a chip per seed module whose status is `enabled` or `available`, each tagged `data-testid={`tplchip-${moduleId}`}` and carrying `data-status={status}`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TemplateCard } from '../TemplateCard';
import { TEMPLATES } from '../newWorkspaceTemplates';

const meetDay = TEMPLATES.find((t) => t.id === 'meet-day')!;

describe('TemplateCard', () => {
  it('distinguishes enabled vs available modules and fires onSelect', () => {
    const onSelect = vi.fn();
    render(<TemplateCard template={meetDay} selected={false} onSelect={onSelect} />);
    // Meet Day: meet enabled, display enabled, bracket available
    expect(screen.getByTestId('tplchip-meet')).toHaveAttribute('data-status', 'enabled');
    expect(screen.getByTestId('tplchip-bracket')).toHaveAttribute('data-status', 'available');
    fireEvent.click(screen.getByTestId('template-meet-day'));
    expect(onSelect).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails → implement → pass**

Run: `npx vitest run src/products/hub/__tests__/TemplateCard.test.tsx` → FAIL. Implement `TemplateCard.tsx`:

```tsx
import type { Template } from './newWorkspaceTemplates';
import { MODULE_LABELS } from './newWorkspaceTemplates';

export function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: Template;
  selected: boolean;
  onSelect: () => void;
}) {
  const chips = template.seed.filter((m) => m.status === 'enabled' || m.status === 'available');
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-testid={`template-${template.id}`}
      onClick={onSelect}
      className={[
        'flex flex-col gap-2 rounded-md border p-4 text-left transition-colors',
        selected ? 'border-foreground bg-muted/30' : 'border-border hover:bg-muted/40',
      ].join(' ')}
    >
      <div className="text-sm font-semibold text-foreground">{template.title}</div>
      <div className="text-xs text-muted-foreground">{template.blurb}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {chips.map((m) => (
          <span
            key={m.moduleId}
            data-testid={`tplchip-${m.moduleId}`}
            data-status={m.status}
            className={[
              'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-2xs font-medium',
              m.status === 'enabled'
                ? 'bg-accent/10 text-accent'
                : 'border border-border text-muted-foreground',
            ].join(' ')}
          >
            <span
              aria-hidden
              className={[
                'h-1 w-1 shrink-0 rounded-full',
                m.status === 'enabled' ? 'bg-accent' : 'border border-accent',
              ].join(' ')}
            />
            {MODULE_LABELS[m.moduleId]}
          </span>
        ))}
      </div>
    </button>
  );
}
```
Run again → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/products/hub/TemplateCard.tsx src/products/hub/__tests__/TemplateCard.test.tsx
git commit -m "feat(sp-d3): TemplateCard with enabled/available chip distinction"
```

---

### Task 3: `CustomModulesBuilder` + custom seed/kind helpers

A Custom path: per-module tri-state (Enabled / Available / Off) → a `modules[]` seed, with a soft hint that Display needs an operator.

**Files:**
- Create: `src/products/hub/customModules.ts` (pure: state → seed, seed → kind)
- Create: `src/products/hub/CustomModulesBuilder.tsx`
- Test: `src/products/hub/__tests__/customModules.test.ts`, `src/products/hub/__tests__/CustomModulesBuilder.test.tsx`

**Interfaces:**
- Produces:
  - `customModules.ts`: `type ModuleState = 'enabled' | 'available' | 'off'`; `interface CustomState { meet: ModuleState; bracket: ModuleState; display: ModuleState }`; `DEFAULT_CUSTOM: CustomState` (`{ meet:'enabled', bracket:'off', display:'off' }`); `customSeed(s: CustomState): WorkspaceModuleDTO[]` (`off` → `disabled`); `kindForSeed(s: CustomState): 'meet'|'bracket'` (`bracket` if bracket enabled and meet not enabled, else `meet`).
  - `CustomModulesBuilder.tsx`: `CustomModulesBuilder({ state, onChange }: { state: CustomState; onChange: (s: CustomState) => void })` — three rows (meet/bracket/display), each with three `data-testid={`custom-${moduleId}-${state}`}` buttons; a soft hint line when `display !== 'off'` and neither operator is `enabled`.

- [ ] **Step 1: Write the failing tests**

`customModules.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { customSeed, kindForSeed, DEFAULT_CUSTOM } from '../customModules';

describe('customModules', () => {
  it('maps tri-state to a modules[] seed (off → disabled)', () => {
    const seed = customSeed({ meet: 'enabled', bracket: 'available', display: 'off' });
    expect(seed).toEqual([
      { moduleId: 'meet', status: 'enabled', config: null },
      { moduleId: 'bracket', status: 'available', config: null },
      { moduleId: 'display', status: 'disabled', config: null },
    ]);
  });
  it('derives kind: bracket when bracket is the enabled operator', () => {
    expect(kindForSeed({ meet: 'available', bracket: 'enabled', display: 'off' })).toBe('bracket');
    expect(kindForSeed(DEFAULT_CUSTOM)).toBe('meet');
  });
});
```

`CustomModulesBuilder.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CustomModulesBuilder } from '../CustomModulesBuilder';
import { DEFAULT_CUSTOM } from '../customModules';

describe('CustomModulesBuilder', () => {
  it('changing a module state calls onChange', () => {
    const onChange = vi.fn();
    render(<CustomModulesBuilder state={DEFAULT_CUSTOM} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('custom-bracket-enabled'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_CUSTOM, bracket: 'enabled' });
  });
  it('warns when Display is on with no enabled operator', () => {
    render(<CustomModulesBuilder state={{ meet: 'available', bracket: 'off', display: 'enabled' }} onChange={() => {}} />);
    expect(screen.getByTestId('custom-display-hint')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail → implement → pass**

Run: `npx vitest run src/products/hub/__tests__/customModules.test.ts src/products/hub/__tests__/CustomModulesBuilder.test.tsx` → FAIL.

Implement `customModules.ts`:

```ts
import type { WorkspaceModuleDTO } from '../../api/dto';

export type ModuleState = 'enabled' | 'available' | 'off';
export interface CustomState {
  meet: ModuleState;
  bracket: ModuleState;
  display: ModuleState;
}
export const DEFAULT_CUSTOM: CustomState = { meet: 'enabled', bracket: 'off', display: 'off' };

const toStatus = (s: ModuleState): WorkspaceModuleDTO['status'] => (s === 'off' ? 'disabled' : s);

export function customSeed(s: CustomState): WorkspaceModuleDTO[] {
  return (['meet', 'bracket', 'display'] as const).map((moduleId) => ({
    moduleId,
    status: toStatus(s[moduleId]),
    config: null,
  }));
}

export function kindForSeed(s: CustomState): 'meet' | 'bracket' {
  return s.bracket === 'enabled' && s.meet !== 'enabled' ? 'bracket' : 'meet';
}
```

Implement `CustomModulesBuilder.tsx`: three module rows (`meet`/`bracket`/`display`), each rendering its label and three segmented buttons (Enabled / Available / Off) with `data-testid={`custom-${moduleId}-${value}`}` and an `aria-pressed` on the active one; clicking calls `onChange({ ...state, [moduleId]: value })`. Below, when `state.display !== 'off'` and `state.meet !== 'enabled'` and `state.bracket !== 'enabled'`, render `<p data-testid="custom-display-hint" …>Display needs Meet or Bracket enabled to show anything.</p>`. Use the SP-D2 segmented/quiet styling (small, hairline borders, accent on active). Run again → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/products/hub/customModules.ts src/products/hub/CustomModulesBuilder.tsx src/products/hub/__tests__/customModules.test.ts src/products/hub/__tests__/CustomModulesBuilder.test.tsx
git commit -m "feat(sp-d3): CustomModulesBuilder + custom seed/kind helpers"
```

---

### Task 4: Recompose `NewWorkspacePage` — builder layout + Custom + secondary details

Wire `TemplateCard` + a Custom option into the page; demote name/date to a compact secondary block; create with the template or custom seed via `landingRoute`.

**Files:**
- Modify: `src/products/hub/NewWorkspacePage.tsx`
- Modify: `src/products/hub/__tests__/NewWorkspacePage.test.tsx` (add Custom create test; keep the 4 template tests + fallback)

**Interfaces:**
- Consumes: `TEMPLATES`/`Template`/`TemplateId` (templates), `TemplateCard`, `CustomModulesBuilder`/`customSeed`/`kindForSeed`/`DEFAULT_CUSTOM` (customModules), `landingRoute` (createFlow).

- [ ] **Step 1: Add the Custom create test**

Add to `NewWorkspacePage.test.tsx`:

```tsx
it('Custom: builds a modules[] seed and lands per the result', async () => {
  // Custom with only bracket enabled → kind bracket, lands on bracket-setup.
  returnCreated('wc', [m('bracket', 'enabled'), m('meet', 'off' === 'off' ? 'disabled' : 'disabled'), m('display', 'disabled')]);
  const loc = { current: '' };
  mount(loc);
  fireEvent.click(screen.getByTestId('template-custom'));
  fireEvent.click(screen.getByTestId('custom-bracket-enabled'));
  fireEvent.click(screen.getByTestId('custom-meet-off'));
  fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
  await waitFor(() => expect(loc.current).toBe('/tournaments/wc/bracket-setup'));
  const body = vi.mocked(apiClient.createTournament).mock.calls[0][0];
  expect(body.kind).toBe('bracket');
  expect(seedFor(body)).toMatchObject({ bracket: 'enabled', meet: 'disabled' });
});
```

- [ ] **Step 2: Recompose the page**

In `NewWorkspacePage.tsx`:
- State: keep `selected: TemplateId` (default `'meet-day'`), `name`, `date`, `creating`, `error`; add `custom: CustomState` (init `DEFAULT_CUSTOM`).
- Render the four `TEMPLATES` via `<TemplateCard>` in the grid, plus a fifth selectable "Custom" card (`data-testid="template-custom"`, `aria-pressed={selected==='custom'}`, blurb "Choose exactly which modules to enable.") When `selected === 'custom'`, render `<CustomModulesBuilder state={custom} onChange={setCustom} />` below the grid.
- Demote details: wrap Name + Date in a compact secondary block under a small eyebrow "DETAILS (OPTIONAL)" — two narrower side-by-side inputs (`sm:grid-cols-2`), smaller than the template area.
- `handleCreate`: compute `const isCustom = selected === 'custom'; const tpl = TEMPLATES.find(t => t.id === selected);` then `const modules = isCustom ? customSeed(custom) : tpl!.seed;` and `const kind = isCustom ? kindForSeed(custom) : tpl!.kind;`. Call `createTournament({ name: name.trim()||null, kind, tournamentDate: date||null, modules })`; then `navigate(landingRoute(created))`.

- [ ] **Step 3: Run focused + full suite + tsc + build**

Run: `npx vitest run src/products/hub/__tests__/NewWorkspacePage.test.tsx` then `npx vitest run` then `npx tsc -b` then `npm run build`
Expected: all green/clean. (The existing 4 template tests assert seed payload + landing route; the Meet-Day/Hybrid → `/setup`, Bracket → `/bracket-setup` still hold because those seeds have an enabled operator; Blank now → `/settings` per Task 1.)

- [ ] **Step 4: Commit**

```bash
git add src/products/hub/NewWorkspacePage.tsx src/products/hub/__tests__/NewWorkspacePage.test.tsx
git commit -m "feat(sp-d3): New Workspace builder — TemplateCard grid + Custom + secondary details"
```

---

## Self-Review

**Spec coverage (SP-D3 scope of the redesign spec):**
- Templates show enabled vs available clearly → Task 2 (`TemplateCard` chip distinction). ✓
- Blank lands in overview/modules setup, not silent Meet → Task 1 (`landingRoute` no-enabled rule → `/settings?tab=modules`). ✓
- Custom modules path via the `modules[]` seed API → Task 3 (`CustomModulesBuilder`/`customSeed`) + Task 4 (wired). ✓
- Name/date secondary → Task 4 (compact DETAILS block). ✓
- Extract smaller components from the page → Tasks 1–3 (`newWorkspaceTemplates`, `workspaceCreateFlow`, `TemplateCard`, `customModules`, `CustomModulesBuilder`). ✓
- No backend/route-path change; `kind` preserved → Global Constraints + Task 1 (`?tab=` seam) + Task 4 (`kindForSeed`). ✓

**Placeholder scan:** none. Pure logic (`landingRoute`, `customSeed`, `kindForSeed`) is fully coded + tested; presentational `CustomModulesBuilder` JSX is described against the SP-D2 segmented-control language with concrete testids. (The Custom test's `m('meet', 'off' === 'off' ? 'disabled' : 'disabled')` is just `m('meet','disabled')` — simplify to `m('meet','disabled')` when writing.)

**Type consistency:** `TemplateId` gains `'custom'` (Task 1) and Task 4's page switches on it; `Template.seed`/`customSeed` both yield `WorkspaceModuleDTO[]`; `landingRoute` consumes `Pick<…,'id'|'kind'|'modules'>` which `createTournament`'s return satisfies; `CustomState`/`ModuleState`/`DEFAULT_CUSTOM` flow from `customModules` into the builder + page. `MODULE_LABELS` shared by `TemplateCard`.

**Slice boundary:** SP-D3 is `/new` only. The Blank/custom landing uses the SP-D2 `?tab=` seam; the real Modules **catalog** + Overview tab are SP-D4. SP-D5 (Shell/Dock), SP-D6 (visual QA) follow.
