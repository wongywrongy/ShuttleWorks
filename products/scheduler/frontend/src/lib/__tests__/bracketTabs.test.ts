import { describe, it, expect } from 'vitest';
import {
  BRACKET_TABS,
  BRACKET_TAB_IDS,
  isBracketTab,
  bracketTabView,
  tabsForModule,
} from '../bracketTabs';

describe('tabsForModule', () => {
  it('meet → the meet operator tabs (setup..live, no tv)', () => {
    expect(tabsForModule('meet').map((t) => t.id)).toEqual([
      'setup',
      'roster',
      'matches',
      'schedule',
      'live',
    ]);
  });
  it('bracket → the bracket tabs', () => {
    expect(tabsForModule('bracket')).toBe(BRACKET_TABS);
  });
  it('display → no operator strip', () => {
    expect(tabsForModule('display')).toEqual([]);
  });
});

describe('BRACKET_TAB_IDS / BRACKET_TABS', () => {
  it('lists the seven bracket sections in order', () => {
    expect(BRACKET_TAB_IDS).toEqual([
      'bracket-setup',
      'bracket-roster',
      'bracket-events',
      'bracket-draw',
      'bracket-matches',
      'bracket-schedule',
      'bracket-live',
    ]);
    expect(BRACKET_TABS.map((t) => t.id)).toEqual([
      'bracket-setup',
      'bracket-roster',
      'bracket-events',
      'bracket-draw',
      'bracket-matches',
      'bracket-schedule',
      'bracket-live',
    ]);
    expect(BRACKET_TABS.map((t) => t.label)).toEqual([
      'Setup',
      'Roster',
      'Events',
      'Draw',
      'Matches',
      'Schedule',
      'Live',
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
    expect(bracketTabView('bracket-draw')).toBe('draw');
    expect(bracketTabView('bracket-schedule')).toBe('schedule');
    expect(bracketTabView('bracket-live')).toBe('live');
  });
});

describe('BRACKET_TAB_IDS — extended for entry tabs (#5)', () => {
  it('includes the three new entry-flow ids in order before draw/schedule/live', () => {
    expect(BRACKET_TAB_IDS).toEqual([
      'bracket-setup',
      'bracket-roster',
      'bracket-events',
      'bracket-draw',
      'bracket-matches',
      'bracket-schedule',
      'bracket-live',
    ]);
  });
  it('bracketTabView strips the prefix on the new ids', () => {
    expect(bracketTabView('bracket-setup')).toBe('setup');
    expect(bracketTabView('bracket-roster')).toBe('roster');
    expect(bracketTabView('bracket-events')).toBe('events');
  });
});
