import {
  ENABLEABLE_MODULE_IDS,
  MODULE_LABELS,
  type ModuleId,
} from '../../platform/product-shell/types';

export type CatalogModuleId = ModuleId;

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
 *  rules (Display needs an operator; a workspace keeps one operational module).
 *  The leading role word (Intake/Engine/Output) is the intake → engine → emit
 *  taxonomy — it lives HERE, in prose, since the sidebar role badges were
 *  removed (SP-CONSOLE-REFINE G2/A4.1). */
export const MODULE_CATALOG: Record<CatalogModuleId, ModuleMeta> = {
  meet: {
    id: 'meet',
    name: MODULE_LABELS.meet,
    capability: 'Engine · roster, CP-SAT scheduling, and live match control.',
  },
  bracket: {
    id: 'bracket',
    name: MODULE_LABELS.bracket,
    capability: 'Engine · events, seeding, draw generation, advancement, and results.',
  },
  display: {
    id: 'display',
    name: MODULE_LABELS.display,
    capability: 'Output · projects live matches, the draw, or results, read-only.',
    dependency: 'Needs Meet or Bracket enabled.',
  },
  entries: {
    id: 'entries',
    name: MODULE_LABELS.entries,
    capability: 'Intake · public sign-up page, entry review, and commit to the roster.',
    // Mirrors the server rule (MODULE_REQUIRES_CLOUD, ruling D2): a public
    // entry page is meaningless without real operator accounts, so the row is
    // seeded — and this catalog entry only ever rendered — in cloud mode.
    dependency: 'Needs a cloud-hosted workspace.',
  },
};

/** The catalog order is shared with workspace module normalization. */
export const CATALOG_MODULE_IDS = ENABLEABLE_MODULE_IDS;

export function catalogMeta(id: string): ModuleMeta | undefined {
  return (MODULE_CATALOG as Record<string, ModuleMeta>)[id];
}
