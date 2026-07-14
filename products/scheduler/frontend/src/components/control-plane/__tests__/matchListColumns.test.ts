import { describe, expect, it } from 'vitest';
import { MATCH_LIST_COLUMNS } from '../matchListColumns';

describe('MATCH_LIST_COLUMNS — the one column geometry both match lists share', () => {
  it('has the unified 7-column anatomy in order', () => {
    expect(MATCH_LIST_COLUMNS.map((c) => c.label)).toEqual([
      '', '#', 'Event', 'Side A', 'Side B', 'Status', '',
    ]);
    expect(MATCH_LIST_COLUMNS.map((c) => c.className)).toEqual([
      'w-4',
      'w-8',
      'w-20',
      'min-w-0 flex-[3]',
      'min-w-0 flex-[3]',
      'w-[5.5rem] text-right',
      'w-8',
    ]);
  });
});
