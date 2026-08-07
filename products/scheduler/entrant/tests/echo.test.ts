/**
 * The echo — the entrant's typing, surviving a server round trip.
 *
 * Both halves mirror Python: the positional grouping is `parse_players`
 * (`services/entry_form.py`, called by `api/entries_json.py`'s quote and
 * submit alike), and the narrowing is the incumbent's gender filter
 * (`api/entries_public.py:924`) — no constraint or `mixed` matches everyone,
 * an empty gender is nothing to filter ON rather than a mismatch with
 * everything, and an already-ticked event is never hidden.
 *
 * Nothing here computes a fee. `totalCents` is *read* off the query string
 * that `POST /e/api/quote/{slug}` put there; `tests/noClientFeeRules.test.ts`
 * is the standing tripwire on that.
 */
import { describe, expect, it } from 'vitest';

import { narrowEvents, parseEcho } from '../app/lib/echo';
import type { EntryEventDTO } from '../app/lib/entryPage.types';

const MS = '11111111-1111-4111-8111-111111111111';
const WD = '22222222-2222-4222-8222-222222222222';
const XD = '33333333-3333-4333-8333-333333333333';

/** The REAL `EntryEventDTO` (`api/entries_json.py`): the three deadline
 * fields are present and the count is `entryCount`, not the brief's
 * `entered`. */
function event(over: Partial<EntryEventDTO> & Pick<EntryEventDTO, 'id' | 'code'>): EntryEventDTO {
  return {
    discipline: over.code,
    feeCents: 1500,
    genderConstraint: null,
    opensAt: null,
    closesAt: null,
    withdrawsUntil: null,
    isOpen: true,
    ageBracketed: false,
    entryCount: 0,
    ...over,
  };
}

const EVENTS: EntryEventDTO[] = [
  event({ id: MS, code: 'MS', discipline: "Men's Singles", genderConstraint: 'M' }),
  event({ id: WD, code: 'WD', discipline: "Women's Doubles", genderConstraint: 'F' }),
  event({ id: XD, code: 'XD', discipline: 'Mixed Doubles', genderConstraint: 'mixed' }),
];

describe('parseEcho', () => {
  it('groups repeated fields positionally into players', () => {
    const params = new URLSearchParams();
    params.append('playerName', 'Ada Lovelace');
    params.append('gender', 'F');
    params.append('club', 'Kingsway');
    params.append('birthYear', '1990');
    params.append('remarks', 'no Saturdays');
    params.append('playerName', 'Alan Turing');
    params.append('gender', 'M');
    params.append('club', '');
    params.append('birthYear', '');
    params.append('remarks', '');
    params.append('events', `0:${WD}`);
    params.append('events', `1:${MS}`);

    const echo = parseEcho(params);

    expect(echo.players[0]).toEqual({
      name: 'Ada Lovelace',
      gender: 'F',
      club: 'Kingsway',
      birthYear: '1990',
      remarks: 'no Saturdays',
      events: [`0:${WD}`],
    });
    expect(echo.players[1].events).toEqual([`1:${MS}`]);
  });

  it('does not let player 1 claim player 10 events on a prefix match', () => {
    // `startsWith('1:')` also matches `10:` and `11:`. Two blocks ship today,
    // but the parser is positional and the count is a render decision — an
    // index-exact split keeps this true if a third block ever lands.
    const params = new URLSearchParams();
    for (const name of ['a', 'b']) params.append('playerName', name);
    params.append('events', `10:${MS}`);
    params.append('events', `1:${WD}`);

    expect(parseEcho(params).players[1].events).toEqual([`1:${WD}`]);
  });

  it('reads showAllEvents, totalCents and a refusal off the query', () => {
    const echo = parseEcho(
      new URLSearchParams('showAllEvents=on&totalCents=3500&refusal=Too+many+events'),
    );

    expect(echo.showAllEvents).toBe(true);
    expect(echo.totalCents).toBe(3500);
    expect(echo.refusal).toBe('Too many events');
  });

  it('is empty for a first visit', () => {
    const echo = parseEcho(new URLSearchParams(''));

    expect(echo.players).toEqual([]);
    expect(echo.showAllEvents).toBe(false);
    expect(echo.totalCents).toBeNull();
    expect(echo.refusal).toBeNull();
  });

  it('refuses a non-numeric or negative totalCents rather than rendering NaN', () => {
    // The query string is entrant-editable, so this is a trust boundary, not a
    // formatting nicety: `Number('free')` is NaN and `formatCents` would put
    // "NaN" on a page about money.
    expect(parseEcho(new URLSearchParams('totalCents=free')).totalCents).toBeNull();
    expect(parseEcho(new URLSearchParams('totalCents=-1')).totalCents).toBeNull();
    expect(parseEcho(new URLSearchParams('totalCents=1.5')).totalCents).toBeNull();
    expect(parseEcho(new URLSearchParams('totalCents=')).totalCents).toBeNull();
  });
});

describe('narrowEvents', () => {
  it('shows everything when no gender has been chosen', () => {
    expect(narrowEvents(EVENTS, '', [], false)).toHaveLength(3);
  });

  it('hides the mismatched constraint, keeping null and mixed', () => {
    expect(narrowEvents(EVENTS, 'F', [], false).map((e) => e.code)).toEqual(['WD', 'XD']);
  });

  it('never hides an event this player has already ticked', () => {
    expect(narrowEvents(EVENTS, 'F', [`0:${MS}`], false).map((e) => e.code)).toEqual([
      'MS',
      'WD',
      'XD',
    ]);
  });

  it('puts everything back when the override is on', () => {
    expect(narrowEvents(EVENTS, 'F', [], true)).toHaveLength(3);
  });

  it('is presentational only — it never drops an event the server would accept', () => {
    // R12: a gender mismatch is ACCEPTED and flagged for the organiser
    // (`check_policy` decides, Python-side). Narrowing is a default view, so
    // the override must be able to restore every single event.
    expect(narrowEvents(EVENTS, 'M', [], true)).toEqual(EVENTS);
  });
});
