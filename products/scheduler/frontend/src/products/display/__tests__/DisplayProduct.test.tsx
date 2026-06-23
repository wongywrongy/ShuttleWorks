import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { DisplayProduct } from '../DisplayProduct';

// The embedded public display is heavy + starts its own polling; stub it so
// these tests focus on DisplayProduct's own routing affordances.
vi.mock('../../../pages/PublicDisplayPage', () => ({
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
        <Route path="/tournaments/:id/setup" element={<LocationProbe />} />
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

  it('navigates via the router to setup?section=display on Configure (route + UI stay in sync)', async () => {
    renderAt('abc123');
    await screen.findByTestId('public-display');
    await userEvent.click(screen.getByRole('button', { name: /configure display/i }));
    expect(screen.getByTestId('loc')).toHaveTextContent(
      '/tournaments/abc123/setup?section=display',
    );
  });
});
