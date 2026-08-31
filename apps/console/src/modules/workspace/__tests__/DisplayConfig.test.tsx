/**
 * Publish → Displays keeps module-owned board settings beside a real preview
 * of the minted public capability projection. Meet-only layout controls stay
 * gated to Meet; the public preview remains available to bracket workspaces.
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
// the same seam Settings → Sharing uses — so every render here needs it stubbed.
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

describe('<DisplayConfig /> — Board layout + Preview mount', () => {
  it('shows Board layout + Preview when Meet is enabled', () => {
    render(<DisplayConfig tid="t1" modules={MEET_ON} />, { wrapper: MemoryRouter });
    expect(screen.getByRole('heading', { name: 'Board layout' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Preview' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Display mode' })).toBeInTheDocument();
    expect(screen.getByTestId('display-preview-frame')).toBeInTheDocument();
  });

  it('keeps the published preview for a bracket-only workspace while hiding Meet-only controls', async () => {
    render(<DisplayConfig tid="t1" modules={BRACKET_ONLY} />, { wrapper: MemoryRouter });
    expect(screen.queryByRole('heading', { name: 'Board layout' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Preview' })).toBeInTheDocument();
    expect(await screen.findByTestId('display-preview-iframe')).toHaveAttribute(
      'src',
      `${window.location.origin}/display?token=cap-tok`,
    );
  });

  it('renders Board sources + Public link with explicit module state', () => {
    render(<DisplayConfig tid="t1" modules={MEET_ON} />, { wrapper: MemoryRouter });
    expect(screen.getByRole('heading', { name: 'Board sources' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Public link' })).toBeInTheDocument();
    expect(screen.getByLabelText('Public display URL')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('distinguishes a disabled source from one that is available to enable', () => {
    render(<DisplayConfig tid="t1" modules={MEET_OFF} />, { wrapper: MemoryRouter });
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Modules →' })).toHaveLength(2);
  });

  // The link on this tab used to be `${origin}/display?id=<uuid>` under the
  // caption "Anyone with the link can watch, with no sign-in." That route is
  // viewer-gated: signed out it 401s, the board says the link "has been turned
  // off or never existed", and the client blames an expired session that never
  // existed. The real public link is the capability token.
  it('shows the minted ?token= capability link, never the viewer-gated ?id= URL', async () => {
    render(<DisplayConfig tid="t1" modules={MEET_ON} />, { wrapper: MemoryRouter });
    const field = screen.getByLabelText('Public display URL') as HTMLInputElement;
    await waitFor(() =>
      expect(field.value).toBe(`${window.location.origin}/display?token=cap-tok`),
    );
    expect(field.value).not.toContain('?id=');
    expect(apiClient.getDisplayToken).toHaveBeenCalledWith('t1');
  });

  it('says what to do instead of handing over a URL when no link can be minted', async () => {
    vi.spyOn(apiClient, 'getDisplayToken').mockRejectedValue(new Error('404'));
    render(<DisplayConfig tid="t1" modules={MEET_ON} />, { wrapper: MemoryRouter });
    expect(await screen.findByTestId('display-link-unavailable')).toBeInTheDocument();
    expect(screen.queryByLabelText('Public display URL')).toBeNull();
  });

  it('uses the minted capability URL for the inline preview, never the viewer-gated route', async () => {
    render(<DisplayConfig tid="t1" modules={MEET_ON} />, { wrapper: MemoryRouter });
    const preview = screen.getByTestId('display-preview-frame');
    const iframe = await screen.findByTestId('display-preview-iframe');
    expect(preview).toHaveAttribute('aria-label', 'Published venue board preview');
    expect(iframe).toHaveAttribute('src', `${window.location.origin}/display?token=cap-tok`);
    expect(iframe).not.toHaveAttribute('src', expect.stringContaining('?id='));
    expect(apiClient.getDisplayToken).toHaveBeenCalledTimes(1);
  });
});
