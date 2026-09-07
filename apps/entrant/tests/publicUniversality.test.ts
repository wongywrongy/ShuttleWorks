import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeRoundIndex } from '../app/routes/draw';
import { stripComments } from './helpers/sourceGuards';

const APP = resolve(__dirname, '../app');
const PUBLIC = resolve(__dirname, '../public/assets');
const read = (path: string) => readFileSync(path, 'utf8');

function publicSourceFiles(): string[] {
  const roots = [APP, PUBLIC];
  return roots.flatMap((root) => readdirSync(root, { recursive: true })
    .map((entry) => resolve(root, String(entry)))
    .filter((path) => /\.(?:ts|tsx|js)$/.test(path) && !path.endsWith('.d.ts') && !path.includes('/tests/')));
}

const PERSON_SURFACES = [
  'routes/schedule.tsx',
  'components/MatchCard.tsx',
  'routes/draw.tsx',
  'routes/player.tsx',
  'routes/tournament.tsx',
  'components/EntrantsList.tsx',
  'routes/partner.tsx',
] as const;

function formatterDefinitionCount(sources: string[]): number {
  return sources.reduce(
    (total, source) => total + (source.match(/function\s+formatPersonIdentity\s*\(/g) ?? []).length,
    0,
  );
}

describe('SP-P9 public person universality', () => {
  it('has one display-string seam and proves a second seam is rejected', () => {
    const sources = [
      ...PERSON_SURFACES.map((file) => read(resolve(APP, file))),
      read(resolve(PUBLIC, 'person-ref.js')),
    ];
    expect(formatterDefinitionCount(sources)).toBe(1);

    // Negative control: a copied formatter anywhere makes the count fail.
    expect(formatterDefinitionCount([...sources, 'function formatPersonIdentity() {}'])).not.toBe(1);
  });

  it('recursively covers every public source and keeps identity decisions in the seam', () => {
    const files = publicSourceFiles();
    const sources = files.map((file) => read(file));
    const seam = read(resolve(PUBLIC, 'person-ref.js'));
    expect(files.length).toBeGreaterThan(10);
    expect(sources.reduce((count, source) => count + (source.match(/function\s+formatPersonIdentity\s*\(/g) ?? []).length, 0)).toBe(1);
    expect(sources.filter((source) => source.includes('formatPersonIdentity')).length).toBe(1);
    expect(sources.filter((source) => source.includes('identity?.name') || source.includes('identity.name')).length).toBe(1);
    expect(seam).toContain('personRefModel');
    // Negative control: a second identity formatter must make the guard red.
    const mutated = [...sources, 'function formatPersonIdentity() {}'];
    expect(mutated.reduce((count, source) => count + (source.match(/function\s+formatPersonIdentity\s*\(/g) ?? []).length, 0)).not.toBe(1);
  });

  it('has no identity-string parsing anywhere in the public tier', () => {
    const source = publicSourceFiles().map((file) => read(file)).join('\n');
    expect(source).not.toMatch(/\b(?:identity|persons|names|people|playerName|playerNames)\b[^\n]*\.split\s*\(/i);
    expect(source).not.toMatch(/(?:identity|person|player)\.(?:first|last|given|family|surname)\b/i);
  });

  it('routes every named surface through PersonRef and never derives a route from a name', () => {
    for (const file of PERSON_SURFACES) {
      const source = read(resolve(APP, file));
      expect(source, file).toMatch(/PersonRef|PersonGroup/);
      expect(source, file).not.toMatch(/players\/\$\{[^}]*(?:name|label)/i);
      expect(source, file).not.toMatch(/(?:identity|person|player)\.name\s*[}<]/);
    }
    const seam = read(resolve(PUBLIC, 'person-ref.js'));
    expect(seam).toMatch(/identity\.id/);
    expect(seam).not.toMatch(/players\/\$\{[^}]*name/i);
  });

  it('contains no legacy composite-name wire shape or identity parser', () => {
    const sources = PERSON_SURFACES.map((file) => read(resolve(APP, file))).join('\n');
    expect(sources).not.toMatch(/names\??:\s*string\[\]/);
    expect(sources).not.toMatch(/\.(?:names|identities|people)\b/);
    expect(sources).not.toMatch(/\b(?:identity|persons|names|people|playerName|playerNames)\b[^\n]*\.split\s*\(/i);
  });
});

describe('SP-P9 bracket invariants', () => {
  it('normalizes invalid round query values once against the selected segment', () => {
    expect(normalizeRoundIndex(null, 4)).toBe(0);
    expect(normalizeRoundIndex('-1', 4)).toBe(0);
    expect(normalizeRoundIndex('NaN', 4)).toBe(0);
    expect(normalizeRoundIndex('1.5', 4)).toBe(0);
    expect(normalizeRoundIndex('99', 4)).toBe(3);
    expect(normalizeRoundIndex('2', 0)).toBe(0);
    // Negative control: an unclamped parser would leak the oversized round.
    expect(Math.min(Math.max(Number('99'), 0), 3)).not.toBe(99);
  });

  // public-visual-fixes P4 / match-card §4.3: the 450px and 850px total
  // draw-height ceilings this test used to model are WITHDRAWN, along with
  // the per-node height they were derived from — a 44px (or 58px) node
  // cannot hold a doubles side, and a ceiling on the whole draw can only be
  // met by shrinking what the reader came to read. Height now comes from
  // content, the tree is bounded by its scroll REGION, and the numbers are
  // measured in a real browser by
  // `tests/e2e/tests/11-public-bracket-geometry.spec.ts`. What stays here is
  // the source-level invariant that survived: ONE separation constant, no
  // fixed node height, and no measured layout anywhere.
  it('derives node height from content and keeps one separation constant', () => {
    const card = stripComments(read(resolve(APP, 'components/MatchCard.tsx')));
    const css = read(resolve(APP, 'app.css'));
    const node = card.slice(card.indexOf('public-bracket-node'));
    // No height, and no width of its own: the column owns the width.
    expect(node).not.toMatch(/\bmin-h-\[/);
    expect(node.slice(0, 400)).not.toMatch(/\bw-72\b/);
    // The separation is padding on the slot, spelled once, in the 8-12 band.
    const padding = /\.bracket-slot\s*\{[^}]*padding-block:\s*(\d+)px/.exec(css);
    expect(padding).not.toBeNull();
    expect(Number(padding![1]) * 2).toBeGreaterThanOrEqual(8);
    expect(Number(padding![1]) * 2).toBeLessThanOrEqual(12);
    // ...and the region that bounds the tree, rather than a height ceiling.
    expect(css).toContain('.bracket-scroll');
    expect(css).toContain('.bracket-round-header');
  });

  it('pins three-row nodes, CSS-grid braces, and the absence of measured connectors', () => {
    const card = read(resolve(APP, 'components/MatchCard.tsx'));
    const draw = stripComments(read(resolve(APP, 'routes/draw.tsx')));
    const css = read(resolve(APP, 'app.css'));
    expect(card).toContain('grid-rows-[auto_auto_auto]');
    expect(card).toContain('break-words');
    expect(card).not.toContain('truncate');
    expect(card).not.toContain('Opponent beaten: ');
    expect(css).toContain('.bracket-link-slot::before');
    expect(css).toContain('.bracket-link-slot::after');
    expect(css).toContain('height: 50%');
    // Still no SVG, no ResizeObserver, no measured connector layout: the
    // braces are pseudo-elements on equal flex slots, which is why varied
    // node heights need no recalculation in JavaScript at all.
    expect(`${draw}\n${stripComments(css)}`).not.toMatch(/<svg|ResizeObserver|getBoundingClientRect|position:\s*absolute|bracket-connectors/);
  });
});

describe('SP-P9 reduction guard', () => {
  it('keeps status containers off the touched tournament surfaces', () => {
    const files = [
      'components/HeroHeader.tsx',
      'components/MatchCard.tsx',
      'components/EventRow.tsx',
      'components/SeasonStatusCell.tsx',
      'components/SeasonControls.tsx',
      'components/NowStrip.tsx',
      'routes/schedule.tsx',
      'routes/draw.tsx',
      'routes/player.tsx',
      'routes/tournament.tsx',
    ];
    for (const file of files) {
      const source = read(resolve(APP, file));
      expect(source, file).not.toMatch(/rounded-full|bg-status-(?:live|done)-bg/);
    }
  });
});
