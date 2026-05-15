import { describe, it, expect } from 'vitest';
import {
  BRACKET_TABS,
  BRACKET_TAB_IDS,
  isBracketTab,
  bracketTabView,
  normalizeActiveTab,
} from '../bracketTabs';

describe('BRACKET_TAB_IDS / BRACKET_TABS', () => {
  it('lists the six bracket sections in order', () => {
    expect(BRACKET_TAB_IDS).toEqual([
      'bracket-setup',
      'bracket-roster',
      'bracket-events',
      'bracket-draw',
      'bracket-schedule',
      'bracket-live',
    ]);
    expect(BRACKET_TABS.map((t) => t.id)).toEqual([
      'bracket-setup',
      'bracket-roster',
      'bracket-events',
      'bracket-draw',
      'bracket-schedule',
      'bracket-live',
    ]);
    expect(BRACKET_TABS.map((t) => t.label)).toEqual([
      'Setup',
      'Roster',
      'Events',
      'Draw',
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

describe('normalizeActiveTab', () => {
  it('snaps a non-bracket tab to bracket-setup when kind is bracket', () => {
    expect(normalizeActiveTab('setup', 'bracket')).toBe('bracket-setup');
    expect(normalizeActiveTab('schedule', 'bracket')).toBe('bracket-setup');
    expect(normalizeActiveTab('bracket', 'bracket')).toBe('bracket-setup');
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

describe('BRACKET_TAB_IDS — extended for entry tabs (#5)', () => {
  it('includes the three new entry-flow ids in order before draw/schedule/live', () => {
    expect(BRACKET_TAB_IDS).toEqual([
      'bracket-setup',
      'bracket-roster',
      'bracket-events',
      'bracket-draw',
      'bracket-schedule',
      'bracket-live',
    ]);
  });
  it('bracketTabView strips the prefix on the new ids', () => {
    expect(bracketTabView('bracket-setup')).toBe('setup');
    expect(bracketTabView('bracket-roster')).toBe('roster');
    expect(bracketTabView('bracket-events')).toBe('events');
  });
  it('normalizeActiveTab snaps non-bracket → bracket-setup (new default landing)', () => {
    expect(normalizeActiveTab('schedule', 'bracket')).toBe('bracket-setup');
  });
});
