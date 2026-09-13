import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CourtsView } from '../CourtsView';
import type { MatchDTO, TournamentConfig } from '../../../../api/dto';

/**
 * D7: every rendered match states its event. The court number, the partner
 * grouping and the scores keep their priority — the event is one muted line
 * of context, never a decorative pill.
 */
const config = {
  intervalMinutes: 30,
  dayStart: '09:00',
  dayEnd: '18:00',
  breaks: [],
  courtCount: 2,
  defaultRestMinutes: 0,
  freezeHorizonSlots: 0,
} as TournamentConfig;

const match = {
  id: 'm1',
  sideA: ['p1'],
  sideB: ['p2'],
  eventCode: 'MD2',
  durationSlots: 1,
} as MatchDTO;

const playerNames = new Map([
  ['p1', 'Alice'],
  ['p2', 'Bob'],
]);

function renderCourts(displayMode: 'auto' | 'list') {
  return render(
    <CourtsView
      courts={[{ courtId: 1, match, state: null, status: 'active' }]}
      config={config}
      now={new Date('2026-01-01T10:00:00Z')}
      displayMode={displayMode}
      gridColsClass="grid-cols-1"
      cardHeightPx={240}
      cardPadX="px-4"
      tvShowScores
      showNext={false}
      isFullscreen={false}
      playerNames={playerNames}
    />,
  );
}

describe('CourtsView event identity', () => {
  it('expands the stored event code on a card', () => {
    renderCourts('auto');
    expect(screen.getByTestId('court-event-1').textContent).toBe("Men's Doubles 2");
  });

  it('expands the stored event code on a list row', () => {
    renderCourts('list');
    expect(screen.getByTestId('court-event-1').textContent).toBe("Men's Doubles 2");
  });
});
