import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BracketScoreEntry } from '../BracketScoreEntry';

describe('<BracketScoreEntry />', () => {
  it('records the derived winner + played-sets JSON', async () => {
    const onRecord = vi.fn();
    render(
      <BracketScoreEntry
        setsToWin={2}
        labelA="Alice"
        labelB="Bob"
        onRecord={onRecord}
      />,
    );
    // Best of 3 → 3 set rows.
    expect(screen.getByLabelText('Set 1 Alice score')).toBeInTheDocument();
    expect(screen.getByLabelText('Set 3 Bob score')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Set 1 Alice score'), { target: { value: '21' } });
    fireEvent.change(screen.getByLabelText('Set 1 Bob score'), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText('Set 2 Alice score'), { target: { value: '21' } });
    fireEvent.change(screen.getByLabelText('Set 2 Bob score'), { target: { value: '15' } });

    fireEvent.click(screen.getByRole('button', { name: /Record result/i }));
    await waitFor(() => expect(onRecord).toHaveBeenCalled());
    expect(onRecord).toHaveBeenCalledWith('A', [
      { sideA: 21, sideB: 18 },
      { sideA: 21, sideB: 15 },
    ]);
  });

  it('keeps Record disabled until a winner is determinable', () => {
    const onRecord = vi.fn();
    render(
      <BracketScoreEntry setsToWin={2} labelA="Alice" labelB="Bob" onRecord={onRecord} />,
    );
    const btn = screen.getByRole('button', { name: /Record result/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    // A one-each split is still undecided.
    fireEvent.change(screen.getByLabelText('Set 1 Alice score'), { target: { value: '21' } });
    fireEvent.change(screen.getByLabelText('Set 1 Bob score'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Set 2 Alice score'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Set 2 Bob score'), { target: { value: '21' } });
    expect(btn.disabled).toBe(true);
  });
});
