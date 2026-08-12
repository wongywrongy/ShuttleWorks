export type CatalogModuleId = 'meet' | 'bracket' | 'display' | 'entries';

export interface ModuleMeta {
  id: CatalogModuleId;
  name: string;
  /** One-line description of what the module does. */
  capability: string;
  /** A dependency/constraint note shown under the capability, when relevant. */
  dependency?: string;
}

/** Frontend capability + dependency metadata for the Modules catalog. The
 *  backend has no description metadata; the dependency notes mirror the server
 *  rules (Display needs an operator; a workspace keeps one operational module). */
export const MODULE_CATALOG: Record<CatalogModuleId, ModuleMeta> = {
  meet: {
    id: 'meet',
    name: 'Meet',
    capability: 'Roster, CP-SAT scheduling, and live match control.',
  },
  bracket: {
    id: 'bracket',
    name: 'Bracket',
    capability: 'Events, seeding, draw generation, advancement, and results.',
  },
  display: {
    id: 'display',
    name: 'Display',
    capability: 'Read-only public display: live matches, draw, or results.',
    dependency: 'Needs Meet or Bracket enabled.',
  },
  entries: {
    id: 'entries',
    name: 'Entries',
    capability: 'Public sign-up page, entry review, and commit to the roster.',
    // Mirrors the server rule (MODULE_REQUIRES_CLOUD, ruling D2): a public
    // entry page is meaningless without real operator accounts, so the row is
    // seeded — and this catalog entry only ever rendered — in cloud mode.
    dependency: 'Needs a cloud-hosted workspace.',
  },
};

export function catalogMeta(id: string): ModuleMeta | undefined {
  return (MODULE_CATALOG as Record<string, ModuleMeta>)[id];
}
