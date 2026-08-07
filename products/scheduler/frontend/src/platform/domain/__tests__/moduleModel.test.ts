import { describe, it, expect } from 'vitest';
import type { ModuleId } from '../../product-shell/types';
import {
  MODULE_LABELS,
  moduleForTab,
  defaultTabForModule,
  primaryModuleForOpen,
  modulesForWorkspace,
  modulesFromDto,
  isModuleEnterable,
  isModuleEnableable,
} from '../moduleModel';

describe('moduleForTab', () => {
  it('maps meet operator tabs to meet', () => {
    for (const t of ['setup', 'roster', 'matches', 'schedule', 'live']) {
      expect(moduleForTab(t, 'meet')).toBe('meet');
    }
  });
  it('maps tv to display', () => {
    expect(moduleForTab('tv', 'meet')).toBe('display');
  });
  it('maps bracket-* tabs to bracket', () => {
    for (const t of ['bracket-setup', 'bracket-draw', 'bracket-live']) {
      expect(moduleForTab(t, 'bracket')).toBe('bracket');
    }
  });
  it('falls back by kind for unknown tabs and never throws on null kind', () => {
    expect(moduleForTab('weird', 'bracket')).toBe('bracket');
    expect(moduleForTab('weird', 'meet')).toBe('meet');
    expect(moduleForTab('weird', null)).toBe('meet');
  });
});

describe('defaultTabForModule', () => {
  it('is module-keyed (independent of kind)', () => {
    expect(defaultTabForModule('meet')).toBe('setup');
    expect(defaultTabForModule('bracket')).toBe('bracket-setup');
    expect(defaultTabForModule('display')).toBe('tv');
  });
});

describe('primaryModuleForOpen', () => {
  const wm = (id: ModuleId, status: string) =>
    ({ id, label: id, status, note: undefined }) as never;
  it('prefers the first enabled module in meet>bracket>display order', () => {
    expect(
      primaryModuleForOpen([wm('meet', 'enabled'), wm('bracket', 'enabled'), wm('display', 'enabled')]),
    ).toBe('meet');
    expect(
      primaryModuleForOpen([wm('meet', 'coming-soon'), wm('bracket', 'enabled'), wm('display', 'coming-soon')]),
    ).toBe('bracket');
  });
  it('falls back to first available, then first present, then meet', () => {
    expect(
      primaryModuleForOpen([wm('meet', 'available'), wm('bracket', 'available'), wm('display', 'disabled')]),
    ).toBe('meet');
    expect(primaryModuleForOpen([wm('display', 'coming-soon')])).toBe('display');
    expect(primaryModuleForOpen([])).toBe('meet');
  });

  it('ranks Entries last, so an engine at the same status always wins', () => {
    // Entries is intake; the operator opening a workspace wants the thing
    // that runs the event. It goes last in the order for that reason.
    expect(
      primaryModuleForOpen([wm('entries', 'enabled'), wm('meet', 'enabled')]),
    ).toBe('meet');
    expect(
      primaryModuleForOpen([wm('entries', 'available'), wm('bracket', 'available')]),
    ).toBe('bracket');
  });

  it('still opens INTO Entries when it is the only ENABLED module', () => {
    // Status beats order — that is the function's existing contract, not
    // something Entries changes. Landing on the desk here is right: it is the
    // one module this workspace has actually turned on, and it has a real
    // surface to land on.
    expect(
      primaryModuleForOpen([wm('entries', 'enabled'), wm('bracket', 'available')]),
    ).toBe('entries');
  });
});

describe('the Entries module wiring (SP-E1-1)', () => {
  it('routes the entries segment to the entries module, whatever the kind', () => {
    // Kind-agnostic on purpose: an entries workspace is a meet or a bracket,
    // and the desk is the same either way.
    expect(moduleForTab('entries', 'meet')).toBe('entries');
    expect(moduleForTab('entries', 'bracket')).toBe('entries');
    expect(moduleForTab('entries', null)).toBe('entries');
  });

  it('has a label and a default tab like every other module', () => {
    expect(MODULE_LABELS.entries).toBe('Entries');
    expect(defaultTabForModule('entries')).toBe('entries');
  });

  it('is absent from the KIND-DERIVED fallback catalog', () => {
    // The fallback mirrors the backend's `derive_modules(kind)`, which knows
    // nothing about Entries — the row exists only where cloud mode seeded
    // one. Emitting it here would show a module in the dock that the server
    // will not confirm, and (before the AppShell guard) let a local-mode
    // workspace walk into the desk.
    for (const kind of ['meet', 'bracket'] as const) {
      expect(modulesForWorkspace(kind).map((m) => m.id)).not.toContain('entries');
    }
  });

  it('renders in the dock only when the backend actually sent the row', () => {
    const withIt = modulesFromDto([
      { moduleId: 'meet', status: 'enabled', config: null },
      { moduleId: 'entries', status: 'enabled', config: null },
    ]);
    expect(withIt.map((m) => m.id)).toEqual(['meet', 'entries']);
    // NEGATIVE CONTROL — the local-mode shape.
    const without = modulesFromDto([
      { moduleId: 'meet', status: 'enabled', config: null },
    ]);
    expect(without.map((m) => m.id)).toEqual(['meet']);
  });
});

describe('modulesForWorkspace', () => {
  it('meet (matches backend derive): Meet enabled, Bracket available, Display available', () => {
    const m = modulesForWorkspace('meet');
    expect(m.map((x) => x.id)).toEqual(['meet', 'bracket', 'display']);
    expect(m.find((x) => x.id === 'meet')!.status).toBe('enabled');
    expect(m.find((x) => x.id === 'bracket')!.status).toBe('available');
    expect(m.find((x) => x.id === 'display')!.status).toBe('available');
  });
  it('bracket (matches backend derive): Bracket enabled, Meet available, Display available', () => {
    const m = modulesForWorkspace('bracket');
    expect(m.find((x) => x.id === 'bracket')!.status).toBe('enabled');
    expect(m.find((x) => x.id === 'meet')!.status).toBe('available');
    expect(m.find((x) => x.id === 'display')!.status).toBe('available');
  });
});

describe('modulesFromDto', () => {
  it('maps backend DTOs in fixed order; legacy coming_soon → available (never shown)', () => {
    const m = modulesFromDto([
      { moduleId: 'display', status: 'available', config: null },
      { moduleId: 'meet', status: 'enabled', config: null },
      { moduleId: 'bracket', status: 'coming_soon', config: null },
    ]);
    expect(m.map((x) => x.id)).toEqual(['meet', 'bracket', 'display']);
    expect(m.find((x) => x.id === 'meet')!.status).toBe('enabled');
    expect(m.find((x) => x.id === 'display')!.status).toBe('available');
    const bracket = m.find((x) => x.id === 'bracket')!;
    // All modules are built — legacy coming_soon is surfaced as available.
    expect(bracket.status).toBe('available');
    expect(bracket.note).toBeUndefined();
  });
  it('notes a disabled module', () => {
    const m = modulesFromDto([{ moduleId: 'display', status: 'disabled', config: null }]);
    expect(m[0].status).toBe('disabled');
    expect(m[0].note).toBe('Display is turned off — re-enable to use it.');
  });
});

describe('isModuleEnterable / isModuleEnableable', () => {
  it('enterable: enabled + available; not disabled / coming-soon', () => {
    expect(isModuleEnterable('enabled')).toBe(true);
    expect(isModuleEnterable('available')).toBe(true);
    expect(isModuleEnterable('disabled')).toBe(false);
    expect(isModuleEnterable('coming-soon')).toBe(false);
  });
  it('enableable: available + disabled; not enabled / coming-soon', () => {
    expect(isModuleEnableable('available')).toBe(true);
    expect(isModuleEnableable('disabled')).toBe(true);
    expect(isModuleEnableable('enabled')).toBe(false);
    expect(isModuleEnableable('coming-soon')).toBe(false);
  });
});
