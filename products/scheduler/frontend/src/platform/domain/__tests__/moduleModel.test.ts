import { describe, it, expect } from 'vitest';
import {
  moduleForTab,
  defaultTabForModule,
  modulesForWorkspace,
  isModuleEnterable,
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
  it('meet: Meet enabled, Display available, Bracket not-enabled with copy', () => {
    const m = modulesForWorkspace('meet');
    expect(m.map((x) => x.id)).toEqual(['meet', 'bracket', 'display']);
    expect(m.find((x) => x.id === 'meet')!.status).toBe('enabled');
    expect(m.find((x) => x.id === 'display')!.status).toBe('available');
    const bracket = m.find((x) => x.id === 'bracket')!;
    expect(bracket.status).toBe('not-enabled');
    expect(bracket.note).toBe('Bracket is not enabled for this workspace.');
  });
  it('bracket: Bracket enabled, Meet not-enabled, Display coming-soon with copy', () => {
    const m = modulesForWorkspace('bracket');
    expect(m.find((x) => x.id === 'bracket')!.status).toBe('enabled');
    expect(m.find((x) => x.id === 'meet')!.note).toBe(
      'Meet is not enabled for this workspace.',
    );
    const display = m.find((x) => x.id === 'display')!;
    expect(display.status).toBe('coming-soon');
    expect(display.note).toBe('Display for bracket workspaces is coming.');
  });
});

describe('isModuleEnterable', () => {
  it('enabled + available are enterable; not-enabled + coming-soon are not', () => {
    expect(isModuleEnterable('enabled')).toBe(true);
    expect(isModuleEnterable('available')).toBe(true);
    expect(isModuleEnterable('not-enabled')).toBe(false);
    expect(isModuleEnterable('coming-soon')).toBe(false);
  });
});
