import { describe, it, expect } from 'vitest';
import {
  BRACKET_TAB_IDS,
  isBracketTab,
  bracketTabView,
} from '../bracketTabs';

describe('BRACKET_TAB_IDS', () => {
  it('lists the eight bracket sections in order', () => {
    expect(BRACKET_TAB_IDS).toEqual([
      'bracket-setup',
      'bracket-roster',
      'bracket-events',
      'bracket-draws',
      'bracket-draw',
      'bracket-matches',
      'bracket-schedule',
      'bracket-live',
    ]);
  });
});

describe('isBracketTab', () => {
  it('is true for bracket tab ids', () => {
    expect(isBracketTab('bracket-setup')).toBe(true);
    expect(isBracketTab('bracket-roster')).toBe(true);
    expect(isBracketTab('bracket-events')).toBe(true);
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
    expect(bracketTabView('bracket-setup')).toBe('setup');
    expect(bracketTabView('bracket-roster')).toBe('roster');
    expect(bracketTabView('bracket-events')).toBe('events');
    expect(bracketTabView('bracket-draw')).toBe('draw');
    expect(bracketTabView('bracket-schedule')).toBe('schedule');
    expect(bracketTabView('bracket-live')).toBe('live');
  });
});
