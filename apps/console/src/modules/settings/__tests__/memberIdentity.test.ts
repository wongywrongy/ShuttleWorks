import { describe, it, expect } from 'vitest';
import { shortId, initialFor } from '../memberIdentity';

describe('memberIdentity', () => {
  it('shortens a UUID and derives an initial', () => {
    expect(shortId('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe('3F2504E0');
    expect(initialFor('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe('3');
  });
});
