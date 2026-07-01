/**
 * Public-display palette presets.
 *
 * Each preset is a complete substrate (background + text + surface +
 * border) tuned for a specific venue light condition. The CSS lives
 * alongside in `displayPresets.css` as `[data-tv-preset="<id>"]`
 * selectors that override the same `--bg` / `--ink` / `--rule-soft` /
 * `--muted` HSL triplets the design-system already cascades through —
 * so applying the attribute on any element re-themes its subtree
 * without touching child markup.
 *
 * The metadata here is for the Setup picker: id is the storage key,
 * swatchBg / swatchText drive the 40×28 swatch tile, dark drives the
 * grouping label.
 */
export interface DisplayPreset {
  id: string;
  name: string;
  /** Visible swatch fill — matches the preset's CSS `--bg`. */
  swatchBg: string;
  /** Visible swatch stripe — matches the preset's CSS `--ink`. */
  swatchText: string;
  dark: boolean;
}

export const DISPLAY_PRESETS: readonly DisplayPreset[] = [
  // ---------- Dark ----------
  { id: 'court',     name: 'Court',     swatchBg: '#0a0f1e', swatchText: '#ffffff', dark: true  },
  { id: 'pitch',     name: 'Pitch',     swatchBg: '#0c1410', swatchText: '#ffffff', dark: true  },
  { id: 'midnight',  name: 'Midnight',  swatchBg: '#000000', swatchText: '#ffffff', dark: true  },
  { id: 'ash',       name: 'Ash',       swatchBg: '#211f1d', swatchText: '#ebe7e2', dark: true  },
  // ---------- Light ----------
  { id: 'paper',     name: 'Paper',     swatchBg: '#f4efe6', swatchText: '#141414', dark: false },
  { id: 'chalk',     name: 'Chalk',     swatchBg: '#e8eaee', swatchText: '#1a1d24', dark: false },
  { id: 'daylight',  name: 'Daylight',  swatchBg: '#ffffff', swatchText: '#000000', dark: false },
  { id: 'sand',      name: 'Sand',      swatchBg: '#e6dcc6', swatchText: '#3a2a18', dark: false },
];

export const DEFAULT_PRESET_ID = 'court';

export function getPreset(id: string | null | undefined): DisplayPreset {
  if (!id) return DISPLAY_PRESETS[0];
  return DISPLAY_PRESETS.find((p) => p.id === id) ?? DISPLAY_PRESETS[0];
}
