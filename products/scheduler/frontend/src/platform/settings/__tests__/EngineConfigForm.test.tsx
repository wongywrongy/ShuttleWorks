/**
 * Tests for the shared EngineConfigForm — rendered by both Meet and
 * Bracket's Engine config tabs (Task 7/8 wire them up; this pins the
 * shared contract in isolation).
 *
 * Covers: schema-driven module applicability (engineFieldAppliesTo +
 * rendered output), the four shared groups rendering identically for
 * both modules, guardSave gating the submit (lock-guard abort path),
 * and save spreading the full config so unrelated fields survive.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import {
  EngineConfigForm,
  ENGINE_CONFIG_FIELDS,
  engineFieldAppliesTo,
} from '../EngineConfigForm';
import { useTournamentStore } from '../../../store/tournamentStore';
import type { TournamentConfig } from '../../../api/dto';

const baseConfig: TournamentConfig = {
  intervalMinutes: 30,
  dayStart: '09:00',
  dayEnd: '18:00',
  breaks: [],
  courtCount: 4,
  defaultRestMinutes: 30,
  freezeHorizonSlots: 0,
  restBetweenRounds: 1,
  scoringFormat: 'badminton',
  setsToWin: 2,
  pointsPerSet: 21,
  deuceEnabled: true,
  deterministic: false,
  solverTimeLimitSeconds: 30,
  enableCourtUtilization: true,
  courtUtilizationPenalty: 50,
  enableGameProximity: false,
  enableCompactSchedule: false,
  allowPlayerOverlap: false,
  tournamentName: 'Config Tournament',
  tournamentDate: '2026-05-15',
};

function resetStore() {
  useTournamentStore.setState({ config: { ...baseConfig } });
}

function mount(module: 'meet' | 'bracket', props: Partial<Parameters<typeof EngineConfigForm>[0]> = {}) {
  return render(
    <MemoryRouter initialEntries={['/tournaments/t1/config']}>
      <Routes>
        <Route
          path="/tournaments/:id/*"
          element={<EngineConfigForm module={module} {...props} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  resetStore();
});

describe('engineFieldAppliesTo (schema helper)', () => {
  it('restBetweenRounds applies only to bracket', () => {
    expect(engineFieldAppliesTo('restBetweenRounds', 'bracket')).toBe(true);
    expect(engineFieldAppliesTo('restBetweenRounds', 'meet')).toBe(false);
  });

  it('shared fields apply to both modules', () => {
    expect(engineFieldAppliesTo('scoringFormat', 'meet')).toBe(true);
    expect(engineFieldAppliesTo('scoringFormat', 'bracket')).toBe(true);
    expect(engineFieldAppliesTo('deterministic', 'meet')).toBe(true);
    expect(engineFieldAppliesTo('deterministic', 'bracket')).toBe(true);
  });

  it('schema declares exactly two module-specific fields', () => {
    const specific = ENGINE_CONFIG_FIELDS.filter((f) => f.modules.length === 1);
    expect(specific.map((f) => f.key).sort()).toEqual([
      'restBetweenRounds',
      'solverTimeLimitSeconds',
    ]);
  });

  it('solverTimeLimitSeconds applies only to meet — bracket keeps its own per-request budget (C10)', () => {
    // backend/api/brackets.py `_bracket_solver_options` deliberately does
    // not read solverTimeLimitSeconds; rendering it on bracket would be a
    // decorative control that changes nothing.
    expect(engineFieldAppliesTo('solverTimeLimitSeconds', 'meet')).toBe(true);
    expect(engineFieldAppliesTo('solverTimeLimitSeconds', 'bracket')).toBe(false);
  });
});

describe('<EngineConfigForm /> — shared groups', () => {
  it.each(['meet', 'bracket'] as const)(
    '%s renders all four shared groups',
    (module) => {
      mount(module);
      expect(screen.getByText('Scoring')).toBeInTheDocument();
      expect(screen.getByText('Timing')).toBeInTheDocument();
      expect(screen.getByText('Advanced solver')).toBeInTheDocument();
      expect(screen.getByText('Optimisation goals')).toBeInTheDocument();
    },
  );

  it.each(['meet', 'bracket'] as const)(
    '%s renders the shared scoring + solver + goal controls',
    (module) => {
      mount(module);
      expect(screen.getByLabelText('Reproducible solver run')).toBeInTheDocument();
      expect(screen.getByLabelText('Freeze horizon in slots')).toBeInTheDocument();
      expect(screen.getByLabelText('Maximise court utilisation')).toBeInTheDocument();
      expect(screen.getByLabelText('Enforce game spacing')).toBeInTheDocument();
      expect(screen.getByLabelText('Compact schedule')).toBeInTheDocument();
      expect(screen.getByLabelText('Allow player overlap')).toBeInTheDocument();
    },
  );
});

describe('<EngineConfigForm /> — module applicability', () => {
  it('meet does NOT render Rest between rounds', () => {
    mount('meet');
    expect(
      screen.queryByLabelText('Rest between rounds (slots)'),
    ).not.toBeInTheDocument();
  });

  it('bracket DOES render Rest between rounds', () => {
    mount('bracket');
    expect(
      screen.getByLabelText('Rest between rounds (slots)'),
    ).toBeInTheDocument();
  });

  it('meet DOES render Solver time limit', () => {
    mount('meet');
    expect(
      screen.getByLabelText('Solver wall-clock cap in seconds'),
    ).toBeInTheDocument();
  });

  it('bracket does NOT render Solver time limit — it is decorative there (C10 divergence)', () => {
    mount('bracket');
    expect(
      screen.queryByLabelText('Solver wall-clock cap in seconds'),
    ).not.toBeInTheDocument();
  });
});

describe('<EngineConfigForm /> — save flow', () => {
  it('guardSave resolving false aborts submit: updateConfig/setConfig not called', async () => {
    const guard = vi.fn().mockResolvedValue(false);
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    const { container } = mount('meet', { guardSave: guard });

    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });

    expect(guard).toHaveBeenCalledTimes(1);
    expect(setConfig).not.toHaveBeenCalled();
  });

  it('guardSave resolving true allows submit to proceed', async () => {
    const guard = vi.fn().mockResolvedValue(true);
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    const { container } = mount('meet', { guardSave: guard });

    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });

    expect(guard).toHaveBeenCalledTimes(1);
    expect(setConfig).toHaveBeenCalledTimes(1);
  });

  it('submitting without guardSave (absent) proceeds to save', async () => {
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    const { container } = mount('meet');

    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });

    expect(setConfig).toHaveBeenCalledTimes(1);
  });

  it('save spreads the full config so fields this pane does not own survive', async () => {
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    const { container } = mount('meet');

    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });

    expect(setConfig).toHaveBeenCalledTimes(1);
    const written = setConfig.mock.calls[0][0] as TournamentConfig;
    // Fields the pane never touches (owned by venue/identity settings)
    // must still be present, unchanged.
    expect(written.courtCount).toBe(baseConfig.courtCount);
    expect(written.dayStart).toBe(baseConfig.dayStart);
    expect(written.dayEnd).toBe(baseConfig.dayEnd);
    expect(written.tournamentName).toBe(baseConfig.tournamentName);
    // And fields the pane owns are carried through too.
    expect(written.scoringFormat).toBe(baseConfig.scoringFormat);
    expect(written.deterministic).toBe(baseConfig.deterministic);
  });

  it('changing a field before submit writes the new value, spread over the rest', async () => {
    const setConfig = vi.spyOn(useTournamentStore.getState(), 'setConfig');
    const { container } = mount('meet');

    fireEvent.click(screen.getByLabelText('Reproducible solver run'));

    await act(async () => {
      fireEvent.submit(container.querySelector('form')!);
    });

    const written = setConfig.mock.calls[0][0] as TournamentConfig;
    expect(written.deterministic).toBe(true);
    expect(written.courtCount).toBe(baseConfig.courtCount);
  });
});
