/**
 * F-UNI-12/F-UNI-17: contingency actions (walkover / retired / forfeit) in
 * Bracket's caller-supplied controls — the operator-facing command-path seam whose
 * backend contract landed separately (reason on record_result, ResultDTO
 * carries `reason?`). Pins:
 *  - picking a kind then a side is a two-click arm (window.confirm is banned)
 *    that calls back with (reason, winner) only on the second click.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  BracketMatchContingencyControls,
  type ContingencyReason,
} from '../BracketMatchControls';
import { EYEBROW_CLASS } from '../../../lib/utils';

function controlsWith(onRecord: (reason: ContingencyReason, winner: 'A' | 'B') => void) {
  return (
    <BracketMatchContingencyControls
      sideALabel="Aiko Tan"
      sideBLabel="Ben Cruz"
      initial={null}
      onRecord={onRecord}
    />
  );
}

describe('bracket contingency actions', () => {
  it('renders the three contingency choices for a non-done match', () => {
    render(controlsWith(vi.fn()));
    expect(screen.getByTestId('contingency-walkover')).toBeInTheDocument();
    expect(screen.getByTestId('contingency-retired')).toBeInTheDocument();
    expect(screen.getByTestId('contingency-forfeit')).toBeInTheDocument();
  });

  it('two-click arms, then records with kind + winner', () => {
    const onRecord = vi.fn();
    render(controlsWith(onRecord));
    fireEvent.click(screen.getByTestId('contingency-walkover'));
    const advanceA = screen.getByTestId('contingency-advance-A');
    fireEvent.click(advanceA); // arm
    expect(onRecord).not.toHaveBeenCalled();
    fireEvent.click(advanceA); // confirm
    expect(onRecord).toHaveBeenCalledWith(
      'walkover' satisfies ContingencyReason,
      'A',
    );
  });

  it('does not arm a side before a contingency kind is picked (no advance buttons yet)', () => {
    render(controlsWith(vi.fn()));
    expect(screen.queryByTestId('contingency-advance-A')).toBeNull();
    expect(screen.queryByTestId('contingency-advance-B')).toBeNull();
  });

  // B1 — the three kinds sit ~8px apart in one row. A stray click on any of
  // them must be recoverable: picking a kind only reveals the armed advance
  // buttons, it never writes a result. (The audit read this row as three
  // buttons that each record; pinning it here so it can never become that.)
  it('records NOTHING when a contingency kind is clicked', () => {
    const onRecord = vi.fn();
    render(controlsWith(onRecord));
    for (const kind of ['walkover', 'retired', 'forfeit'] as const) {
      fireEvent.click(screen.getByTestId(`contingency-${kind}`));
      expect(onRecord).not.toHaveBeenCalled();
    }
    // Even the armed second stage needs two presses of the SAME button.
    fireEvent.click(screen.getByTestId('contingency-advance-A'));
    expect(onRecord).not.toHaveBeenCalled();
  });

  // D2 — the kind buttons carried
  //   'rounded-sm border px-2 py-0.5 ${EYEBROW_CLASS}'
  // in SINGLE quotes inside a join(' '), so the literal characters
  // "${EYEBROW_CLASS}" shipped as a className and the row rendered with none
  // of its intended typography.
  it('interpolates the eyebrow class instead of shipping the literal', () => {
    render(controlsWith(vi.fn()));
    const button = screen.getByTestId('contingency-walkover');
    expect(button.className).not.toContain('${');
    for (const cls of EYEBROW_CLASS.split(' ')) {
      expect(button).toHaveClass(cls);
    }
  });

  it('switching kind resets any armed side', () => {
    const onRecord = vi.fn();
    render(controlsWith(onRecord));
    fireEvent.click(screen.getByTestId('contingency-walkover'));
    fireEvent.click(screen.getByTestId('contingency-advance-A')); // arm A
    fireEvent.click(screen.getByTestId('contingency-retired')); // switch kind
    fireEvent.click(screen.getByTestId('contingency-advance-A')); // would confirm if still armed
    expect(onRecord).not.toHaveBeenCalled();
  });
});
