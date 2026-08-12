/**
 * V4 — the legacy Run inspector rendered an "Actions" heading over an empty
 * `div` for a finished match. Every button inside that section is guarded by
 * `status === 'scheduled' | 'called' | 'started'`, so a `finished` match got
 * the heading and nothing under it. A heading that promises controls which do
 * not exist reads as "the buttons failed to load"; the finished match's one
 * control ("Edit score") lives in the Done block above.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MatchDetailsPanel } from '../MatchDetailsPanel';
import type {
  MatchDTO,
  MatchStateDTO,
  ScheduleAssignment,
} from '../../../../api/dto';

vi.mock('../../../../hooks/useCanEdit', () => ({ useCanEdit: () => true }));

const MATCH: MatchDTO = {
  id: 'm1',
  sideA: ['p1'],
  sideB: ['p2'],
  matchType: 'dual',
  eventRank: 'MS1',
  durationSlots: 1,
};

/** The panel renders its "Click a match to see details" empty state without
 *  one, so every case below must carry it or it proves nothing. */
const ASSIGNMENT: ScheduleAssignment = {
  matchId: 'm1',
  slotId: 0,
  courtId: 1,
  durationSlots: 1,
};

const state = (status: MatchStateDTO['status']): MatchStateDTO => ({
  matchId: 'm1',
  status,
});

function renderPanel(status: MatchStateDTO['status']) {
  return render(
    <MatchDetailsPanel
      assignment={ASSIGNMENT}
      match={MATCH}
      matchState={state(status)}
      matches={[MATCH]}
      playerNames={new Map([['p1', 'Kim'], ['p2', 'Novak']])}
      slotToTime={(s) => `S${s}`}
      onUpdateStatus={async () => {}}
    />,
  );
}

const actionsHeading = () => screen.queryByText('Actions');

describe('the legacy match inspector never heads an empty Actions section', () => {
  it('omits the heading entirely for a finished match', () => {
    renderPanel('finished');
    expect(actionsHeading()).toBeNull();
  });

  it.each(['scheduled', 'called', 'started'] as const)(
    'keeps the heading for %s, which has buttons under it',
    (status) => {
      const { container } = renderPanel(status);
      const heading = actionsHeading();
      expect(heading).not.toBeNull();
      // And the promise is kept: the row under the heading holds controls.
      expect(
        heading?.parentElement?.querySelectorAll('button').length ?? 0,
      ).toBeGreaterThan(0);
      expect(container).toBeTruthy();
    },
  );
});
