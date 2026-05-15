import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useUiStore } from '../../store/uiStore';
import { EventsFilterStrip } from '../../features/bracket/EventsFilterStrip';
import type { BracketTournamentDTO } from '../../api/bracketDto';

// EventsFilterStrip calls useBracket() which internally calls useBracketApi().
// Mock the hook so we don't need a real provider or network.
vi.mock('../../hooks/useBracket', () => ({
  useBracket: () => ({ data: FIXTURE }),
}));

const FIXTURE: BracketTournamentDTO = {
  courts: 4,
  total_slots: 32,
  rest_between_rounds: 1,
  interval_minutes: 30,
  start_time: null,
  participants: [],
  results: [],
  events: [
    {
      id: 'evt-1',
      discipline: 'MS',
      format: 'se',
      bracket_size: 4,
      participant_count: 4,
      rounds: [],
      status: 'generated',
    },
    {
      id: 'evt-2',
      discipline: 'WS',
      format: 'se',
      bracket_size: 4,
      participant_count: 4,
      rounds: [],
      status: 'generated',
    },
  ],
  play_units: [],
  assignments: [],
};

describe('EventsFilterStrip', () => {
  beforeEach(() => {
    useUiStore.setState({ bracketScheduleEventFilter: {} });
  });

  it('renders one button per event', () => {
    render(<EventsFilterStrip />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveTextContent('evt-1');
    expect(buttons[1]).toHaveTextContent('evt-2');
  });

  it('shows EVENTS: label', () => {
    render(<EventsFilterStrip />);
    expect(screen.getByText(/EVENTS:/i)).toBeInTheDocument();
  });

  it('clicking a button toggles event off (writes false to filter)', () => {
    render(<EventsFilterStrip />);
    const [btn1] = screen.getAllByRole('button');
    fireEvent.click(btn1);
    expect(useUiStore.getState().bracketScheduleEventFilter['evt-1']).toBe(false);
  });

  it('clicking an off button toggles it back on (writes true to filter)', () => {
    useUiStore.setState({ bracketScheduleEventFilter: { 'evt-1': false } });
    render(<EventsFilterStrip />);
    const [btn1] = screen.getAllByRole('button');
    fireEvent.click(btn1);
    expect(useUiStore.getState().bracketScheduleEventFilter['evt-1']).toBe(true);
  });

  it('all events render in full style by default (no opacity-50 class)', () => {
    render(<EventsFilterStrip />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => {
      expect(btn.className).not.toContain('opacity-50');
    });
  });

  it('toggled-off button gets opacity-50 class', () => {
    useUiStore.setState({ bracketScheduleEventFilter: { 'evt-1': false } });
    render(<EventsFilterStrip />);
    const [btn1, btn2] = screen.getAllByRole('button');
    expect(btn1.className).toContain('opacity-50');
    expect(btn2.className).not.toContain('opacity-50');
  });
});

// ---- Chip dim tests wired through ScheduleView ----
// Re-use the existing ScheduleView fixture pattern to verify that
// eventFilter=false causes the chip to carry opacity-40.

import { ScheduleView } from '../../features/bracket/ScheduleView';

const SCHED_DATA: BracketTournamentDTO = {
  courts: 4,
  total_slots: 32,
  rest_between_rounds: 1,
  interval_minutes: 30,
  start_time: null,
  participants: [],
  results: [],
  events: [
    {
      id: 'evt-1',
      discipline: 'MS',
      format: 'se',
      bracket_size: 2,
      participant_count: 2,
      rounds: [],
      status: 'generated',
    },
    {
      id: 'evt-2',
      discipline: 'WS',
      format: 'se',
      bracket_size: 2,
      participant_count: 2,
      rounds: [],
      status: 'generated',
    },
  ],
  play_units: [
    {
      id: 'pu-1',
      event_id: 'evt-1',
      round_index: 0,
      match_index: 0,
      side_a: null,
      side_b: null,
      duration_slots: 2,
      dependencies: [],
      slot_a: { participant_id: null, feeder_play_unit_id: null },
      slot_b: { participant_id: null, feeder_play_unit_id: null },
    },
    {
      id: 'pu-2',
      event_id: 'evt-2',
      round_index: 0,
      match_index: 0,
      side_a: null,
      side_b: null,
      duration_slots: 2,
      dependencies: [],
      slot_a: { participant_id: null, feeder_play_unit_id: null },
      slot_b: { participant_id: null, feeder_play_unit_id: null },
    },
  ],
  assignments: [
    {
      play_unit_id: 'pu-1',
      slot_id: 0,
      court_id: 1,
      duration_slots: 2,
      actual_start_slot: null,
      actual_end_slot: null,
      started: false,
      finished: false,
    },
    {
      play_unit_id: 'pu-2',
      slot_id: 2,
      court_id: 2,
      duration_slots: 2,
      actual_start_slot: null,
      actual_end_slot: null,
      started: false,
      finished: false,
    },
  ],
};

describe('ScheduleView event filter dimming', () => {
  beforeEach(() => {
    useUiStore.setState({ bracketScheduleEventFilter: {} });
  });

  it('no chips are dimmed when filter is empty (all on by default)', () => {
    render(<ScheduleView data={SCHED_DATA} />);
    const chip1 = screen.getByText('pu-1').parentElement!;
    const chip2 = screen.getByText('pu-2').parentElement!;
    expect(chip1.className).not.toContain('opacity-40');
    expect(chip2.className).not.toContain('opacity-40');
  });

  it('chip for disabled event gets opacity-40; enabled event chip stays full', () => {
    useUiStore.setState({ bracketScheduleEventFilter: { 'evt-1': false } });
    render(<ScheduleView data={SCHED_DATA} />);
    const chip1 = screen.getByText('pu-1').parentElement!;
    const chip2 = screen.getByText('pu-2').parentElement!;
    expect(chip1.className).toContain('opacity-40');
    expect(chip2.className).not.toContain('opacity-40');
  });
});
