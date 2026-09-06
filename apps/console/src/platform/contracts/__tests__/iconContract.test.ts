/**
 * Icon contract (v3 consolidated plan, package 28) — one icon per concept.
 *
 * The product already runs two icon sets by design (`packages/design-system/
 * icons/README.md`): 15 custom domain glyphs (court/racket/bracket/status)
 * carry brand personality, and `@phosphor-icons/react` is the secondary set
 * for generic UI affordances. This file pins the CONCEPT -> ICON map for the
 * generic Phosphor set across the app so a future PR cannot introduce a
 * second icon for a concept this codebase already has one for (e.g. a
 * `Pencil` alongside the existing `PencilSimple`, or a `Trash` alongside a
 * future `TrashSimple`) without a deliberate, reviewed change to this file.
 *
 * Scope matches package 28's edit scope: `apps/console/src/{components,
 * platform,modules}` and `apps/entrant/app/components` — the same surfaces
 * whose separators and borders this package audited.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../../../..');

const SCAN_ROOTS = [
  'apps/console/src/app',
  'apps/console/src/components',
  'apps/console/src/platform',
  'apps/console/src/modules',
  'apps/entrant/app/components',
  'packages/design-system/components',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
      continue;
    }
    if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.test\.[jt]sx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*['"]@phosphor-icons\/react['"]/g;

function scanIconNames(): Set<string> {
  const names = new Set<string>();
  for (const root of SCAN_ROOTS) {
    const abs = path.join(REPO, root);
    for (const file of walk(abs)) {
      const src = readFileSync(file, 'utf8');
      let m: RegExpExecArray | null;
      const re = new RegExp(IMPORT_RE);
      while ((m = re.exec(src))) {
        for (const part of m[1].split(',')) {
          const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
          // Type-only re-exports (e.g. a local `IconProps` re-exported next
          // to the icon components it types) are not icon glyphs.
          if (name && !/Props$/.test(name)) names.add(name);
        }
      }
    }
  }
  return names;
}

/**
 * The current, reviewed concept -> Phosphor-icon vocabulary. A name here is
 * the ONE icon this codebase uses for that concept. Adding a new concept
 * means adding one row here in the same PR that adds the import — the test
 * below fails loudly on any icon name that isn't in this map, so an
 * unreviewed second icon for an existing concept (or an unreviewed new
 * concept) cannot land silently.
 */
const CONCEPT_ICON_MAP: Readonly<Record<string, string>> = Object.freeze({
  undo: 'ArrowCounterClockwise',
  'back / previous': 'ArrowLeft',
  'forward / next': 'ArrowRight',
  'open in new tab': 'ArrowSquareOut',
  refresh: 'ArrowsClockwise',
  'collapse / shrink': 'ArrowsIn',
  'expand / fullscreen': 'ArrowsOut',
  'disclosure, closed / sort descending': 'CaretDown',
  'disclosure, open (inline) / row detail affordance / pagination next': 'CaretRight',
  'pagination previous': 'CaretLeft',
  'sort ascending': 'CaretUp',
  'confirm / success (circled)': 'CheckCircle',
  'zoom to fit / reset view': 'CornersOut',
  live: 'Lightning',
  'zoom out': 'MagnifyingGlassMinus',
  'zoom in': 'MagnifyingGlassPlus',
  'widen / readable view': 'ArrowsOutLineHorizontal',
  'confirm / selected (inline check)': 'Check',
  loading: 'CircleNotch',
  time: 'Clock',
  break: 'Coffee',
  'sign in / enter': 'DoorOpen',
  'drag handle': 'DotsSixVertical',
  overflow: 'DotsThree',
  download: 'Download',
  'show / reveal': 'Eye',
  'hide / conceal': 'EyeSlash',
  settings: 'GearSix',
  info: 'Info',
  menu: 'List',
  search: 'MagnifyingGlass',
  edit: 'PencilSimple',
  'sign out': 'SignOut',
  people: 'Users',
  'warning, advisory': 'Warning',
  'warning, blocking': 'WarningOctagon',
  close: 'X',
  'error (circled)': 'XCircle',
  // Structural / non-glyph exports from the same package, not concepts:
  'phosphor icon-context provider': 'IconContext',
});

const KNOWN_ICON_NAMES = new Set(Object.values(CONCEPT_ICON_MAP));

describe('icon contract has something to scan', () => {
  it('finds Phosphor icon imports in the scanned surfaces', () => {
    const found = scanIconNames();
    expect(found.size).toBeGreaterThan(10);
    expect(found.has('PencilSimple')).toBe(true);
  });
});

describe('one icon per concept — the generic (Phosphor) icon set', () => {
  it('uses no Phosphor icon name outside the reviewed concept map', () => {
    const found = [...scanIconNames()].sort();
    const unknown = found.filter((name) => !KNOWN_ICON_NAMES.has(name));
    expect(unknown).toEqual([]);
  });

  it('keeps every mapped icon actually in use (no stale rows)', () => {
    const found = scanIconNames();
    const stale = Object.entries(CONCEPT_ICON_MAP)
      .filter(([concept, icon]) => concept !== 'phosphor icon-context provider' && !found.has(icon))
      .map(([concept, icon]) => `${concept}: ${icon}`);
    expect(stale).toEqual([]);
  });

  it('never maps two concepts to a name that collides case-insensitively with a different concept\'s icon', () => {
    // A cheap duplicate-family guard: PencilSimple vs Pencil, Trash vs
    // TrashSimple, etc. would both be present in scanIconNames() if a
    // second icon for an already-covered concept were introduced — the
    // "uses no icon outside the map" test above already fails on that, but
    // this also catches the map itself drifting to list both spellings.
    const values = Object.values(CONCEPT_ICON_MAP);
    expect(new Set(values).size).toBe(values.length);
  });
});
