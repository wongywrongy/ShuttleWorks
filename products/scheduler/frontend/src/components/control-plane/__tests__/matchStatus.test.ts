import { describe, expect, it } from 'vitest';
import {
  STATUS_CLASS,
  STATUS_LABEL,
  type MatchListStatus,
} from '../matchStatus';

describe('shared match status vocabulary', () => {
  it('covers exactly the four canonical states with labels and classes', () => {
    const states: MatchListStatus[] = ['done', 'live', 'ready', 'pending'];
    expect(Object.keys(STATUS_LABEL).sort()).toEqual([...states].sort());
    expect(Object.keys(STATUS_CLASS).sort()).toEqual([...states].sort());
    expect(STATUS_LABEL.done).toBe('Done');
    expect(STATUS_LABEL.live).toBe('Live');
    expect(STATUS_LABEL.ready).toBe('Ready');
    expect(STATUS_LABEL.pending).toBe('Pending');
  });
});
