/**
 * Tests for BracketEngineSection — the bracket Configuration "Engine" tab.
 *
 * Surfaces the shared scoring field set (score type / points / format /
 * deuce) plus the bracket-specific rest between rounds. Identity and venue
 * fields stay extracted to workspace settings / Venue & schedule. Scoring
 * writes through `setConfig` immediately; the rest field writes on blur
 * with a dirty-check.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { BracketEngineSection } from '../BracketEngineSection';
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
      scoringFormat: 'simple',
      setsToWin: 2,
      pointsPerSet: 21,
      deuceEnabled: true,
      tournamentName: 'Bracket A',
      tournamentDate: '2026-05-15',
    },
  });
}

function renderSection() {
  return render(
    <MemoryRouter initialEntries={['/tournaments/t1/bracket-setup']}>
      <Routes>
        <Route path="/tournaments/:id/*" element={<BracketEngineSection />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  resetStore();
});

describe('<BracketEngineSection />', () => {
  it('renders the shared scoring field set', () => {
    renderSection();
    expect(screen.getByLabelText('Score type')).toBeInTheDocument();
    expect(screen.getByLabelText('Points per set')).toBeInTheDocument();
    expect(screen.getByLabelText('Match format')).toBeInTheDocument();
    expect(screen.getByLabelText('Deuce enabled')).toBeInTheDocument();
  });

  it('renders the Rest between rounds field bound to store config', () => {
    renderSection();
    const input = screen.getByLabelText(/Rest between rounds/i) as HTMLInputElement;
    expect(input.value).toBe('1');
  });

  it('no longer renders the extracted identity / venue fields', () => {
    renderSection();
    expect(screen.queryByLabelText(/Tournament name/i)).toBeNull();
    expect(screen.queryByLabelText(/^Courts$/i)).toBeNull();
    expect(screen.queryByLabelText(/Slot duration/i)).toBeNull();
  });

  it('links to the workspace venue surface', () => {
    renderSection();
    expect(screen.getByRole('link', { name: /Venue & schedule/i })).toBeInTheDocument();
  });

  it('writes scoringFormat to the store when toggling score type to Sets', () => {
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    renderSection();
    fireEvent.click(screen.getByRole('radio', { name: 'Sets' }));
    expect(setConfig).toHaveBeenCalled();
    const last = setConfig.mock.calls[setConfig.mock.calls.length - 1][0];
    expect(last.scoringFormat).toBe('badminton');
  });

  it('writes restBetweenRounds to the store on blur when value changed', () => {
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    renderSection();
    const input = screen.getByLabelText(/Rest between rounds/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.blur(input);
    expect(setConfig).toHaveBeenCalled();
    const last = setConfig.mock.calls[setConfig.mock.calls.length - 1];
    expect((last[0] as { restBetweenRounds?: number }).restBetweenRounds).toBe(3);
  });

  it('does NOT write to the store on blur when value unchanged (dirty-check)', () => {
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    renderSection();
    const input = screen.getByLabelText(/Rest between rounds/i) as HTMLInputElement;
    fireEvent.blur(input);
    expect(setConfig).not.toHaveBeenCalled();
  });

  it('resyncs the rest field when store config changes externally', () => {
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
