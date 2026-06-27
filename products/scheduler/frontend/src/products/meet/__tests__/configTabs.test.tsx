/**
 * SP-E4 — Meet Configuration is two tabs: Engine and Meet.
 *
 * Engine tab = the CP-SAT input surface: the shared scoring field set
 * (score type / points / match format / deuce) + rest, with the solver
 * knobs below. Meet tab = meet type + lineup position counts (rankCounts);
 * the player-assignment grid stays in Roster.
 *
 * These render the real `TournamentSetupPage`; `useTournament` reads the
 * Zustand store directly (no network), so seeding the store is enough.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TournamentSetupPage } from '../TournamentSetupPage';
import { useTournamentStore } from '../../../store/tournamentStore';
import type { TournamentConfig } from '../../../api/dto';

function seed(overrides: Partial<TournamentConfig> = {}) {
  useTournamentStore.setState({
    config: {
      intervalMinutes: 30,
      dayStart: '09:00',
      dayEnd: '18:00',
      breaks: [],
      courtCount: 4,
      defaultRestMinutes: 30,
      freezeHorizonSlots: 0,
      rankCounts: { MS: 3, WS: 3, MD: 2, WD: 2, XD: 2 },
      scoringFormat: 'badminton',
      setsToWin: 2,
      pointsPerSet: 21,
      deuceEnabled: true,
      meetMode: 'dual',
      ...overrides,
    },
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/tournaments/t1/setup']}>
      <Routes>
        <Route path="/tournaments/:id/*" element={<TournamentSetupPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  seed();
});

describe('Meet Configuration — two tabs', () => {
  it('renders exactly two tabs: Engine and Meet', () => {
    renderPage();
    const seg = screen.getByRole('radiogroup', { name: /Configuration section/i });
    expect(seg).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Engine' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Meet' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Tournament' })).toBeNull();
  });

  it('Engine tab shows the scoring field set + rest', () => {
    renderPage(); // Engine is the default section.
    expect(screen.getByLabelText('Score type')).toBeInTheDocument();
    expect(screen.getByLabelText('Points per set')).toBeInTheDocument();
    expect(screen.getByLabelText('Match format')).toBeInTheDocument();
    expect(screen.getByLabelText('Deuce enabled')).toBeInTheDocument();
    expect(screen.getByLabelText('Rest between matches')).toBeInTheDocument();
  });

  it('Meet tab shows meet type + per-discipline position counts', () => {
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: 'Meet' }));
    expect(screen.getByLabelText('Meet type')).toBeInTheDocument();
    expect(screen.getByLabelText("Men's singles positions")).toBeInTheDocument();
    expect(screen.getByLabelText("Women's singles positions")).toBeInTheDocument();
    expect(screen.getByLabelText("Men's doubles positions")).toBeInTheDocument();
    expect(screen.getByLabelText("Women's doubles positions")).toBeInTheDocument();
    expect(screen.getByLabelText('Mixed doubles positions')).toBeInTheDocument();
  });

  it('changing a position count then saving persists the new rankCounts', async () => {
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: 'Meet' }));
    const ms = screen.getByLabelText("Men's singles positions") as HTMLInputElement;
    fireEvent.change(ms, { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('config-save'));
    await waitFor(() => expect(setConfig).toHaveBeenCalled());
    const last = setConfig.mock.calls[setConfig.mock.calls.length - 1][0] as TournamentConfig;
    expect(last.rankCounts?.MS).toBe(5);
  });

  it('Meet tab save never blanks identity that lives at the workspace level', async () => {
    seed({ tournamentName: undefined, tournamentDate: undefined });
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: 'Meet' }));
    fireEvent.click(screen.getByTestId('config-save'));
    await waitFor(() => expect(setConfig).toHaveBeenCalled());
    const last = setConfig.mock.calls[setConfig.mock.calls.length - 1][0] as TournamentConfig;
    expect(last.tournamentName).toBeUndefined();
    expect(last.tournamentName).not.toBe('');
    expect(last.tournamentDate).toBeUndefined();
  });
});
