import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SetupTab } from '../../features/bracket/SetupTab';
import { useTournamentStore } from '../../store/tournamentStore';

beforeEach(() => {
  useTournamentStore.setState({
    config: {
      intervalMinutes: 30,
      dayStart: '09:00',
      dayEnd: '18:00',
      courtCount: 4,
      restBetweenRounds: 1,
      breaks: [],
      defaultRestMinutes: 0,
      freezeHorizonSlots: 0,
      tournamentName: 'unification-test',
    },
  });
});

describe('SetupTab', () => {
  it('renders the five schedule-and-venue fields with current config values', () => {
    render(<SetupTab />);
    expect((screen.getByLabelText(/Courts/i) as HTMLInputElement).value).toBe('4');
    expect((screen.getByLabelText(/Slot duration/i) as HTMLInputElement).value).toBe('30');
    expect((screen.getByLabelText(/Start time/i) as HTMLInputElement).value).toBe('09:00');
    expect((screen.getByLabelText(/End time/i) as HTMLInputElement).value).toBe('18:00');
    expect((screen.getByLabelText(/Rest between rounds/i) as HTMLInputElement).value).toBe('1');
  });

  it('writes courtCount through setConfig on blur', () => {
    render(<SetupTab />);
    const input = screen.getByLabelText(/Courts/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '6' } });
    fireEvent.blur(input);
    expect(useTournamentStore.getState().config?.courtCount).toBe(6);
  });

  it('writes restBetweenRounds through setConfig on blur', () => {
    render(<SetupTab />);
    const input = screen.getByLabelText(/Rest between rounds/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.blur(input);
    expect(useTournamentStore.getState().config?.restBetweenRounds).toBe(3);
  });
});
