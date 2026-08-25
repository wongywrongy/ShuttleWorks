import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DrawDetailPanel } from '../DrawDetailPanel';
import type { BracketEventDTO } from '../eventUpsertPayload';

const onClose = vi.fn();
const onCommitPicks = vi.fn().mockResolvedValue(undefined);

const ev: BracketEventDTO = {
  id: 'MS',
  discipline: 'MS',
  format: 'se',
  bracket_size: 4,
  participant_count: 1,
  rounds: [],
  status: 'draft',
  participants: [{ id: 'p-alex', name: 'Alex Tan', seed: 1 }],
} as BracketEventDTO;

const players = [
  // Alex came through the entries commit seam and holds a person key;
  // Ben was hand-added and holds none (R-DM-2(a)).
  { id: 'p-alex', name: 'Alex Tan', entryPlayerId: 'ep-alex' },
  { id: 'p-ben', name: 'Ben Carter' },
];

beforeEach(() => {
  onClose.mockReset();
  onCommitPicks.mockClear();
});

describe('DrawDetailPanel', () => {
  it('renders the draw identity header and config summary', () => {
    render(
      <DrawDetailPanel ev={ev} players={players} onClose={onClose} onCommitPicks={onCommitPicks} />,
    );
    const panel = screen.getByTestId('draw-detail-panel');
    expect(within(panel).getByText('MS')).toBeInTheDocument();
    expect(within(panel).getByText(/Single elimination/)).toBeInTheDocument();
    expect(within(panel).getByText('Bracket size')).toBeInTheDocument();
    expect(within(panel).getByText('4')).toBeInTheDocument();
  });

  it('hosts the participant picker and forwards commits', async () => {
    render(
      <DrawDetailPanel ev={ev} players={players} onClose={onClose} onCommitPicks={onCommitPicks} />,
    );
    expect(screen.getByText(/Pick participants/i)).toBeInTheDocument();
    // Options are grouped by initial and sorted: Alex Tan, then Ben Carter.
    fireEvent.click(screen.getByRole('checkbox', { name: /Ben Carter/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Save participants$/i }));
    await vi.waitFor(() => expect(onCommitPicks).toHaveBeenCalledTimes(1));
    const picks = onCommitPicks.mock.calls[0][0];
    expect(picks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'p-alex' }),
        expect.objectContaining({ id: 'p-ben' }),
      ]),
    );
  });

  // R-DM-2(a): the team row the doubles picker synthesizes is a
  // `bracket_participants` row like any other, so it has to carry the
  // nominating player's key — the same half `members[0]` names.
  it('carries the nominating player entryPlayerId onto a synthesized team', async () => {
    const md = { ...ev, id: 'MD', discipline: 'MD' } as BracketEventDTO;
    render(
      <DrawDetailPanel ev={md} players={players} onClose={onClose} onCommitPicks={onCommitPicks} />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /Alex Tan/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Ben Carter/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Save pairs$/i }));
    await vi.waitFor(() => expect(onCommitPicks).toHaveBeenCalledTimes(1));
    expect(onCommitPicks.mock.calls[0][0]).toEqual([
      {
        id: 'MD-T1',
        name: 'Alex Tan / Ben Carter',
        members: ['p-alex', 'p-ben'],
        entryPlayerId: 'ep-alex',
      },
    ]);
  });

  // Commit REPLACES the event's participants. Opening the picker empty meant
  // ticking one name dropped everyone already entered.
  it('opens holding the participants already entered in the draw', () => {
    render(
      <DrawDetailPanel ev={ev} players={players} onClose={onClose} onCommitPicks={onCommitPicks} />,
    );
    expect(screen.getByRole('checkbox', { name: /Alex Tan/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Ben Carter/ })).not.toBeChecked();
    expect(screen.getByText(/Pick participants \(1\)/i)).toBeInTheDocument();
  });

  it('groups the roster by initial so a long list is navigable', () => {
    render(
      <DrawDetailPanel ev={ev} players={players} onClose={onClose} onCommitPicks={onCommitPicks} />,
    );
    const picker = screen.getByTestId('participant-picker');
    expect(within(picker).getByRole('group', { name: 'A' })).toBeInTheDocument();
    expect(within(picker).getByRole('group', { name: 'B' })).toBeInTheDocument();
  });

  it('closes via the panel close button', () => {
    render(
      <DrawDetailPanel ev={ev} players={players} onClose={onClose} onCommitPicks={onCommitPicks} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Close detail/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes via the participant picker\'s own Cancel button', () => {
    render(
      <DrawDetailPanel ev={ev} players={players} onClose={onClose} onCommitPicks={onCommitPicks} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
