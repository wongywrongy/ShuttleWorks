import { describe, expect, it } from 'vitest';
import { contentEqual } from '../contentEqual';

describe('contentEqual', () => {
  it('matches equivalent nested object content', () => {
    expect(contentEqual({ rows: [{ id: 'm1', score: 2 }] }, { rows: [{ id: 'm1', score: 2 }] })).toBe(true);
  });

  it('rejects changed object content', () => {
    expect(contentEqual({ id: 'm1', score: 2 }, { id: 'm1', score: 3 })).toBe(false);
  });
});
