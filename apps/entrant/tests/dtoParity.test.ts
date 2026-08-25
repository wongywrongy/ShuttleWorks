/**
 * The entrant tier's hand mirrors are checked against the generated OpenAPI
 * shapes (R-DM-9a, SP-DM-3 P0; F-DM-29: "a fully hand-maintained mirror of
 * Pydantic response models with no generator and no cross-tier contract
 * test - nothing fails when a backend field changes shape"). This is that
 * test.
 *
 * Reads the console package's generated file and the single allow-list -
 * the same cross-package read direction as
 * `apps/console/src/store/__tests__/nonSchedulingKeys.parity.test.ts`.
 *
 * PAIRS is explicit, NOT auto-by-name: entrant `EntryPageDTO` /
 * `EntryEventDTO` collide with unrelated operator-side schemas of the same
 * name, and auto-pairing would compare the wrong shapes.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(__dirname, '../../..');
const CONSOLE_API = resolve(REPO, 'apps/console/src/api');

// ponytail: the two parsers are copied from
// apps/console/src/api/__tests__/dtoParity.test.ts - ~30 lines duplicated
// rather than inventing a shared test-util package for two consumers.
// Extract when a third tier needs them.

/** Every generated schema name -> its property names.
 *  ponytail: indentation regex over a machine-formatted file, not a TS
 *  parse. The pinned floor in the first test is what makes a formatting
 *  change fail loudly instead of emptying the comparison.
 *
 *  The scan is SCOPED to `export interface components`: the sibling `paths`
 *  and `operations` interfaces carry their own 8-space `parameters:`/
 *  `responses:`/`requestBody:` blocks, which an unscoped scan mistakes for
 *  schemas named after them. Same scoping as the Python twin. */
function parseGenerated(source: string): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  let current: string | null = null;
  let inComponents = false;
  for (const line of source.split(/\r?\n/)) {
    if (!inComponents) {
      inComponents = line.startsWith('export interface components');
      continue;
    }
    if (line.startsWith('}')) break;
    const open = /^ {8}([A-Za-z_][A-Za-z0-9_]*): \{$/.exec(line);
    if (open) {
      current = open[1];
      out[current] = new Set();
      continue;
    }
    if (!current) continue;
    const field = /^ {12}([A-Za-z_$][A-Za-z0-9_$]*)\??:/.exec(line);
    if (field) out[current].add(field[1]);
    else if (/^ {8}\};$/.test(line)) current = null;
  }
  return out;
}

/** Every top-level `export interface|type X { ... }` -> its member names.
 *  `[^{]*` absorbs `extends Y` and generics; unions without a body (e.g.
 *  `export type X = 'a' | 'b';`) have no `{` and are correctly skipped. */
function parseHand(source: string): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  let current: string | null = null;
  for (const line of source.split(/\r?\n/)) {
    const open = /^export (?:interface|type) ([A-Za-z_][A-Za-z0-9_]*)[^{]*\{/.exec(line);
    if (open) {
      current = open[1];
      out[current] = new Set();
      continue;
    }
    if (!current) continue;
    const field = /^ {2}([A-Za-z_$][A-Za-z0-9_$]*)\??:/.exec(line);
    if (field) out[current].add(field[1]);
    else if (/^\}/.test(line)) current = null;
  }
  return out;
}

/** hand shape -> generated schema name, per mirror file. */
const MIRRORS: { file: string; pairs: Record<string, string>; unpaired: Record<string, string> }[] =
  [
    {
      file: 'apps/entrant/app/lib/entryPage.types.ts',
      pairs: {
        EntryPageDTO: 'EntryPageProjection',
        EntryTournamentDTO: 'TournamentDTO',
        EntryNamedDTO: 'NamedDTO',
        EntryVenueDTO: 'VenueDTO',
        EntryPageContentDTO: 'PageDTO',
        EntryPolicyDTO: 'PolicyDTO',
        EntryPublicationDTO: 'PublicationDTO',
        EntryEventDTO: 'EventDTO',
        EntrantListRowDTO: 'EntrantRowDTO',
        ReserveRowDTO: 'ReserveRowDTO',
        EntryPageViewerDTO: 'ViewerDTO',
      },
      unpaired: {},
    },
    {
      // Name-identical throughout: every shape here is reached from
      // DrawsIndexDTO / DrawDetailDTO / SeedsDTO / WinnersDTO by a
      // `components["schemas"][...]` reference of the same name.
      file: 'apps/entrant/app/lib/draws.types.ts',
      pairs: {
        DrawCardDTO: 'DrawCardDTO',
        DrawsIndexDTO: 'DrawsIndexDTO',
        TeamDTO: 'TeamDTO',
        SideDTO: 'SideDTO',
        NodeResultDTO: 'NodeResultDTO',
        MatchNodeDTO: 'MatchNodeDTO',
        RoundDTO: 'RoundDTO',
        SegmentDTO: 'SegmentDTO',
        StandingRowDTO: 'StandingRowDTO',
        DrawDetailDTO: 'DrawDetailDTO',
        SeedLineDTO: 'SeedLineDTO',
        SeedsEventDTO: 'SeedsEventDTO',
        SeedsDTO: 'SeedsDTO',
        HonorDTO: 'HonorDTO',
        WinnersEventDTO: 'WinnersEventDTO',
        WinnersDTO: 'WinnersDTO',
      },
      unpaired: {},
    },
    {
      file: 'apps/entrant/app/lib/player.types.ts',
      pairs: {
        PlayerMatchSideDTO: 'PlayerMatchSideDTO',
        PlayerMatchDTO: 'PlayerMatchDTO',
        PlayerEventDTO: 'PlayerEventDTO',
        PlayerRecordDTO: 'PlayerRecordDTO',
        PlayerPageDTO: 'PlayerPageDTO',
      },
      unpaired: {},
    },
    {
      file: 'apps/entrant/public/assets/my-entries.d.ts',
      pairs: {
        MyEntries: 'MyEntriesDTO',
        MyEntryLine: 'MyEntryLineDTO',
        MyTournamentCard: 'MyTournamentCardDTO',
      },
      unpaired: {},
    },
  ];

const generated = parseGenerated(readFileSync(resolve(CONSOLE_API, 'dto.generated.ts'), 'utf-8'));
const allowlist = JSON.parse(
  readFileSync(resolve(CONSOLE_API, '__tests__/dtoParity.allowlist.json'), 'utf-8'),
) as { shape: string; field: string; side: string; kind: string; why: string }[];
const key = (e: { shape: string; field: string; side: string }) =>
  `${e.shape}.${e.field}:${e.side}`;

describe.each(MIRRORS)('entrant DTO parity: $file', ({ file, pairs, unpaired }) => {
  const hand = parseHand(readFileSync(resolve(REPO, file), 'utf-8'));

  it('every hand shape is either paired or explicitly unpaired with a reason', () => {
    // No shape drifts unpoliced by simply being forgotten.
    expect(Object.keys(hand).sort()).toEqual(
      [...Object.keys(pairs), ...Object.keys(unpaired)].sort(),
    );
    for (const why of Object.values(unpaired)) expect(why.length).toBeGreaterThan(20);
  });

  it('every paired schema exists in the generated file', () => {
    for (const schema of Object.values(pairs)) expect(Object.keys(generated)).toContain(schema);
  });

  it('keys match, except the allow-listed divergences', () => {
    const allowed = new Set(allowlist.map(key));
    const unexpected: unknown[] = [];
    for (const [name, schema] of Object.entries(pairs)) {
      const wire = generated[schema];
      for (const k of hand[name])
        if (!wire.has(k) && !allowed.has(key({ shape: name, field: k, side: 'hand-only' })))
          unexpected.push(`${name}.${k} hand-only`);
      for (const k of wire)
        if (!hand[name].has(k) && !allowed.has(key({ shape: name, field: k, side: 'generated-only' })))
          unexpected.push(`${name}.${k} generated-only`);
    }
    expect(unexpected).toEqual([]);
  });
});
