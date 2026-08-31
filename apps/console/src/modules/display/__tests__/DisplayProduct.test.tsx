import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { DisplayProduct } from '../DisplayProduct';
import { apiClient } from '../../../api/client';

vi.mock('../../../api/client', () => ({
  apiClient: {
    getDisplayToken: vi.fn(),
  },
}));

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
  beforeEach(() => {
    vi.mocked(apiClient.getDisplayToken).mockResolvedValue({
      token: 'display-secret',
      url: '/display?token=display-secret',
    });
  });

  it('opens fullscreen with the revocable capability URL', async () => {
    renderAt('abc123');
    // Flush the lazy/Suspense embed so it resolves inside act (pristine output).
    await screen.findByTestId('public-display');
    const link = await screen.findByRole('link', { name: /open fullscreen/i });
    expect(apiClient.getDisplayToken).toHaveBeenCalledWith('abc123');
    expect(link).toHaveAttribute('href', '/display?token=display-secret');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('Configure display goes to the canonical Display config surface', async () => {
    // This asserted `setup?section=display` — the MEET Configuration page,
    // plus a `?section=` value no switcher has ever had. "Configure display"
    // landed the operator on meet scoring settings. Publish owns the
    // canonical display configuration destination.
    renderAt('abc123');
    await screen.findByTestId('public-display');
    await userEvent.click(screen.getByRole('link', { name: /configure display/i }));
    expect(screen.getByTestId('loc')).toHaveTextContent(
      '/tournaments/abc123/publish/displays',
    );
  });
});
