/**
 * V6 — the idle footer named a button the surface did not have. `activeTab
 * === 'schedule'` resolves to two different surfaces (the meet's own Schedule
 * page, button "Generate"; the unified Operations Plan, button "Re-plan
 * day"), and the footer hard-coded the first one's label onto both. The Plan
 * board read "A schedule is in place; Generate replaces it." under a button
 * saying "Re-plan day".
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SolverHud } from '../SolverHud';
import { useUiStore } from '../../store/uiStore';
import { useTournamentStore } from '../../store/tournamentStore';
import type { ScheduleDTO } from '../../api/dto';

const SCHEDULE = { assignments: [] } as unknown as ScheduleDTO;

beforeEach(() => {
  useUiStore.setState({ activeTab: 'schedule', isGenerating: false });
  useTournamentStore.setState({ schedule: null });
});

describe('the idle solver footer names the button that is on screen', () => {
  it('says Re-plan day on the unified Operations Plan', () => {
    useTournamentStore.setState({ schedule: SCHEDULE });
    render(<SolverHud unifiedOps />);
    expect(
      screen.getByText(
        'Solver idle. A schedule is in place; Re-plan day replaces it.',
      ),
    ).toBeInTheDocument();
  });

  it('says Generate on the meet-only Schedule page', () => {
    useTournamentStore.setState({ schedule: SCHEDULE });
    render(<SolverHud />);
    expect(
      screen.getByText(
        'Solver idle. A schedule is in place; Generate replaces it.',
      ),
    ).toBeInTheDocument();
  });

  it('names the first-solve button on each surface too', () => {
    const { unmount } = render(<SolverHud unifiedOps />);
    expect(
      screen.getByText('Solver idle. Click Generate meet to begin.'),
    ).toBeInTheDocument();
    unmount();

    render(<SolverHud />);
    expect(
      screen.getByText('Solver idle. Click Generate to begin.'),
    ).toBeInTheDocument();
  });
});
