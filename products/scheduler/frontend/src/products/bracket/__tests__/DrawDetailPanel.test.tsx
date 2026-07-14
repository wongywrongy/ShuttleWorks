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
  { id: 'p-alex', name: 'Alex Tan' },
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
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getByRole('button', { name: /^Commit$/i }));
    await vi.waitFor(() => expect(onCommitPicks).toHaveBeenCalledTimes(1));
    const picks = onCommitPicks.mock.calls[0][0];
    expect(picks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'p-alex' })]),
    );
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
