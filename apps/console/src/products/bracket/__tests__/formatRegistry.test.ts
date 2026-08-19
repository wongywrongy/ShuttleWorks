import { describe, it, expect } from 'vitest';
import { DRAW_FORMATS, descriptorFor } from '../formatRegistry';

describe('formatRegistry — DRAW_FORMATS', () => {
  it('registers all 8 formats in picker order', () => {
    expect(DRAW_FORMATS.map((d) => d.id)).toEqual([
      'se',
      'rr',
      'de',
      'monrad',
      'compass',
      'swiss',
      'groups',
      'ladder',
    ]);
  });

  it('marks exactly the shipped formats implemented (groups/ladder are roadmap)', () => {
    const implemented = DRAW_FORMATS.filter((d) => d.implemented).map((d) => d.id);
    expect(implemented).toEqual(['se', 'rr', 'de', 'monrad', 'compass', 'swiss']);
    expect(descriptorFor('groups')?.implemented).toBe(false);
    expect(descriptorFor('ladder')?.implemented).toBe(false);
  });

  it('every descriptor carries complete picker copy, a glyph, and a renderer', () => {
    for (const d of DRAW_FORMATS) {
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.blurb.length).toBeGreaterThan(0);
      expect(d.matchesHint.length).toBeGreaterThan(0);
      expect(typeof d.glyph).toBe('function');
      expect(['bracket', 'grid', 'segments', 'swiss']).toContain(d.renderer);
    }
  });

  it('pins each format to its renderer family', () => {
    expect(descriptorFor('se')?.renderer).toBe('bracket');
    expect(descriptorFor('rr')?.renderer).toBe('grid');
    expect(descriptorFor('de')?.renderer).toBe('segments');
    expect(descriptorFor('monrad')?.renderer).toBe('segments');
    expect(descriptorFor('compass')?.renderer).toBe('segments');
    expect(descriptorFor('swiss')?.renderer).toBe('swiss');
  });

  it('pins the load-bearing config-field wiring (column vs config targets)', () => {
    for (const d of DRAW_FORMATS) {
      for (const f of d.fields) {
        expect(['column', 'config']).toContain(f.target);
      }
    }
    // Swiss rounds live in the config blob (resolved at generate time).
    expect(descriptorFor('swiss')?.fields).toEqual([
      expect.objectContaining({ key: 'swiss_rounds', kind: 'number', target: 'config' }),
    ]);
    // Monrad consolation depth: select into config, defaulting to full
    // classification (the badminton-native "everyone keeps playing").
    expect(
      descriptorFor('monrad')?.fields.find((f) => f.key === 'consolation'),
    ).toMatchObject({ kind: 'select', target: 'config', default: 'full' });
    // DE grand-final reset: toggle into config.
    expect(
      descriptorFor('de')?.fields.find((f) => f.key === 'grand_final_reset'),
    ).toMatchObject({ kind: 'toggle', target: 'config' });
    // rr_rounds is a real DTO column, bounded 1–4.
    expect(descriptorFor('rr')?.fields.find((f) => f.key === 'rr_rounds')).toMatchObject({
      kind: 'number',
      target: 'column',
      min: 1,
      max: 4,
    });
    // seeded_count / bracket_size are DTO columns on the knockout family.
    for (const id of ['se', 'de', 'monrad', 'compass'] as const) {
      const keys = descriptorFor(id)?.fields.filter((f) => f.target === 'column').map((f) => f.key);
      expect(keys).toEqual(expect.arrayContaining(['seeded_count', 'bracket_size']));
    }
  });
});

describe('descriptorFor', () => {
  it('resolves known ids case-insensitively', () => {
    expect(descriptorFor('se')?.label).toBe('Single elimination');
    expect(descriptorFor('SE')?.id).toBe('se');
    expect(descriptorFor('Swiss')?.id).toBe('swiss');
  });

  it('returns undefined for unknown / absent formats (raw-id fallback)', () => {
    expect(descriptorFor('mystery')).toBeUndefined();
    expect(descriptorFor(undefined)).toBeUndefined();
    expect(descriptorFor('')).toBeUndefined();
  });
});
