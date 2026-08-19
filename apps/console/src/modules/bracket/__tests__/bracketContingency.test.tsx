/**
 * Contingency actions (walkover / retired / forfeit) on the bracket match
 * detail panel — the operator-facing half of the command-path seam whose
 * backend contract landed separately (reason on record_result, ResultDTO
 * carries `reason?`). Pins:
 *  - the three contingency choices render for an actionable (non-done) match
 *  - the section is hidden entirely once a result is recorded (`done`)
 *  - picking a kind then a side is a two-click arm (window.confirm is banned)
 *    that calls back with (reason, winner) only on the second click.
 *
 * Fixtures mirror BracketMatchDetailPanel.test.tsx's PU_MS + makeData().
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  BracketMatchDetailPanel,
  type ContingencyReason,
} from '../BracketMatchDetailPanel';
import { EYEBROW_CLASS } from '../../../lib/utils';
import type { BracketTournamentDTO, PlayUnitDTO } from '../../../api/bracketDto';
import type { BracketMatchStatus } from '../../../components/control-plane';

const slot = (participant_id: string | null = null) => ({
  participant_id,
  feeder_play_unit_id: null,
});

const PU_MS: PlayUnitDTO = {
  id: 'pu-ms', event_id: 'MS', round_index: 0, match_index: 0,
  side_a: ['p-aiko-tan'], side_b: ['p-ben-cruz'], duration_slots: 1,
  dependencies: [], slot_a: slot('p-aiko-tan'), slot_b: slot('p-ben-cruz'),
};

function makeData(): BracketTournamentDTO {
  return {
    courts: 2,
    total_slots: 8,
    rest_between_rounds: 1,
    interval_minutes: 30,
    start_time: null,
    events: [
      {
        id: 'MS', discipline: 'MS', format: 'se', bracket_size: 4,
        participant_count: 2, rounds: [], status: 'generated', config: {},
        participants: [
          { id: 'p-aiko-tan', name: 'Aiko Tan' },
          { id: 'p-ben-cruz', name: 'Ben Cruz' },
        ],
      },
    ],
    participants: [
      { id: 'p-aiko-tan', name: 'Aiko Tan' },
      { id: 'p-ben-cruz', name: 'Ben Cruz' },
    ],
    play_units: [PU_MS],
    assignments: [],
    results: [],
  };
}

const LABELS = new Map([['pu-ms', 'MS SF1']]);

function panelWith({
  status,
  onRecordContingency,
}: {
  status: BracketMatchStatus;
  onRecordContingency: ((reason: ContingencyReason, winner: 'A' | 'B') => void) | null;
}) {
  return (
    <BracketMatchDetailPanel
      pu={PU_MS}
      data={makeData()}
      label={LABELS.get(PU_MS.id) ?? PU_MS.id}
      status={status}
      labelById={LABELS}
      onClose={() => {}}
      onCommitEvent={null}
      onRecordContingency={onRecordContingency}
    />
  );
}

describe('bracket contingency actions', () => {
  it('renders the three contingency choices for a non-done match', () => {
    render(panelWith({ status: 'ready', onRecordContingency: vi.fn() }));
    expect(screen.getByTestId('contingency-walkover')).toBeInTheDocument();
    expect(screen.getByTestId('contingency-retired')).toBeInTheDocument();
    expect(screen.getByTestId('contingency-forfeit')).toBeInTheDocument();
  });

  it('hides contingency entirely for a done match', () => {
    render(panelWith({ status: 'done', onRecordContingency: vi.fn() }));
    expect(screen.queryByTestId('contingency-walkover')).toBeNull();
  });

  it('hides contingency entirely when the caller has no mutation permission (onRecordContingency absent)', () => {
    render(panelWith({ status: 'ready', onRecordContingency: null }));
    expect(screen.queryByTestId('contingency-walkover')).toBeNull();
  });

  it('two-click arms, then records with kind + winner', () => {
    const onRecord = vi.fn();
    render(panelWith({ status: 'ready', onRecordContingency: onRecord }));
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
    render(panelWith({ status: 'ready', onRecordContingency: vi.fn() }));
    expect(screen.queryByTestId('contingency-advance-A')).toBeNull();
    expect(screen.queryByTestId('contingency-advance-B')).toBeNull();
  });

  // B1 — the three kinds sit ~8px apart in one row. A stray click on any of
  // them must be recoverable: picking a kind only reveals the armed advance
  // buttons, it never writes a result. (The audit read this row as three
  // buttons that each record; pinning it here so it can never become that.)
  it('records NOTHING when a contingency kind is clicked', () => {
    const onRecord = vi.fn();
    render(panelWith({ status: 'ready', onRecordContingency: onRecord }));
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
    render(panelWith({ status: 'ready', onRecordContingency: vi.fn() }));
    const button = screen.getByTestId('contingency-walkover');
    expect(button.className).not.toContain('${');
    for (const cls of EYEBROW_CLASS.split(' ')) {
      expect(button).toHaveClass(cls);
    }
  });

  it('switching kind resets any armed side', () => {
    const onRecord = vi.fn();
    render(panelWith({ status: 'ready', onRecordContingency: onRecord }));
    fireEvent.click(screen.getByTestId('contingency-walkover'));
    fireEvent.click(screen.getByTestId('contingency-advance-A')); // arm A
    fireEvent.click(screen.getByTestId('contingency-retired')); // switch kind
    fireEvent.click(screen.getByTestId('contingency-advance-A')); // would confirm if still armed
    expect(onRecord).not.toHaveBeenCalled();
  });
});
