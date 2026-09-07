import { describe, it, expect } from 'vitest';
import { deriveReadiness, matchStateLabel } from '../matchState';

describe('matchState', () => {
  it('derives ready/pending from eligibility alone', () => {
    expect(deriveReadiness({ eligible: true })).toBe('ready');
    expect(deriveReadiness({ eligible: false })).toBe('pending');
  });

  it('labels playing as On court, never Live', () => {
    expect(matchStateLabel('started')).toBe('On court');
  });

  it('labels every canonical state', () => {
    expect(matchStateLabel('scheduled')).toBe('Scheduled');
    expect(matchStateLabel('called')).toBe('Called');
    expect(matchStateLabel('finished')).toBe('Done');
    expect(matchStateLabel('retired')).toBe('Retired');
    expect(matchStateLabel('pending')).toBe('Pending');
    expect(matchStateLabel('ready')).toBe('Ready');
  });
});
