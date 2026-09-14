import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HomeRoute, NotFound } from '../HomeRoute';

const auth = vi.hoisted(() => ({ user: null as null | { offlineWorkspaceId?: string | null } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../modules/hub/HubPage', () => ({ HubPage: () => <h1>Workspaces hub</h1> }));
const WORKSPACE = '11111111-1111-4111-8111-111111111111';

function at(path: string, element: React.ReactNode) {
  return render(<MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/" element={element} />
      <Route path="/missing" element={element} />
      <Route path="/tournaments/:id" element={<h1>Workspace page</h1>} />
    </Routes>
  </MemoryRouter>);
}

describe('home routing', () => {
  it('sends an event-node operator to their only workspace', async () => {
    auth.user = { offlineWorkspaceId: WORKSPACE };
    at('/', <HomeRoute />);
    expect(await screen.findByRole('heading', { name: 'Workspace page' })).toBeInTheDocument();
  });

  it('shows the Hub to everyone else', async () => {
    auth.user = { offlineWorkspaceId: null };
    at('/', <HomeRoute />);
    expect(await screen.findByRole('heading', { name: 'Workspaces hub' })).toBeInTheDocument();
  });

  it('points the not-found page at the node workspace, not the unreachable Hub', () => {
    auth.user = { offlineWorkspaceId: WORKSPACE };
    at('/missing', <NotFound />);
    expect(screen.getByRole('link', { name: 'Go to your workspaces' })).toHaveAttribute('href', `/tournaments/${WORKSPACE}`);
  });
});
