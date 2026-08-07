/**
 * Row Modules-column glyph descriptors (redesign). The mockup shows a
 * workspace's **enabled** modules as solid M/D/B glyphs; a workspace with
 * nothing enabled yet shows a single **dashed** glyph for its kind's default
 * module (the "set me up" affordance — e.g. a fresh "Untitled meet" → dashed M).
 * Pure; disabled / coming_soon modules are never shown.
 */
import type { WorkspaceModuleDTO } from '../../api/dto';

export type ModuleGlyphId = 'meet' | 'display' | 'bracket' | 'entries';

export interface ModuleGlyph {
  id: ModuleGlyphId;
  letter: string;
  enabled: boolean;
}

const GLYPH_ORDER: ModuleGlyphId[] = ['meet', 'display', 'bracket', 'entries'];
const GLYPH_LETTER: Record<ModuleGlyphId, string> = {
  meet: 'M',
  display: 'D',
  bracket: 'B',
  entries: 'E',
};

export function moduleGlyphs(
  modules: WorkspaceModuleDTO[],
  kind: 'meet' | 'bracket',
): ModuleGlyph[] {
  const status = new Map(modules.map((m) => [m.moduleId, m.status]));
  const enabled = GLYPH_ORDER.filter((id) => status.get(id) === 'enabled');
  if (enabled.length > 0) {
    return enabled.map((id) => ({ id, letter: GLYPH_LETTER[id], enabled: true }));
  }
  const def: ModuleGlyphId = kind === 'bracket' ? 'bracket' : 'meet';
  return [{ id: def, letter: GLYPH_LETTER[def], enabled: false }];
}
