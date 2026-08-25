import { describe, it, expect } from 'vitest';
import { healBracketRosterNames, reconcileBracketRoster } from '../bracketMigration';
import type { BracketTournamentDTO } from '../../../api/bracketDto';
import type { BracketPlayerDTO } from '../../../api/dto';

/**
 * SP-DM-3 P6 (card §C6, R-DM-7(a)): the decode-from-label cases that used to
 * live here were DELETED, not ported — the behaviour they pinned is what the
 * ruling removed. Their pins are in the Task 1 commit (`c96ea959`, placement
 * fixed in `caf96c22`) if the history matters. The one that survives is the
 * positional-zip pin, INVERTED in place: it now pins the omission.
 */
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
        { id: 'p-ben', name: 'Ben Carter' },
      ],
    } as unknown as BracketTournamentDTO;
    const result = reconcileBracketRoster(bracket);
    const ids = result.map((p) => p.id);
    expect(ids).toContain('p-alex');
    expect(ids).toContain('p-ben');
    // dedup: p-alex should appear once.
    const seen = new Set(ids);
    expect(seen.size).toBe(ids.length);
    // name resolution: each member has a PLAYER entry → use its display name.
    expect(result.find((p) => p.id === 'p-alex')?.name).toBe('Alex Tan');
  });

  it('returns empty when bracket has no participants', () => {
    const bracket = { participants: [] } as unknown as BracketTournamentDTO;
    expect(reconcileBracketRoster(bracket)).toEqual([]);
  });

  /**
   * SP-DM-3 P6 Task 2 FLIPPED this pin in place. Task 1 (`c96ea959`,
   * placement fixed in `caf96c22`) pinned the zip as it was: positional and
   * unverified — it assumed the label's Nth name belonged to `members[N]`,
   * so a label ordered the OPPOSITE way put both names on the wrong person
   * and nothing noticed. That property is what R-DM-7(a) removes, so the
   * assertions are now inverted: the same fixture names nobody, because a
   * label is not a person and nothing else here can name these two.
   *
   * The zip held for a seam-built team by pure construction only
   * (`entries/entries.py::team_name` takes `members[0], members[1]` in the
   * order `member_ids` is built) and for nothing else —
   * `bracket_participants.name` is operator editable and a hand-added team
   * mints its label from different variables.
   */
  it('no longer zips the label onto members positionally', () => {
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
    // Nobody is named off the label — not rightly, not wrongly.
    expect(byId.get('p-alexei-sorokin')).toBeUndefined();
    expect(byId.get('p-ben-carter')).toBeUndefined();
  });

  /**
   * SP-DM-3 P6 Task 2 unskips this (pinned as a skip in `c96ea959`, placement
   * fixed in `caf96c22`). A TEAM member no PLAYER participant can name is
   * OMITTED, not guessed — F-DM-19's don't-invent posture. The old behaviour
   * named it by de-slugging its id or by splitting the team label; both are
   * identity read out of a display string, which is what R-DM-7(a) demotes.
   */
  it('omits a TEAM member no participant can name', () => {
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
