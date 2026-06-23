/**
 * Tests for BracketTournamentSection — the refactored bracket Setup form
 * that lives inside the SettingsShell's "Tournament" section.
 *
 * Same persist semantics as the prior SetupTab (controlled draft,
 * onBlur dirty-check writes to tournamentStore); only the chrome
 * changed (SectionHeader + Row + meet input primitives in place of
 * hand-rolled <h2> + <Field> + raw <input>).
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BracketTournamentSection } from '../BracketTournamentSection';
import { useTournamentStore } from '../../../store/tournamentStore';

function resetStore() {
  useTournamentStore.setState({
    config: {
      intervalMinutes: 30,
      dayStart: '09:00',
      dayEnd: '18:00',
      breaks: [],
      courtCount: 4,
      defaultRestMinutes: 0,
      freezeHorizonSlots: 0,
      restBetweenRounds: 1,
      tournamentName: 'Bracket A',
      tournamentDate: '2026-05-15',
    },
  });
}

beforeEach(() => {
  resetStore();
});

describe('<BracketTournamentSection />', () => {
  it('renders the Tournament name field bound to store config', () => {
    render(<BracketTournamentSection />);
    const input = screen.getByLabelText(/Tournament name/i) as HTMLInputElement;
    expect(input.value).toBe('Bracket A');
  });

  it('renders the Tournament date field bound to store config', () => {
    render(<BracketTournamentSection />);
    const input = screen.getByLabelText(/Tournament date/i) as HTMLInputElement;
    expect(input.value).toBe('2026-05-15');
  });

  it('renders Courts, Slot duration, Start time, End time, Rest between rounds', () => {
    render(<BracketTournamentSection />);
    expect(screen.getByLabelText(/Courts/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Slot duration/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Start time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/End time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Rest between rounds/i)).toBeInTheDocument();
  });

  it('writes Tournament name to the store on blur when value changed', () => {
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    render(<BracketTournamentSection />);
    const input = screen.getByLabelText(/Tournament name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Renamed Bracket' } });
    fireEvent.blur(input);
    expect(setConfig).toHaveBeenCalled();
    const lastCall = setConfig.mock.calls[setConfig.mock.calls.length - 1];
    expect((lastCall[0] as { tournamentName?: string }).tournamentName).toBe('Renamed Bracket');
  });

  it('does NOT write to the store on blur when value unchanged (dirty-check)', () => {
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    render(<BracketTournamentSection />);
    const input = screen.getByLabelText(/Tournament name/i) as HTMLInputElement;
    fireEvent.blur(input);
    expect(setConfig).not.toHaveBeenCalled();
  });

  it('renders Identity + Schedule & venue section headers', () => {
    render(<BracketTournamentSection />);
    expect(screen.getByText(/^Identity$/i)).toBeInTheDocument();
    expect(screen.getByText(/Schedule.*venue/i)).toBeInTheDocument();
  });

  it('resyncs input values when store config changes externally (hydrate / cross-tab)', () => {
    render(<BracketTournamentSection />);
    // Initially shows the setup from beforeEach (name = 'Bracket A', courts = 4).
    expect((screen.getByLabelText(/Tournament name/i) as HTMLInputElement).value).toBe('Bracket A');
    expect((screen.getByLabelText(/Courts/i) as HTMLInputElement).value).toBe('4');

    // Simulate an external config update (hydration from server, another tab pushing state).
    act(() => {
      useTournamentStore.setState({
        config: {
          intervalMinutes: 45,
          dayStart: '08:00',
          dayEnd: '20:00',
          courtCount: 8,
          restBetweenRounds: 2,
          breaks: [],
          defaultRestMinutes: 0,
          freezeHorizonSlots: 0,
          tournamentName: 'Externally Updated Name',
          tournamentDate: '2026-09-01',
        },
      });
    });

    // Controlled inputs must reflect the new config — not stale defaultValue.
    expect((screen.getByLabelText(/Tournament name/i) as HTMLInputElement).value).toBe('Externally Updated Name');
    expect((screen.getByLabelText(/Courts/i) as HTMLInputElement).value).toBe('8');
    expect((screen.getByLabelText(/Slot duration/i) as HTMLInputElement).value).toBe('45');
    expect((screen.getByLabelText(/Start time/i) as HTMLInputElement).value).toBe('08:00');
    expect((screen.getByLabelText(/End time/i) as HTMLInputElement).value).toBe('20:00');
    expect((screen.getByLabelText(/Rest between rounds/i) as HTMLInputElement).value).toBe('2');
  });
});
