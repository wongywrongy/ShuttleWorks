import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { DisplayProduct } from '../DisplayProduct';

// The embedded public display is heavy + starts its own polling; stub it so
// these tests focus on DisplayProduct's own routing affordances.
vi.mock('../PublicDisplayPage', () => ({
  PublicDisplayPage: () => <div data-testid="public-display" />,
}));

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/tournaments/${id}/tv`]}>
      <Routes>
        <Route path="/tournaments/:id/tv" element={<DisplayProduct />} />
        {/* Catch-all probe. This used to register only `/setup`, so the
            navigation assertion could only ever be checked against the one
            destination the test already assumed — a wrong target would have
            rendered nothing and been indistinguishable from a dead button. */}
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DisplayProduct', () => {
  it('opens fullscreen with the workspace id query param (standalone display needs ?id=)', async () => {
    renderAt('abc123');
    // Flush the lazy/Suspense embed so it resolves inside act (pristine output).
    await screen.findByTestId('public-display');
    const link = screen.getByRole('link', { name: /open fullscreen/i });
    expect(link).toHaveAttribute('href', '/display?id=abc123');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('Configure display goes to the Display config surface, not meet setup', async () => {
    // This asserted `setup?section=display` — the MEET Configuration page,
    // plus a `?section=` value no switcher has ever had. "Configure display"
    // landed the operator on meet scoring settings. Display owns
    // `display-config` (moduleContract ownedSegments).
    renderAt('abc123');
    await screen.findByTestId('public-display');
    await userEvent.click(screen.getByRole('button', { name: /configure display/i }));
    expect(screen.getByTestId('loc')).toHaveTextContent(
      '/tournaments/abc123/display-config',
    );
  });
});
