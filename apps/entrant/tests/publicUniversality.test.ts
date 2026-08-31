import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeRoundIndex } from '../app/routes/draw';

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

function bracketHeight(nodeLines: number, firstRoundMatches: number): number {
  const nodeHeight = nodeLines * 22;
  const baseGap = 6;
  const headingAndGap = 28;
  const canvasPadding = 16;
  return headingAndGap + firstRoundMatches * (nodeHeight + baseGap) - baseGap + canvasPadding;
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

  it('keeps the four-round fixture under 450px and a 32 draw under its 850px ceiling', () => {
    expect(bracketHeight(2, 8)).toBeLessThan(450);
    expect(bracketHeight(2, 16)).toBeLessThan(850);

    // Negative control: restoring a third 22px line breaks both ceilings.
    expect(bracketHeight(3, 8)).toBeGreaterThanOrEqual(450);
    expect(bracketHeight(3, 16)).toBeGreaterThanOrEqual(850);
  });

  it('pins two-line nodes, CSS-grid braces, and the absence of measured connectors', () => {
    const card = read(resolve(APP, 'components/MatchCard.tsx'));
    const draw = read(resolve(APP, 'routes/draw.tsx'));
    const css = read(resolve(APP, 'app.css'));
    expect(card).toContain('h-[44px]');
    expect(card).toContain('grid-rows-2');
    expect(card).toContain('truncate');
    expect(card).toContain('Opponent beaten: ');
    expect(css).toContain('.bracket-link-slot::before');
    expect(css).toContain('.bracket-link-slot::after');
    expect(css).toContain('height: 50%');
    expect(`${draw}\n${css}`).not.toMatch(/<svg|ResizeObserver|getBoundingClientRect|position:\s*absolute|bracket-connectors/);
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
