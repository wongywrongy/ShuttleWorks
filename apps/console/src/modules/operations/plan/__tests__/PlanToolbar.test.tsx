import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// The commit button is also gated on write permission; these tests are about
// the readiness rule, so the harness is an editor.
vi.mock('../../../../hooks/useCanEdit', () => ({
  useCanEdit: () => true,
  assertCanEdit: () => true,
}));

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

// P2: a plan that double-books a court is not ready by definition. The button
// refuses and names the courts; the same rule is enforced at the write
// boundary (`POST /plan-finalized`), which is what holds against a stale
// screen or a concurrent submission.
describe('PlanToolbar — Mark plan ready refuses a double-booked plan', () => {
  it('disables the commit and names the offending courts', () => {
    renderToolbar({ doubleBookedCourts: [2, 5] });
    const commit = screen.getByTestId('ops-plan-finalize-toggle');
    expect(commit).toBeDisabled();
    expect(screen.getByTestId('ops-plan-finalize-blocked')).toHaveTextContent(
      'Two matches share Courts 2, 5. Fix the overlap before marking the plan ready.',
    );
  });

  it('names one court in the singular', () => {
    renderToolbar({ doubleBookedCourts: [3] });
    expect(screen.getByTestId('ops-plan-finalize-blocked')).toHaveTextContent(
      'Two matches share Court 3.',
    );
  });

  it('never traps a ready plan: un-readying stays available while double-booked', () => {
    renderToolbar({ doubleBookedCourts: [1], planFinalized: true });
    expect(screen.getByTestId('ops-plan-finalize-toggle')).not.toBeDisabled();
    expect(screen.queryByTestId('ops-plan-finalize-blocked')).toBeNull();
  });

  it('a clean plan commits as before', () => {
    renderToolbar({ doubleBookedCourts: [] });
    expect(screen.getByTestId('ops-plan-finalize-toggle')).not.toBeDisabled();
    expect(screen.queryByTestId('ops-plan-finalize-blocked')).toBeNull();
  });
});

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
