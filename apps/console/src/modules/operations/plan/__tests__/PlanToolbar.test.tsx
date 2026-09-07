import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PlanToolbar } from '../PlanToolbar';

// V3-OC18.2: the Plan toolbar's schedule action must name the actual
// selection it operates on — a count that agrees with the helper line, and
// a stated prerequisite (never silence) when nothing is eligible yet.
function renderToolbar(props: Partial<React.ComponentProps<typeof PlanToolbar>> = {}) {
  return render(
    <MemoryRouter initialEntries={['/tournaments/t1']}>
      <Routes>
        <Route
          path="/tournaments/:id"
          element={
            <PlanToolbar
              phase="setup"
              meetEnabled={false}
              bracketEnabled
              bracketWindows={undefined}
              schedulableCount={0}
              onOpenScheduleNext={() => {}}
              planFinalized={false}
              planFinalizePending={false}
              onTogglePlanFinalized={() => {}}
              onOpenDialog={() => {}}
              {...props}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PlanToolbar — Schedule action (V3-OC18.2)', () => {
  it('names the exact set it schedules, matching the count', () => {
    renderToolbar({ schedulableCount: 24 });
    expect(
      screen.getByRole('button', { name: 'Schedule 24 unscheduled matches' }),
    ).toBeInTheDocument();
  });

  it('singularizes for exactly one match', () => {
    renderToolbar({ schedulableCount: 1 });
    expect(screen.getByRole('button', { name: 'Schedule 1 unscheduled match' })).toBeInTheDocument();
  });

  it('names the prerequisite instead of vanishing when nothing is eligible yet', () => {
    renderToolbar({ schedulableCount: 0, blockedCount: 3 });
    expect(screen.queryByTestId('ops-schedule-next')).not.toBeInTheDocument();
    expect(screen.getByTestId('ops-schedule-next-blocked')).toHaveTextContent(
      '3 matches waiting on a result before they can be scheduled',
    );
  });

  it('renders neither action nor prerequisite note when there is truly nothing left', () => {
    renderToolbar({ schedulableCount: 0, blockedCount: 0 });
    expect(screen.queryByTestId('ops-schedule-next')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ops-schedule-next-blocked')).not.toBeInTheDocument();
  });
});
