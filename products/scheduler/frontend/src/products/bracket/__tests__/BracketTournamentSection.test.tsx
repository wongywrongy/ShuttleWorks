/**
 * Tests for BracketTournamentSection — the bracket Setup "Tournament"
 * section, now engine-timing only. Identity (name/date) and the venue
 * fields (courts, slot duration, start/end) were extracted to workspace
 * settings + the Venue & schedule surface; the one field that stays is
 * the bracket-specific "rest between rounds", with onBlur dirty-check
 * writes to tournamentStore.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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

function renderSection() {
  return render(
    <MemoryRouter initialEntries={['/tournaments/t1/bracket-setup']}>
      <Routes>
        <Route
          path="/tournaments/:id/*"
          element={<BracketTournamentSection />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  resetStore();
});

describe('<BracketTournamentSection />', () => {
  it('renders the Rest between rounds field bound to store config', () => {
    renderSection();
    const input = screen.getByLabelText(/Rest between rounds/i) as HTMLInputElement;
    expect(input.value).toBe('1');
  });

  it('no longer renders the extracted identity / venue fields', () => {
    renderSection();
    expect(screen.queryByLabelText(/Tournament name/i)).toBeNull();
    expect(screen.queryByLabelText(/Tournament date/i)).toBeNull();
    expect(screen.queryByLabelText(/Courts/i)).toBeNull();
    expect(screen.queryByLabelText(/Slot duration/i)).toBeNull();
    expect(screen.queryByLabelText(/Start time/i)).toBeNull();
    expect(screen.queryByLabelText(/End time/i)).toBeNull();
  });

  it('links to the workspace venue + settings surfaces', () => {
    renderSection();
    expect(screen.getByRole('link', { name: /Venue & schedule/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /workspace settings/i })).toBeInTheDocument();
  });

  it('writes restBetweenRounds to the store on blur when value changed', () => {
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    renderSection();
    const input = screen.getByLabelText(/Rest between rounds/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.blur(input);
    expect(setConfig).toHaveBeenCalled();
    const lastCall = setConfig.mock.calls[setConfig.mock.calls.length - 1];
    expect((lastCall[0] as { restBetweenRounds?: number }).restBetweenRounds).toBe(3);
  });

  it('does NOT write to the store on blur when value unchanged (dirty-check)', () => {
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    renderSection();
    const input = screen.getByLabelText(/Rest between rounds/i) as HTMLInputElement;
    fireEvent.blur(input);
    expect(setConfig).not.toHaveBeenCalled();
  });

  it('resyncs the rest field when store config changes externally (hydrate / cross-tab)', () => {
    renderSection();
    expect((screen.getByLabelText(/Rest between rounds/i) as HTMLInputElement).value).toBe('1');

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

    expect((screen.getByLabelText(/Rest between rounds/i) as HTMLInputElement).value).toBe('2');
  });
});
