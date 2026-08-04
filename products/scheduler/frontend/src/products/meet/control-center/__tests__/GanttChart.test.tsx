import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GanttChart } from '../GanttChart';
import type {
  ScheduleDTO,
  MatchDTO,
  MatchStateDTO,
  TournamentConfig,
} from '../../../../api/dto';
import type { TrafficLightResult } from '../../../../utils/trafficLight';

const config: TournamentConfig = {
  courtCount: 2,
  intervalMinutes: 30,
  dayStart: '09:00',
  dayEnd: '12:00',
  breaks: [],
  defaultRestMinutes: 30,
  freezeHorizonSlots: 0,
} as unknown as TournamentConfig;

const matches: MatchDTO[] = [
  { id: 'm1', matchNumber: 1, sideA: [], sideB: [], durationSlots: 1 },
  { id: 'm2', matchNumber: 2, sideA: [], sideB: [], durationSlots: 1 },
  { id: 'm3', matchNumber: 3, sideA: [], sideB: [], durationSlots: 1 },
  { id: 'm4', matchNumber: 4, sideA: [], sideB: [], durationSlots: 1 },
];

const schedule: ScheduleDTO = {
  assignments: [
    { matchId: 'm1', slotId: 0, courtId: 1, durationSlots: 1 },
    { matchId: 'm2', slotId: 0, courtId: 2, durationSlots: 1 },
    { matchId: 'm3', slotId: 1, courtId: 1, durationSlots: 1 },
    { matchId: 'm4', slotId: 1, courtId: 2, durationSlots: 1 },
  ],
  status: 'optimal',
} as unknown as ScheduleDTO;

// m1 called (+late at slot 3), m2 started, m3 postponed, m4 scheduled+blocked.
const matchStates: Record<string, MatchStateDTO> = {
  m1: { matchId: 'm1', status: 'called' },
  m2: { matchId: 'm2', status: 'started' },
  m3: { matchId: 'm3', status: 'scheduled', postponed: true },
  m4: { matchId: 'm4', status: 'scheduled' },
};

const trafficLights = new Map<string, TrafficLightResult>([
  ['m4', { status: 'red', reason: 'player conflict' } as unknown as TrafficLightResult],
]);

function renderChart(overrides: Partial<React.ComponentProps<typeof GanttChart>> = {}) {
  const onMatchSelect = vi.fn();
  render(
    <GanttChart
      schedule={schedule}
      matches={matches}
      matchStates={matchStates}
      config={config}
      currentSlot={3}
      selectedMatchId={null}
      onMatchSelect={onMatchSelect}
      impactedMatchIds={['m3']}
      trafficLights={trafficLights}
      {...overrides}
    />,
  );
  return { onMatchSelect };
}

describe('GanttChart intensity encoding', () => {
  it('renders every block by its lifecycle without throwing', () => {
    renderChart();
    for (const label of ['M1', 'M2', 'M3', 'M4']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('selecting a block calls onMatchSelect', () => {
    const { onMatchSelect } = renderChart();
    fireEvent.click(screen.getByText('M2'));
    expect(onMatchSelect).toHaveBeenCalledWith('m2');
  });

  it('exposes a "?" key that opens the lifecycle legend on demand', () => {
    renderChart();
    // Legend is not a permanent strip anymore.
    expect(screen.queryByText('Lifecycle')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /timeline key/i }));
    expect(screen.getByText('Lifecycle')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText(/impacted by a pending fix/i)).toBeInTheDocument();
  });

  it('carries the exception in the rich block tooltip (late + postponed)', () => {
    renderChart();
    // m1 is called at slot 0 with currentSlot 3 → late by 3×30 = 90m.
    expect(screen.getByText('M1').closest('[title]')?.getAttribute('title')).toMatch(/90m late/);
    expect(screen.getByText('M3').closest('[title]')?.getAttribute('title')).toMatch(/postponed/);
  });
});
