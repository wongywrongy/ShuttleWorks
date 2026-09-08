/**
 * Shell-surface layout (P3) — Administration is a workspace route like any
 * other, and looks like one.
 *
 * Two defects the 2026-09-08 surface books recorded, both rendered rather
 * than asserted as class strings:
 *
 *   1. The shell segments (Overview, Team, Modules, Workspace) rendered with
 *      NO page-title bar while every module surface carried an `ActionsBar`,
 *      so the title baseline disappeared the moment the director crossed into
 *      Administration.
 *   2. The administration sub-tabs hand-rolled an underline treatment — the
 *      only selection in the console that did not go through `ActiveChoice`,
 *      the single visual owner of "selected". Selecting a destination there
 *      therefore carried less weight than the identical act anywhere else.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorkspaceAdminPage, WorkspaceShellSurface } from '../WorkspaceShellSurface';

vi.mock('../../../hooks/useTournamentId', () => ({
  useTournamentId: () => 't1',
}));
vi.mock('../../../api/client', () => ({
  apiClient: { getTournament: () => Promise.resolve(null) },
}));
vi.mock('../../settings/PeopleAccessTab', () => ({
  PeopleAccessTab: () => <div data-testid="team" />,
}));

vi.mock('../../settings/SyncBackupsTab', () => ({
  SyncBackupsTab: () => <div data-testid="backups" />,
}));
vi.mock('../../settings/ActivityTab', () => ({
  ActivityTab: () => <div data-testid="activity" />,
}));
vi.mock('../../settings/GeneralSettingsTab', () => ({
  GeneralSettingsTab: () => <div data-testid="general" />,
}));
vi.mock('../../settings/DangerZoneTab', () => ({
  DangerZoneTab: () => <div data-testid="danger" />,
}));

function renderAdmin(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WorkspaceAdminPage tid="t1" summary={null} onChanged={() => {}} path={path} />
    </MemoryRouter>,
  );
}

describe('Administration — one selection treatment', () => {
  it('marks the open tab with the shared active state, not a bespoke underline', () => {
    renderAdmin('/tournaments/t1/administration/backups');
    const nav = screen.getByRole('navigation', { name: 'Workspace administration' });
    const open = within(nav).getByRole('link', { name: 'Backups' });
    expect(open).toHaveAttribute('aria-current', 'page');
    // `ActiveChoice` owns the fill; a hand-rolled `border-b-2` underline is
    // exactly what this route used to draw instead.
    expect(open.className).toContain('bg-action-primary');
    expect(open.className).not.toContain('border-b-2');

    const other = within(nav).getByRole('link', { name: 'Settings' });
    expect(other).not.toHaveAttribute('aria-current');
    expect(other.className).not.toContain('bg-action-primary');
  });

  it('routes each tab to the URL it names', () => {
    renderAdmin('/tournaments/t1/administration/lifecycle');
    const nav = screen.getByRole('navigation', { name: 'Workspace administration' });
    expect(within(nav).getByRole('link', { name: 'Activity log' })).toHaveAttribute(
      'href',
      '/tournaments/t1/administration/activity',
    );
  });
});

describe('Shell surfaces carry a page title', () => {
  it('Administration · Team names itself in the same bar every module uses', async () => {
    render(
      <MemoryRouter initialEntries={['/tournaments/t1/administration/team']}>
        <WorkspaceShellSurface segment="ws-members" modules={[]} />
      </MemoryRouter>,
    );
    // The ActionsBar eyebrow — the same element Draws, Matches, Setup and
    // Configuration render their title into.
    expect(await screen.findByText('Team')).toBeInTheDocument();
    expect(screen.getByTestId('team')).toBeInTheDocument();
  });
});
