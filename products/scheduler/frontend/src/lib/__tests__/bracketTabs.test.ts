import { describe, it, expect } from 'vitest';
import {
  BRACKET_TABS,
  BRACKET_TAB_IDS,
  isBracketTab,
  bracketTabView,
  normalizeActiveTab,
} from '../bracketTabs';

describe('BRACKET_TAB_IDS / BRACKET_TABS', () => {
  it('lists the three bracket sections in order', () => {
    expect(BRACKET_TAB_IDS).toEqual([
      'bracket-draw',
      'bracket-schedule',
      'bracket-live',
    ]);
    expect(BRACKET_TABS.map((t) => t.id)).toEqual([
      'bracket-draw',
      'bracket-schedule',
      'bracket-live',
    ]);
    expect(BRACKET_TABS.map((t) => t.label)).toEqual([
      'Draw',
      'Schedule',
      'Live',
    ]);
  });
});

describe('isBracketTab', () => {
  it('is true for bracket tab ids', () => {
    expect(isBracketTab('bracket-draw')).toBe(true);
    expect(isBracketTab('bracket-schedule')).toBe(true);
    expect(isBracketTab('bracket-live')).toBe(true);
  });
  it('is false for meet tab ids and the legacy "bracket" id', () => {
    expect(isBracketTab('setup')).toBe(false);
    expect(isBracketTab('schedule')).toBe(false);
    expect(isBracketTab('live')).toBe(false);
    expect(isBracketTab('bracket')).toBe(false);
  });
});

describe('bracketTabView', () => {
  it('strips the bracket- prefix to the bare view name', () => {
    expect(bracketTabView('bracket-draw')).toBe('draw');
    expect(bracketTabView('bracket-schedule')).toBe('schedule');
    expect(bracketTabView('bracket-live')).toBe('live');
  });
});

describe('normalizeActiveTab', () => {
  it('snaps a non-bracket tab to bracket-draw when kind is bracket', () => {
    expect(normalizeActiveTab('setup', 'bracket')).toBe('bracket-draw');
    expect(normalizeActiveTab('schedule', 'bracket')).toBe('bracket-draw');
    expect(normalizeActiveTab('bracket', 'bracket')).toBe('bracket-draw');
  });
  it('leaves a bracket tab untouched when kind is bracket', () => {
    expect(normalizeActiveTab('bracket-schedule', 'bracket')).toBeNull();
  });
  it('snaps a bracket-* or legacy "bracket" tab to setup when kind is meet', () => {
    expect(normalizeActiveTab('bracket-live', 'meet')).toBe('setup');
    expect(normalizeActiveTab('bracket', 'meet')).toBe('setup');
  });
  it('leaves a meet tab untouched when kind is meet', () => {
    expect(normalizeActiveTab('roster', 'meet')).toBeNull();
  });
  it('returns null while kind is still loading', () => {
    expect(normalizeActiveTab('setup', null)).toBeNull();
    expect(normalizeActiveTab('bracket-draw', null)).toBeNull();
  });
});
