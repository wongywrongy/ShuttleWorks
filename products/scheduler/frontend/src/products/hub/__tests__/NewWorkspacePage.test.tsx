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

  it('Meet Day template creates kind=meet and routes to /setup', async () => {
    vi.mocked(apiClient.createTournament).mockResolvedValue({ id: 'w1' } as never);
    const loc = { current: '' };
    mount(loc);
    fireEvent.click(screen.getByTestId('template-meet-day'));
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(loc.current).toBe('/tournaments/w1/setup'));
    expect(apiClient.createTournament).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'meet' }),
    );
  });

  it('Bracket Tournament template creates kind=bracket and routes to /bracket-setup', async () => {
    vi.mocked(apiClient.createTournament).mockResolvedValue({ id: 'w2' } as never);
    const loc = { current: '' };
    mount(loc);
    fireEvent.click(screen.getByTestId('template-bracket-tournament'));
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(loc.current).toBe('/tournaments/w2/bracket-setup'));
    expect(apiClient.createTournament).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'bracket' }),
    );
  });

  it('Hybrid and Blank templates are disabled (coming soon)', () => {
    mount({ current: '' });
    expect(screen.getByTestId('template-hybrid')).toBeDisabled();
    expect(screen.getByTestId('template-blank')).toBeDisabled();
  });
});
