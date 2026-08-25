import { describe, it, expect } from 'vitest';
import { healBracketRosterNames, reconcileBracketRoster } from '../bracketMigration';
import type { BracketTournamentDTO } from '../../../api/bracketDto';
import type { BracketPlayerDTO } from '../../../api/dto';

describe('reconcileBracketRoster', () => {
  it('extracts unique players from PLAYER participants', () => {
    const bracket = {
      participants: [
        { id: 'p-alex-tan', name: 'Alex Tan' },
        { id: 'p-ben-carter', name: 'Ben Carter' },
      ],
    } as unknown as BracketTournamentDTO;
    const result = reconcileBracketRoster(bracket);
    expect(result.map((p) => p.id).sort()).toEqual([
      'p-alex-tan',
      'p-ben-carter',
    ]);
    expect(result.find((p) => p.id === 'p-alex-tan')?.name).toBe('Alex Tan');
  });

  it('flattens TEAM members and dedupes by id', () => {
    const bracket = {
      participants: [
        { id: 'MS-T1', name: 'Alex / Ben', members: ['p-alex', 'p-ben'] },
        { id: 'p-alex', name: 'Alex Tan' },
      ],
    } as unknown as BracketTournamentDTO;
    const result = reconcileBracketRoster(bracket);
    const ids = result.map((p) => p.id);
    expect(ids).toContain('p-alex');
    expect(ids).toContain('p-ben');
    // dedup: p-alex should appear once.
    const seen = new Set(ids);
    expect(seen.size).toBe(ids.length);
    // name resolution: p-alex has a PLAYER entry → must use display name, not slug.
    expect(result.find((p) => p.id === 'p-alex')?.name).toBe('Alex Tan');
  });

  // D3 — the Bracket roster shipped raw slugs ("alexei-sorokin") as player
  // names. A doubles-only draw has NO player participants, so the slug→name
  // lookup was empty and every member fell back to its own id.
  it('reads TEAM member names off the team display name (doubles-only draw)', () => {
    const bracket = {
      participants: [
        {
          id: 'MD-T1',
          name: 'Alexei Sorokin / Ben Carter',
          members: ['p-alexei-sorokin', 'p-ben-carter'],
        },
      ],
    } as unknown as BracketTournamentDTO;
    const byId = new Map(
      reconcileBracketRoster(bracket).map((p) => [p.id, p.name]),
    );
    expect(byId.get('p-alexei-sorokin')).toBe('Alexei Sorokin');
    expect(byId.get('p-ben-carter')).toBe('Ben Carter');
  });

  it('de-slugs members the team name cannot account for', () => {
    const bracket = {
      participants: [
        // Name and members disagree in arity — nothing positional to read.
        {
          id: 'MD-T1',
          name: 'Team One',
          members: ['p-alexei-sorokin', 'p-ben-carter'],
        },
      ],
    } as unknown as BracketTournamentDTO;
    expect(reconcileBracketRoster(bracket).map((p) => p.name)).toEqual([
      'Alexei Sorokin',
      'Ben Carter',
    ]);
  });

  it('returns empty when bracket has no participants', () => {
    const bracket = { participants: [] } as unknown as BracketTournamentDTO;
    expect(reconcileBracketRoster(bracket)).toEqual([]);
  });

  /**
   * SP-DM-3 P6 Task 1 — a PIN ON BEHAVIOUR TASK 2 DELETES, kept only long
   * enough to prove the deletion is deliberate. The zip is positional: it
   * assumes the label's Nth name belongs to `members[N]`. That holds for a
   * seam-built team by pure construction (`entries/entries.py::team_name`
   * takes `members[0], members[1]` in the same order `member_ids` is built),
   * and holds for nothing else — `bracket_participants.name` is operator
   * editable and a hand-added team mints its label from different variables.
   * Delete this case with the decode; do not port it forward.
   */
  it('zips the label onto members POSITIONALLY, right or wrong', () => {
    const bracket = {
      participants: [
        {
          id: 'MD-T1',
          // The label's order is the OPPOSITE of the member order.
          name: 'Ben Carter / Alexei Sorokin',
          members: ['p-alexei-sorokin', 'p-ben-carter'],
        },
      ],
    } as unknown as BracketTournamentDTO;
    const byId = new Map(
      reconcileBracketRoster(bracket).map((p) => [p.id, p.name]),
    );
    // Both names are now on the wrong person, and nothing notices.
    expect(byId.get('p-alexei-sorokin')).toBe('Ben Carter');
    expect(byId.get('p-ben-carter')).toBe('Alexei Sorokin');
  });

  /**
   * SP-DM-3 P6 Task 2 unskips this. A TEAM member no PLAYER participant can
   * name is OMITTED, not guessed — F-DM-19's don't-invent posture. The old
   * behaviour named it by de-slugging (`nameFromSlug`) or by splitting the
   * team label; both are identity read out of a display string, which is
   * what R-DM-7(a) demotes.
   */
  it.skip('omits a TEAM member no participant can name', () => {
    const bracket = {
      participants: [
        {
          id: 'MD-T1',
          name: 'Alexei Sorokin / Ben Carter',
          members: ['p-alexei-sorokin', 'p-ben-carter'],
        },
      ],
    } as unknown as BracketTournamentDTO;
    expect(reconcileBracketRoster(bracket)).toEqual([]);
  });
});

/**
 * V3 — the D3 fix landed in `reconcileBracketRoster` and changed nothing the
 * operator could see, because that function runs ONCE per bracket and its
 * result is persisted. A workspace migrated by the pre-fix build kept its slug
 * names forever: the matches ROW resolves names from the live snapshot and read
 * correctly, while the roster list, the draw participant picker and the match
 * detail panel all read the stored roster and read `cormac-delahunt`.
 */
describe('healBracketRosterNames', () => {
  /** A doubles-only draw: the team display name is the ONLY place the two
   *  members' real names survive. */
  const doublesDraw = {
    participants: [
      {
        id: 'MD1-T1',
        name: 'Cormac Delahunt / Jae Hyun Choi',
        members: ['cormac-delahunt', 'jae-hyun-choi'],
      },
    ],
  } as unknown as BracketTournamentDTO;

  const roster = (...rows: BracketPlayerDTO[]) => rows;

  it('replaces a stored name that is its own slug', () => {
    const stored = roster(
      { id: 'cormac-delahunt', name: 'cormac-delahunt' },
      { id: 'jae-hyun-choi', name: 'jae-hyun-choi' },
    );
    expect(healBracketRosterNames(stored, doublesDraw)).toEqual([
      { id: 'cormac-delahunt', name: 'Cormac Delahunt' },
      { id: 'jae-hyun-choi', name: 'Jae Hyun Choi' },
    ]);
  });

  it('never overwrites a name an operator typed', () => {
    // Same person, renamed by hand after the migration. The id is still the
    // original slug; only `name === id` marks the broken write.
    const stored = roster({ id: 'cormac-delahunt', name: 'C. Delahunt' });
    expect(healBracketRosterNames(stored, doublesDraw)[0].name).toBe(
      'C. Delahunt',
    );
  });

  it('returns the SAME array reference when nothing needs repair', () => {
    // Called on every 2.5s poll — a fresh array would re-render the roster
    // and re-arm the whole-blob autosave forever.
    const stored = roster({ id: 'cormac-delahunt', name: 'Cormac Delahunt' });
    expect(healBracketRosterNames(stored, doublesDraw)).toBe(stored);
  });

  it('leaves a slug-named player the snapshot knows nothing about', () => {
    const stored = roster({ id: 'someone-else', name: 'someone-else' });
    expect(healBracketRosterNames(stored, doublesDraw)).toBe(stored);
  });

  /**
   * SP-DM-3 P6 Task 3 deletes this whole describe. Pinned first so the
   * deletion commit can name what it is giving up: the repair (a) only ever
   * fires on a row whose stored name IS its own id, (b) never overwrites an
   * operator's typing, and (c) returns the same array reference otherwise.
   * (a) is the reason deletion is safe — see Task 3 Step 1, which proves no
   * live write path can produce that row any more.
   */
  it('never fires on a row whose name is not its own id', () => {
    const stored = roster({ id: 'cormac-delahunt', name: 'Cormac Delahunt' });
    expect(healBracketRosterNames(stored, doublesDraw)).toBe(stored);
  });
});
