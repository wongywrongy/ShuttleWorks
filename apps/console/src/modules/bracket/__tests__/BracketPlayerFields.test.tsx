import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BracketEventsField } from '../BracketPlayerFields';
import type { BracketTournamentDTO } from '../../../api/bracketDto';
import type { BracketPlayerDTO } from '../../../api/dto';

/** Minimal snapshot: only the fields the events field reads. */
const bracketData = {
  events: [
    { id: 'MS', discipline: 'MS', format: 'se', participants: [] },
    { id: 'XD', discipline: 'XD', format: 'se', participants: [] },
  ],
} as unknown as BracketTournamentDTO;

const ana: BracketPlayerDTO = {
  id: 'p-ana',
  name: 'Ana',
  entryPlayerId: 'ep-ana',
};
const bruno: BracketPlayerDTO = {
  id: 'p-bruno',
  name: 'Bruno',
  entryPlayerId: 'ep-bruno',
};

/** Renders the field with the given category already expanded by click. */
const open = (category: string, onCommitEvent: ReturnType<typeof vi.fn>) => {
  render(
    <BracketEventsField
      player={ana}
      roster={[ana, bruno]}
      bracketData={bracketData}
      badges={[]}
      onCommitEvent={onCommitEvent}
    />,
  );
  fireEvent.click(screen.getByTestId(`events-category-${category}`));
};

describe('BracketEventsField — manual roster assignment keeps the person key', () => {
  it('carries entryPlayerId when a singles toggle appends the player', async () => {
    // R-DM-2(a): the roster player holds the key, so an append that drops
    // it writes a NULL-keyed `bracket_participants` row for somebody the
    // seam already identified.
    const onCommitEvent = vi.fn().mockResolvedValue(undefined);
    open('singles', onCommitEvent);

    // `commit` is async; flushing it inside act keeps the state updates
    // it makes on settle out of the test's console.
    await act(async () => {
      fireEvent.click(screen.getByTestId('event-toggle-MS'));
    });

    expect(onCommitEvent).toHaveBeenCalledTimes(1);
    expect(onCommitEvent.mock.calls[0][1].participants).toEqual([
      { id: 'p-ana', name: 'Ana', entryPlayerId: 'ep-ana' },
    ]);
  });

  it('carries the nominating player entryPlayerId onto a confirmed pair', async () => {
    const onCommitEvent = vi.fn().mockResolvedValue(undefined);
    open('mixed', onCommitEvent);

    fireEvent.click(screen.getByTestId('event-toggle-XD'));
    fireEvent.change(screen.getByTestId('partner-select-XD'), {
      target: { value: 'p-bruno' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('partner-confirm-XD'));
    });

    expect(onCommitEvent).toHaveBeenCalledTimes(1);
    expect(onCommitEvent.mock.calls[0][1].participants).toEqual([
      {
        id: 'XD-T1',
        name: 'Ana / Bruno',
        members: ['p-ana', 'p-bruno'],
        entryPlayerId: 'ep-ana',
      },
    ]);
  });

  it('omits entryPlayerId for a roster player that has no person key', async () => {
    // A hand-added roster player: absent, never a fabricated string —
    // `ParticipantIn` rejects a key with no `entry_players` row behind it.
    const onCommitEvent = vi.fn().mockResolvedValue(undefined);
    render(
      <BracketEventsField
        player={{ id: 'p-cleo', name: 'Cleo' }}
        roster={[{ id: 'p-cleo', name: 'Cleo' }]}
        bracketData={bracketData}
        badges={[]}
        onCommitEvent={onCommitEvent}
      />,
    );
    fireEvent.click(screen.getByTestId('events-category-singles'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('event-toggle-MS'));
    });

    expect(onCommitEvent.mock.calls[0][1].participants).toEqual([
      { id: 'p-cleo', name: 'Cleo' },
    ]);
  });
});
