/**
 * Publish → Displays: module-owned board sources, board layout controls, and
 * an explicit "Preview fullscreen" action that opens the real published
 * board — no inline iframe, no sample-data swatch (package 16; supersedes
 * V3-OC22.1's "widen the tiny preview" treatment).
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
// The Sharing mentions are real <Link>s now (D2.1) — renders need a router.
import { MemoryRouter } from 'react-router-dom';
import { DisplayConfig } from '../DisplayConfig';
import { apiClient } from '../../../api/client';
import { useTournamentStore } from '../../../store/tournamentStore';
import type { WorkspaceModule } from '../../../platform/product-shell/types';

const MEET_ON: WorkspaceModule[] = [{ id: 'meet', label: 'Meet', status: 'enabled' }];
const BRACKET_ONLY: WorkspaceModule[] = [
  { id: 'meet', label: 'Meet', status: 'disabled' },
  { id: 'bracket', label: 'Bracket', status: 'enabled' },
];
const MEET_OFF: WorkspaceModule[] = [
  { id: 'meet', label: 'Meet', status: 'disabled' },
  { id: 'bracket', label: 'Bracket', status: 'available' },
];

// The public link is minted server-side (`/tournaments/{id}/display-token`),
// the same seam Sharing (scope="links") uses — so every render here needs it
// stubbed.
const TOKEN_DTO = { token: 'cap-tok', url: '/display?token=cap-tok' };

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(apiClient, 'getDisplayToken').mockResolvedValue(TOKEN_DTO);
  useTournamentStore.setState({
    config: {
      intervalMinutes: 30,
      dayStart: '09:00',
      dayEnd: '18:00',
      breaks: [],
      courtCount: 4,
      defaultRestMinutes: 0,
      freezeHorizonSlots: 0,
    },
  });
});

describe('<DisplayConfig /> — Board sources + Preview fullscreen + Board layout', () => {
  it('shows Board layout when Meet is enabled', () => {
    render(<DisplayConfig tid="t1" modules={MEET_ON} />, { wrapper: MemoryRouter });
    expect(screen.getByRole('heading', { name: 'Board layout' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Display mode' })).toBeInTheDocument();
  });

  it('never renders an inline preview iframe or a sample-data swatch', async () => {
    render(<DisplayConfig tid="t1" modules={MEET_ON} />, { wrapper: MemoryRouter });
    await screen.findByRole('link', { name: /preview fullscreen/i });
    expect(screen.queryByTestId('display-preview-iframe')).toBeNull();
    expect(screen.queryByTestId('display-preview-frame')).toBeNull();
    expect(screen.queryByTestId('display-preview-caption')).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('keeps the Preview fullscreen action for a bracket-only workspace while hiding Meet-only controls', async () => {
    render(<DisplayConfig tid="t1" modules={BRACKET_ONLY} />, { wrapper: MemoryRouter });
    expect(screen.queryByRole('heading', { name: 'Board layout' })).toBeNull();
    const link = await screen.findByRole('link', { name: /preview fullscreen/i });
    expect(link).toHaveAttribute('href', `${window.location.origin}/display?token=cap-tok`);
  });

  it('renders Board sources with explicit module state', () => {
    render(<DisplayConfig tid="t1" modules={MEET_ON} />, { wrapper: MemoryRouter });
    expect(screen.getByRole('heading', { name: 'Board sources' })).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('distinguishes a disabled source from one that is available to enable', () => {
    render(<DisplayConfig tid="t1" modules={MEET_OFF} />, { wrapper: MemoryRouter });
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Modules →' })).toHaveLength(2);
  });

  // The preview action targets the minted ?token= capability link, never the
  // old viewer-gated `?id=` URL (that route 401s for a signed-out venue TV).
  it('targets the minted ?token= capability URL for the configured board, never the viewer-gated ?id= URL', async () => {
    render(<DisplayConfig tid="t1" modules={MEET_ON} />, { wrapper: MemoryRouter });
    const link = await screen.findByRole('link', { name: /preview fullscreen/i });
    await waitFor(() =>
      expect(link).toHaveAttribute('href', `${window.location.origin}/display?token=cap-tok`),
    );
    expect(link.getAttribute('href')).not.toContain('?id=');
    expect(link).toHaveAttribute('target', '_blank');
    expect(apiClient.getDisplayToken).toHaveBeenCalledWith('t1');
  });

  // Opening the action does not touch the configuration page's own state —
  // it is a plain new-window link, so the surface underneath is never
  // unmounted and there is nothing to "return" to but what was already there.
  it('leaves the configuration page state untouched after the preview action is present', async () => {
    render(<DisplayConfig tid="t1" modules={MEET_ON} />, { wrapper: MemoryRouter });
    await screen.findByRole('link', { name: /preview fullscreen/i });
    expect(screen.getByRole('heading', { name: 'Board sources' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Board layout' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Display mode' })).toBeInTheDocument();
  });

  it('shows the reason and no action when no board link can be minted (not an owner)', async () => {
    vi.spyOn(apiClient, 'getDisplayToken').mockRejectedValue(
      Object.assign(new Error('403'), { status: 403 }),
    );
    render(<DisplayConfig tid="t1" modules={MEET_ON} />, { wrapper: MemoryRouter });
    expect(await screen.findByTestId('display-link-unavailable')).toHaveTextContent(
      'No venue board link yet. Only a workspace owner can create one.',
    );
    expect(screen.queryByRole('link', { name: /preview fullscreen/i })).toBeNull();
  });

  it('shows a reason and a create/retry action on a genuine load failure', async () => {
    const spy = vi
      .spyOn(apiClient, 'getDisplayToken')
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(TOKEN_DTO);
    render(<DisplayConfig tid="t1" modules={MEET_ON} />, { wrapper: MemoryRouter });
    const errorBlock = await screen.findByTestId('display-link-error');
    expect(errorBlock).toHaveTextContent('The venue board link could not be loaded.');
    const retry = screen.getByRole('button', { name: 'Retry' });
    retry.click();
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('link', { name: /preview fullscreen/i })).toHaveAttribute(
      'href',
      `${window.location.origin}/display?token=cap-tok`,
    );
  });
});
