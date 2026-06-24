import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { NewWorkspacePage } from '../NewWorkspacePage';
import { apiClient } from '../../../api/client';

vi.mock('../../../api/client', () => ({
  apiClient: { createTournament: vi.fn() },
}));

function LocationProbe({ refObj }: { refObj: { current: string } }) {
  const loc = useLocation();
  refObj.current = loc.pathname;
  return null;
}

function mount(refObj: { current: string }) {
  return render(
    <MemoryRouter initialEntries={['/new']}>
      <Routes>
        <Route
          path="/new"
          element={<><NewWorkspacePage /><LocationProbe refObj={refObj} /></>}
        />
        <Route path="/tournaments/:id/*" element={<LocationProbe refObj={refObj} />} />
        <Route path="/" element={<LocationProbe refObj={refObj} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NewWorkspacePage', () => {
  beforeEach(() => vi.mocked(apiClient.createTournament).mockReset());

  it('renders module templates and the Create workspace action', () => {
    mount({ current: '' });
    expect(screen.getByRole('heading', { name: 'New workspace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create workspace' })).toBeInTheDocument();
    const meetDay = screen.getByTestId('template-meet-day');
    expect(meetDay).toHaveTextContent('Meet');
    expect(meetDay).toHaveTextContent('Display');
  });

  const seedFor = (call: unknown) =>
    Object.fromEntries(
      ((call as { modules?: { moduleId: string; status: string }[] }).modules ?? []).map(
        (m) => [m.moduleId, m.status],
      ),
    );

  it('Meet Day creates kind=meet with a seed (meet+display enabled) and routes to /setup', async () => {
    vi.mocked(apiClient.createTournament).mockResolvedValue({ id: 'w1' } as never);
    const loc = { current: '' };
    mount(loc);
    fireEvent.click(screen.getByTestId('template-meet-day'));
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(loc.current).toBe('/tournaments/w1/setup'));
    const body = vi.mocked(apiClient.createTournament).mock.calls[0][0];
    expect(body.kind).toBe('meet');
    expect(seedFor(body)).toMatchObject({ meet: 'enabled', display: 'enabled', bracket: 'available' });
  });

  it('Bracket Tournament creates kind=bracket with a seed and routes to /bracket-setup', async () => {
    vi.mocked(apiClient.createTournament).mockResolvedValue({ id: 'w2' } as never);
    const loc = { current: '' };
    mount(loc);
    fireEvent.click(screen.getByTestId('template-bracket-tournament'));
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(loc.current).toBe('/tournaments/w2/bracket-setup'));
    const body = vi.mocked(apiClient.createTournament).mock.calls[0][0];
    expect(body.kind).toBe('bracket');
    expect(seedFor(body)).toMatchObject({ bracket: 'enabled', meet: 'available' });
  });

  it('Hybrid is enabled and creates meet + bracket + display enabled, routing to /setup', async () => {
    vi.mocked(apiClient.createTournament).mockResolvedValue({ id: 'w3' } as never);
    const loc = { current: '' };
    mount(loc);
    expect(screen.getByTestId('template-hybrid')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('template-hybrid'));
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(loc.current).toBe('/tournaments/w3/setup'));
    expect(seedFor(vi.mocked(apiClient.createTournament).mock.calls[0][0])).toMatchObject({
      meet: 'enabled',
      bracket: 'enabled',
      display: 'enabled',
    });
  });

  it('Blank is enabled and creates an all-available workspace, routing to Settings', async () => {
    vi.mocked(apiClient.createTournament).mockResolvedValue({ id: 'w4' } as never);
    const loc = { current: '' };
    mount(loc);
    expect(screen.getByTestId('template-blank')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('template-blank'));
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(loc.current).toBe('/tournaments/w4/settings'));
    expect(seedFor(vi.mocked(apiClient.createTournament).mock.calls[0][0])).toMatchObject({
      meet: 'available',
      bracket: 'available',
      display: 'disabled',
    });
  });
});
