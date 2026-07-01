import { describe, it, expect } from 'vitest';
import { MODULE_CATALOG } from '../moduleCatalog';

describe('MODULE_CATALOG', () => {
  it('describes each module with a capability; display notes its dependency', () => {
    expect(MODULE_CATALOG.meet.capability).toMatch(/schedul/i);
    expect(MODULE_CATALOG.bracket.capability).toMatch(/draw|seeding/i);
    expect(MODULE_CATALOG.display.dependency).toMatch(/Meet or Bracket/i);
    expect(MODULE_CATALOG.bracket.dependency).toBeUndefined();
  });
});
