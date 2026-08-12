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

// Clock-relative rendering vs. stale actual timestamps (design audit T6).
//
// `getRenderSlot` positions a called/finished match off its wall-clock
// `actualStartTime`. Reopen ANY past tournament's Live tab — a finished event,
// a restored backup, a demo seed — and those timestamps describe a different
// day than the configured one. The derived slot lands far past the day's last
// slot, the axis stretches to absorb it, and every chip is clamped onto the
// final column: hundreds of pixels right of a ~680px viewport, so the chart
// reads as empty/unconfigured with all its matches still in the DOM.
describe('GanttChart with stale actual timestamps', () => {
  // 21:14 on a long-past date. The config's day is 09:00-12:00, so this
  // wall-clock time is ~24 slots into a 6-slot day — outside it either way.
  const STALE_START = '2026-01-25T21:14:00';
  const STALE_END = '2026-01-25T21:49:00';
  const staleStates: Record<string, MatchStateDTO> = Object.fromEntries(
    ['m1', 'm2', 'm3', 'm4'].map((id) => [
      id,
      {
        matchId: id,
        status: 'finished',
        actualStartTime: STALE_START,
        actualEndTime: STALE_END,
      } as MatchStateDTO,
    ]),
  );

  /** The scaffold's sized grid wrapper — `label + slotCount * slotWidth`. */
  const gridWidthPx = (container: HTMLElement) =>
    parseFloat(
      (container.querySelector('.overflow-x-auto > div') as HTMLElement).style.width,
    );

  /** A block's absolutely-positioned wrapper (PositionedBlock). */
  const boxOf = (label: string) => {
    const el = screen.getByRole('button', { name: new RegExp(label) })
      .parentElement as HTMLElement;
    return { left: parseFloat(el.style.left), width: parseFloat(el.style.width) };
  };

  it('keeps the axis inside the configured day instead of stretching past it', () => {
    const { container } = render(
      <GanttChart
        schedule={schedule}
        matches={matches}
        matchStates={staleStates}
        config={config}
        currentSlot={0}
        selectedMatchId={null}
        onMatchSelect={vi.fn()}
      />,
    );
    // 09:00-12:00 at 30-min slots = 6 slots; 56px label column + 80px/slot.
    expect(gridWidthPx(container)).toBeLessThanOrEqual(56 + 6 * 80);
  });

  it('draws every block at its planned slot, inside the visible track', () => {
    const { container } = render(
      <GanttChart
        schedule={schedule}
        matches={matches}
        matchStates={staleStates}
        config={config}
        currentSlot={0}
        selectedMatchId={null}
        onMatchSelect={vi.fn()}
      />,
    );
    const meshWidth = gridWidthPx(container) - 56;
    // m1/m2 are planned at slot 0, m3/m4 at slot 1 → 0px and 80px.
    expect(boxOf('M1').left).toBe(0);
    expect(boxOf('M2').left).toBe(0);
    expect(boxOf('M3').left).toBe(80);
    expect(boxOf('M4').left).toBe(80);
    for (const label of ['M1', 'M2', 'M3', 'M4']) {
      const { left, width } = boxOf(label);
      expect(left + width).toBeLessThanOrEqual(meshWidth);
    }
  });

  it('says the times shown are planned, not actual', () => {
    render(
      <GanttChart
        schedule={schedule}
        matches={matches}
        matchStates={staleStates}
        config={config}
        currentSlot={0}
        selectedMatchId={null}
        onMatchSelect={vi.fn()}
      />,
    );
    expect(screen.getByText(/planned times for 4 matches/i)).toBeInTheDocument();
  });

  it('still positions credible actual timestamps off the clock', () => {
    // 10:30 local on the same day the config describes → slot 3, 1-slot span.
    const onTime: Record<string, MatchStateDTO> = {
      ...matchStates,
      m2: {
        matchId: 'm2',
        status: 'finished',
        actualStartTime: '2026-01-25T10:30:00',
        actualEndTime: '2026-01-25T11:00:00',
      } as MatchStateDTO,
    };
    render(
      <GanttChart
        schedule={schedule}
        matches={matches}
        matchStates={onTime}
        config={config}
        currentSlot={0}
        selectedMatchId={null}
        onMatchSelect={vi.fn()}
      />,
    );
    expect(boxOf('M2').left).toBe(3 * 80);
    expect(screen.queryByText(/planned times for/i)).not.toBeInTheDocument();
  });
});

// A `<div onClick>` with no tabIndex, no role and no key handler is invisible
// to a keyboard operator — WCAG 2.1.1. The sibling Plan Gantt (DragGantt) has
// always rendered its blocks as real `<button>`s, and this file's own
// `renderCourtLabel` Reopen control proves the pattern was known here.
describe('GanttChart keyboard access', () => {
  it('renders each block as a real button, focusable and Enter-activatable', () => {
    const { onMatchSelect } = renderChart();

    const block = screen.getByRole('button', { name: /M2/ });
    block.focus();
    expect(document.activeElement).toBe(block);

    fireEvent.keyDown(block, { key: 'Enter' });
    fireEvent.click(block); // what the browser synthesises for Enter on a button
    expect(onMatchSelect).toHaveBeenCalledWith('m2');
  });
});
