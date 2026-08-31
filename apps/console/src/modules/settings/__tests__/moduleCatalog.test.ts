import { describe, it, expect } from 'vitest';
import { CATALOG_MODULE_IDS, MODULE_CATALOG } from '../moduleCatalog';
import { buildWorkspaceNav } from '../../../platform/product-shell/workspaceNav';
import {
  ARCHITECTURAL_MODULE_IDS,
  ENABLEABLE_MODULE_IDS,
  MODULE_LABELS,
  type ArchModuleId,
} from '../../../platform/product-shell/types';

describe('MODULE_CATALOG', () => {
  it('keeps rendered nav module vocabulary within the canonical module set', () => {
    const canonicalIds = new Set<ArchModuleId>(ARCHITECTURAL_MODULE_IDS);
    const nav = buildWorkspaceNav('meet', new Set(ENABLEABLE_MODULE_IDS));

    for (const section of nav.sections) {
      expect(canonicalIds.has(section.id)).toBe(true);
      expect(section.label).toBe(MODULE_LABELS[section.id]);
    }
  });

  it('makes the module catalog and nav derive identity from the same source', () => {
    expect(CATALOG_MODULE_IDS).toEqual(ENABLEABLE_MODULE_IDS);
    const nav = buildWorkspaceNav('meet', new Set(ENABLEABLE_MODULE_IDS));
    const navLabelById = new Map(
      nav.sections.map((section) => [section.id, section.label]),
    );

    for (const id of ENABLEABLE_MODULE_IDS) {
      expect(MODULE_CATALOG[id].name).toBe(MODULE_LABELS[id]);
      expect(navLabelById.get(id)).toBe(MODULE_LABELS[id]);
    }
    expect(MODULE_LABELS.operations).toBe('Operations');
  });

  it('describes each module with a capability; display notes its dependency', () => {
    expect(MODULE_CATALOG.meet.capability).toMatch(/schedul/i);
    expect(MODULE_CATALOG.bracket.capability).toMatch(/draw|seeding/i);
    expect(MODULE_CATALOG.display.dependency).toMatch(/Meet or Bracket/i);
    expect(MODULE_CATALOG.bracket.dependency).toBeUndefined();
  });

  it('describes Entries and states its cloud dependency', () => {
    // The dependency line mirrors the server rule (MODULE_REQUIRES_CLOUD).
    // Without it the catalog row would offer an Enable the backend refuses.
    expect(MODULE_CATALOG.entries.capability).toMatch(/sign-up|entry|roster/i);
    expect(MODULE_CATALOG.entries.dependency).toMatch(/cloud/i);
  });
});
