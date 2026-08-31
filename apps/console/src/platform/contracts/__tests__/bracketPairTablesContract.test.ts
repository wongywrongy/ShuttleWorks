/**
 * SP-PAIR-1 table ownership contract (R-PAIR-7/R-PAIR-8).
 *
 * Rendering tests prove that a particular fixture happens to mount a strict
 * table. This source guard keeps the migration boundary honest as well: the
 * Bracket roster, picker candidates, and existing pairs must all enter the
 * shared strict primitive, while the private list/table implementations they
 * replaced cannot quietly return.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../..');

const readSrc = (relative: string) => readFileSync(path.join(SRC, relative), 'utf8');

/** Comments explain the migration, but are not production ownership. */
const code = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const denseDataTable = readSrc('components/control-plane/DenseDataTable.tsx');
const roster = code(readSrc('modules/bracket/BracketRosterTab.tsx'));
const picker = code(readSrc('modules/bracket/ParticipantPicker.tsx'));

describe('SP-PAIR-1 — in-scope Bracket record tables use DenseDataTable strict mode', () => {
  it('keeps the shared strict primitive present and contract-marked', () => {
    expect(denseDataTable).toContain('export function DenseDataTable');
    expect(denseDataTable).toContain('strictRows?: boolean');
    expect(denseDataTable).toContain('data-strict-record-table');
    expect(denseDataTable).toContain('data-strict-row="true"');
  });

  it('routes the Bracket roster through one strict DenseDataTable', () => {
    expect(roster.match(/<DenseDataTable(?:\s|>)/g)).toHaveLength(1);
    expect(roster).toContain('strictRows');
    expect(roster).toContain('elasticColumnId="player"');
  });

  it('routes picker candidates and existing pairs through strict tables', () => {
    // One private adapter is allowed to supply the two record shapes; it must
    // delegate to the shared primitive rather than rendering a list/table.
    expect(picker.match(/<DenseDataTable(?:\s|>)/g)).toHaveLength(1);
    expect(picker).toContain('function PickerRecordTable');
    expect(picker).toContain('strictRows');
    expect(picker).toContain('records={playerOptions(');
    expect(picker).toContain('candidateStatus');
    expect(picker).toContain('records={pairs.map((pair)');
  });
});

describe('SP-PAIR-1 — private record-list replacements stay deleted', () => {
  it('does not leave private list/table markup in the migrated consumers', () => {
    const offenders = [
      ['modules/bracket/BracketRosterTab.tsx', roster],
      ['modules/bracket/ParticipantPicker.tsx', picker],
    ].flatMap(([relative, source]) => {
      const tags = source.match(/<(?:ul|ol|table)(?:\s|>)/g) ?? [];
      return tags.map((tag) => `${relative}: ${tag}`);
    });

    expect(offenders).toEqual([]);
  });

  it('does not reintroduce the replaced non-strict picker/roster components', () => {
    // These were the old component entry paths/owners in the migration: the
    // shared EventPicker and BandedTable were not the strict record primitive,
    // and the pairs list was private JSX in ParticipantPicker.
    expect(roster).not.toMatch(/\bBandedTable\b/);
    expect(picker).not.toMatch(/\bEventPicker\b/);
    expect(picker).not.toMatch(/\b(?:Doubles|Participant|Player)(?:Pairs|Picker)?(?:List|Table)\b/);
  });

  it('has no retired private table/list files under the Bracket module', () => {
    const retired = [
      'modules/bracket/BracketRosterTable.tsx',
      'modules/bracket/BracketRosterList.tsx',
      'modules/bracket/DoublesPairsTable.tsx',
      'modules/bracket/DoublesPairsList.tsx',
      'modules/bracket/ParticipantList.tsx',
      'modules/bracket/ParticipantTable.tsx',
    ];

    expect(retired.filter((relative) => existsSync(path.join(SRC, relative)))).toEqual([]);
  });
});
