import { describe, it, expect } from 'vitest';
import {
  moduleForTab,
  defaultTabForModule,
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
  it('routes meet-workspace modules to existing meet routes', () => {
    expect(defaultTabForModule('meet', 'meet')).toBe('setup');
    expect(defaultTabForModule('display', 'meet')).toBe('tv');
    expect(defaultTabForModule('bracket', 'meet')).toBe('setup');
  });
  it('routes everything to bracket home on a bracket workspace', () => {
    expect(defaultTabForModule('bracket', 'bracket')).toBe('bracket-setup');
    expect(defaultTabForModule('display', 'bracket')).toBe('bracket-setup');
    expect(defaultTabForModule('meet', 'bracket')).toBe('bracket-setup');
  });
});

describe('modulesForWorkspace', () => {
  it('meet (matches backend derive): Meet enabled, Display available, Bracket coming-soon', () => {
    const m = modulesForWorkspace('meet');
    expect(m.map((x) => x.id)).toEqual(['meet', 'bracket', 'display']);
    expect(m.find((x) => x.id === 'meet')!.status).toBe('enabled');
    expect(m.find((x) => x.id === 'display')!.status).toBe('available');
    const bracket = m.find((x) => x.id === 'bracket')!;
    expect(bracket.status).toBe('coming-soon');
    expect(bracket.note).toBe('Bracket is not enabled for this workspace yet.');
  });
  it('bracket (matches backend derive): Bracket enabled, Meet + Display coming-soon', () => {
    const m = modulesForWorkspace('bracket');
    expect(m.find((x) => x.id === 'bracket')!.status).toBe('enabled');
    expect(m.find((x) => x.id === 'meet')!.status).toBe('coming-soon');
    expect(m.find((x) => x.id === 'meet')!.note).toBe(
      'Meet is not enabled for this workspace yet.',
    );
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
