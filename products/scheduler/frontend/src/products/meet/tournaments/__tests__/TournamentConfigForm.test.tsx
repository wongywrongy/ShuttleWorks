import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TournamentConfigForm } from '../TournamentConfigForm';
import type { TournamentConfig } from '../../../../api/dto';

function baseConfig(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
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
  };
}

function renderForm(config: TournamentConfig, onSave = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/tournaments/t1/setup']}>
      <Routes>
        <Route
          path="/tournaments/:id/setup"
          element={<TournamentConfigForm config={config} onSave={onSave} saving={false} />}
        />
      </Routes>
    </MemoryRouter>,
  );
  return onSave;
}

function save() {
  fireEvent.click(screen.getByRole('button', { name: /save tournament settings/i }));
}

describe('TournamentConfigForm — identity clobber fix', () => {
  it('does NOT render the redundant Tournament name / Date identity inputs', () => {
    renderForm(baseConfig());
    expect(screen.queryByLabelText('Tournament name')).toBeNull();
    expect(screen.queryByLabelText('Tournament date')).toBeNull();
  });

  it('when config carries NO identity, save never emits empty-string name/date (the data-loss bug)', () => {
    // A workspace whose name/date were set at the workspace level: the meet
    // config blob has no tournamentName/tournamentDate. The OLD form coerced
    // these to '' and emitted them, blanking the Hub summary on save.
    const onSave = renderForm(baseConfig());
    save();
    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0] as TournamentConfig;
    // Must be undefined (omitted in JSON → backend skips the mirror), never ''.
    expect(payload.tournamentName).toBeUndefined();
    expect(payload.tournamentDate).toBeUndefined();
    expect(payload.tournamentName).not.toBe('');
    expect(payload.tournamentDate).not.toBe('');
  });

  it('when config DOES carry identity, save passes it through unchanged', () => {
    const onSave = renderForm(
      baseConfig({ tournamentName: 'Autumn Open', tournamentDate: '2026-09-15' }),
    );
    save();
    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0] as TournamentConfig;
    expect(payload.tournamentName).toBe('Autumn Open');
    expect(payload.tournamentDate).toBe('2026-09-15');
  });

  it('preserves non-identity scheduling/scoring fields on save', () => {
    const onSave = renderForm(baseConfig({ courtCount: 7, pointsPerSet: 15 }));
    save();
    const payload = onSave.mock.calls[0][0] as TournamentConfig;
    expect(payload.courtCount).toBe(7);
    expect(payload.pointsPerSet).toBe(15);
    expect(payload.rankCounts).toEqual({ MS: 3, WS: 3, MD: 2, WD: 2, XD: 2 });
  });
});
