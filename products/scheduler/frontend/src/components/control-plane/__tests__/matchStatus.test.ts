import { describe, expect, it } from 'vitest';
import {
  STATUS_LABEL,
  STATUS_PILL_TONE,
  type MatchListStatus,
} from '../matchStatus';

describe('shared match status vocabulary', () => {
  it('covers exactly the four canonical states with labels and pill tones', () => {
    const states: MatchListStatus[] = ['done', 'live', 'ready', 'pending'];
    expect(Object.keys(STATUS_LABEL).sort()).toEqual([...states].sort());
    expect(Object.keys(STATUS_PILL_TONE).sort()).toEqual([...states].sort());
    expect(STATUS_LABEL.done).toBe('Done');
    expect(STATUS_LABEL.live).toBe('Live');
    expect(STATUS_LABEL.ready).toBe('Ready');
    expect(STATUS_LABEL.pending).toBe('Pending');
    // Console pill semantics: green is live's alone; ready reads scheduled-blue.
    expect(STATUS_PILL_TONE.live).toBe('green');
    expect(STATUS_PILL_TONE.ready).toBe('blue');
  });
});
