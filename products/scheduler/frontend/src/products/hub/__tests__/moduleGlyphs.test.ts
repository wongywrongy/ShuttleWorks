import { describe, it, expect } from 'vitest';
import { moduleGlyphs } from '../moduleGlyphs';
import type { WorkspaceModuleDTO } from '../../../api/dto';

const mod = (moduleId: string, status: string): WorkspaceModuleDTO =>
  ({ moduleId, status, config: null }) as WorkspaceModuleDTO;

describe('moduleGlyphs', () => {
  it('shows enabled modules as solid glyphs in M/D/B display order', () => {
    // bracket + meet enabled, display only available → only the two enabled,
    // ordered meet then bracket (display order), available display omitted.
    expect(
      moduleGlyphs([mod('bracket', 'enabled'), mod('meet', 'enabled'), mod('display', 'available')], 'meet'),
    ).toEqual([
      { id: 'meet', letter: 'M', enabled: true },
      { id: 'bracket', letter: 'B', enabled: true },
    ]);
  });

  it('shows a single dashed kind-default glyph when nothing is enabled', () => {
    expect(moduleGlyphs([mod('meet', 'available')], 'meet')).toEqual([
      { id: 'meet', letter: 'M', enabled: false },
    ]);
    expect(moduleGlyphs([], 'bracket')).toEqual([
      { id: 'bracket', letter: 'B', enabled: false },
    ]);
  });

  it('gives Entries an E glyph, after the three every workspace has', () => {
    expect(
      moduleGlyphs([mod('entries', 'enabled'), mod('meet', 'enabled')], 'meet'),
    ).toEqual([
      { id: 'meet', letter: 'M', enabled: true },
      { id: 'entries', letter: 'E', enabled: true },
    ]);
  });

  it('shows no E on a workspace without the module (local mode)', () => {
    // NEGATIVE CONTROL: the glyph row is driven by the sent rows, and in
    // local mode the backend never sends an entries row (ruling D2).
    expect(
      moduleGlyphs([mod('meet', 'enabled')], 'meet').map((g) => g.letter),
    ).not.toContain('E');
  });

  it('ignores disabled / coming_soon modules', () => {
    expect(
      moduleGlyphs([mod('meet', 'enabled'), mod('display', 'coming_soon'), mod('bracket', 'disabled')], 'meet'),
    ).toEqual([{ id: 'meet', letter: 'M', enabled: true }]);
  });
});
