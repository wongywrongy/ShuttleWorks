import { describe, it, expect } from 'vitest';
import { reconcileBracketRoster } from '../bracketMigration';
import { playerSlug } from '../../../lib/playerSlug';
import type { BracketTournamentDTO } from '../../../api/bracketDto';

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

  /**
   * SP-DM-3 P6 Task 3 (Task 2 review rider 3, fixture per the Task 3 review):
   * the PARTIALLY nameable team. Every other case here is all-or-nothing, so a
   * regression moving the omission from per-MEMBER to per-PARTICIPANT — skip
   * the whole team the moment one member is unnameable — would pass all of
   * them.
   *
   * It would pass a naive fixture too. The emitted id SET is invariant under
   * that regression: `playerNames` holds only PLAYER participants, and the
   * `else if` emits every PLAYER participant unconditionally, so any member the
   * team loop can name is already reachable without the team loop. The one
   * observable difference is INSERTION ORDER, and only when a partially
   * nameable TEAM is listed before two or more of its PLAYER participants —
   * which is exactly this fixture's shape. Per-member reaches `p-b` through the
   * team and emits it first; per-participant skips the team entirely and falls
   * back to source order. Verified by making the regression and watching this
   * go red (Task 3 fix report).
   */
  it('keeps the nameable member of a TEAM and omits the other', () => {
    const bracket = {
      participants: [
        { id: 'MD-T1', name: 'B / Somebody', members: ['p-b', 'p-nobody'] },
        { id: 'p-a', name: 'Alex Tan' },
        { id: 'p-b', name: 'Ben Carter' },
      ],
    } as unknown as BracketTournamentDTO;
    // `p-nobody` omitted; `p-b` reached THROUGH the team, so it lands first.
    expect(reconcileBracketRoster(bracket).map((p) => p.id)).toEqual([
      'p-b',
      'p-a',
    ]);
  });
});

/**
 * NC 3 (SP-DM-3 P6, card §C6): removing the repair must not resurrect the
 * defect its comment described (`bracketMigration.ts:8-14` — the BRACKET
 * DEFECT SERIES D3, not debt-log D3; two registers, same number). The repair
 * healed roster rows a pre-fix build had FROZEN as `name === id` — rows whose
 * name had been MINTED out of an id (de-slugged, or zipped off a label).
 * Deleting the repair is safe only if nothing mints such a name any more, so
 * that is what this asserts — on the one writer P6 owns.
 *
 * Minting is the precise property, and it is narrower than "never emits a row
 * whose name equals its id" (Task 3 review, minor 2): `bracketMigration.ts:43`
 * copies a PLAYER participant's name VERBATIM, so a snapshot participant that
 * is already self-named propagates unchanged. That is carrying a name someone
 * else wrote, not inventing one, and it is not what the repair existed to fix.
 *
 * The other three writers are structural: the seam writes `entry-{uuid}` + a
 * person's name, `playerSlug` always prefixes `p-` so a slug never equals the
 * name it came from, and a rename writes what the operator typed.
 */
describe('NC 3 — no surviving path MINTS a name out of an id', () => {
  it('reconcile names a member only from a participant, never from its id', () => {
    const bracket = {
      participants: [
        { id: 'p-alex-tan', name: 'Alex Tan' },
        { id: 'MD-T1', name: 'Alex Tan / Ben Carter', members: ['p-alex-tan', 'p-ben-carter'] },
        // The shape that USED to produce a self-named row: an unnameable
        // member. It is now omitted rather than named after itself.
        { id: 'MD-T2', name: 'Two Others', members: ['p-nobody', 'p-else'] },
      ],
    } as unknown as BracketTournamentDTO;
    const rows = reconcileBracketRoster(bracket);
    expect(rows.some((p) => p.name === p.id)).toBe(false);
    expect(rows.map((p) => p.id)).toEqual(['p-alex-tan']);
  });

  it('the hand-add mint can never produce a self-named row either', () => {
    // `p-alex-tan` is here on purpose: it is the only input a reader would
    // guess round-trips, and it does not — it slugs to `p-p-alex-tan`.
    for (const name of ['Alex Tan', "O'Brien", 'p-alex-tan', 'Li Wei']) {
      expect(playerSlug(name)).not.toBe(name);
    }
  });
});

/**
 * `healBracketRosterNames` was DELETED by SP-DM-3 P6 (card §C6, R-DM-7(a)):
 * "the `p.name === p.id` repair is deleted, not fixed". Its cases went with
 * it — they pinned the behaviour the ruling removed. What replaces them is
 * the "NC 3" describe above, which asserts no surviving path can write the
 * row the repair existed to heal.
 */
