import { describe, it, expect } from 'vitest';
import {
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
  const wm = (id: 'meet' | 'bracket' | 'display', status: string) =>
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
});

describe('modulesForWorkspace', () => {
  it('meet (matches backend derive): Meet enabled, Bracket available, Display available', () => {
    const m = modulesForWorkspace('meet');
    expect(m.map((x) => x.id)).toEqual(['meet', 'bracket', 'display']);
    expect(m.find((x) => x.id === 'meet')!.status).toBe('enabled');
    expect(m.find((x) => x.id === 'bracket')!.status).toBe('available');
    expect(m.find((x) => x.id === 'display')!.status).toBe('available');
  });
  it('bracket (matches backend derive): Bracket enabled, Meet available, Display coming-soon', () => {
    const m = modulesForWorkspace('bracket');
    expect(m.find((x) => x.id === 'bracket')!.status).toBe('enabled');
    expect(m.find((x) => x.id === 'meet')!.status).toBe('available');
    const display = m.find((x) => x.id === 'display')!;
    expect(display.status).toBe('coming-soon');
    expect(display.note).toBe('Display for bracket workspaces is coming.');
  });
});

describe('modulesFromDto', () => {
  it('maps backend DTOs (coming_soon -> coming-soon) with labels + notes, in fixed order', () => {
    const m = modulesFromDto([
      { moduleId: 'display', status: 'available', config: null },
      { moduleId: 'meet', status: 'enabled', config: null },
      { moduleId: 'bracket', status: 'coming_soon', config: null },
    ]);
    expect(m.map((x) => x.id)).toEqual(['meet', 'bracket', 'display']);
    expect(m.find((x) => x.id === 'meet')!.status).toBe('enabled');
    expect(m.find((x) => x.id === 'display')!.status).toBe('available');
    const bracket = m.find((x) => x.id === 'bracket')!;
    expect(bracket.status).toBe('coming-soon');
    expect(bracket.note).toBe('Bracket is not enabled for this workspace yet.');
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
