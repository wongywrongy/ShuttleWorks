/**
 * Display · Board — the settings the page answers, in order: is the board
 * ON, what is its LINK, which courts does it show, does it show Next, then
 * appearance, then an explicit "Preview fullscreen" action that opens the
 * real published board, and an embedded frame of that SAME published URL
 * sized to the settings column (D7 — preview and fullscreen are one saved
 * config in one renderer; no sample-data swatch, no second renderer).
 *
 * The "Board sources" catalog is GONE (operator-visual-fixes P4): it was a
 * second, read-only rendering of module state. Board availability is the
 * Display module's own switch, driven by the one module command.
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
const BOARD_SETTINGS = {
  title: null,
  logoUrl: null,
  bannerUrl: null,
  accent: null,
  showNext: false,
  showScores: true,
};

// The public link is minted server-side (`/tournaments/{id}/display-token`),
// the same seam Sharing (scope="links") uses — so every render here needs it
// stubbed.
const PUBLIC_URL = `${window.location.origin}/display?token=cap-tok`;

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(apiClient, 'getDisplayToken');
  vi.spyOn(apiClient, 'getBoardSettings').mockResolvedValue(BOARD_SETTINGS);
  vi.spyOn(apiClient, 'getWorkspaceModules').mockResolvedValue([]);
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
  // OPR-0908-4: the PAGE (`DisplayBoardSettings`' `ActionsBar`) owns the
  // "Venue board" title. This component must not title itself, or the page
  // shows the same name twice.
  it('renders no "Venue board" heading of its own (the page owns the title)', () => {
    render(<DisplayConfig tid="t1" modules={MEET_ON} publicUrl={PUBLIC_URL} />, { wrapper: MemoryRouter });
    expect(screen.queryByRole('heading', { name: 'Venue board' })).toBeNull();
  });

  it('shows Board layout when Meet is enabled', () => {
    render(<DisplayConfig tid="t1" modules={MEET_ON} publicUrl={PUBLIC_URL} />, { wrapper: MemoryRouter });
    expect(screen.getByRole('heading', { name: 'Board layout' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Display mode' })).toBeInTheDocument();
  });

  it('previews the same published board the fullscreen action opens, and no sample-data swatch', async () => {
    render(<DisplayConfig tid="t1" modules={MEET_ON} publicUrl={PUBLIC_URL} />, { wrapper: MemoryRouter });
    const link = await screen.findByRole('link', { name: /preview fullscreen/i });
    const frame = screen.getByTestId('display-config-preview');
    // One saved config, one renderer: the embedded preview and the
    // fullscreen action are the same capability URL (D7).
    expect(frame).toHaveAttribute('src', link.getAttribute('href'));
    expect(screen.queryByTestId('display-preview-caption')).toBeNull();
  });

  it('keeps the Preview fullscreen action for a bracket-only workspace while hiding Meet-only controls', async () => {
    render(<DisplayConfig tid="t1" modules={BRACKET_ONLY} publicUrl={PUBLIC_URL} />, { wrapper: MemoryRouter });
    expect(screen.queryByRole('heading', { name: 'Board layout' })).toBeNull();
    const link = await screen.findByRole('link', { name: /preview fullscreen/i });
    expect(link).toHaveAttribute('href', `${window.location.origin}/display?token=cap-tok`);
  });

  it('answers board on/off with one switch and no second module catalog', () => {
    render(<DisplayConfig tid="t1" modules={MEET_ON} publicUrl={PUBLIC_URL} />, { wrapper: MemoryRouter });
    expect(screen.getByRole('radiogroup', { name: 'Show this board' })).toBeInTheDocument();
    // The read-only Meet/Bracket source list and its "Modules →" links are
    // gone: they duplicated a state this page does not own.
    expect(screen.queryByRole('heading', { name: 'Board sources' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Modules →' })).toBeNull();
  });

  it('states the one reason the board switch cannot move', () => {
    render(<DisplayConfig tid="t1" modules={MEET_OFF} />, { wrapper: MemoryRouter });
    expect(screen.getByText('Needs Meet or Bracket on.')).toBeInTheDocument();
  });

  it('renders the board content and appearance controls for a bracket-only workspace too', async () => {
    render(<DisplayConfig tid="t1" modules={BRACKET_ONLY} />, { wrapper: MemoryRouter });
    // Show next / Show scores and the branding apply to every board, so they
    // are NOT behind the Meet-only layout editor.
    expect(await screen.findByRole('switch', { name: 'Show next' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Show scores' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Board layout' })).toBeNull();
  });

  it('renders the composed link controls directly under the on/off switch', () => {
    render(
      <DisplayConfig tid="t1" modules={MEET_ON} publicUrl={PUBLIC_URL} linkSlot={<div data-testid="link-slot" />} />,
      { wrapper: MemoryRouter },
    );
    expect(screen.getByTestId('link-slot')).toBeInTheDocument();
  });

  // The preview action targets the minted ?token= capability link, never the
  // old viewer-gated `?id=` URL (that route 401s for a signed-out venue TV).
  it('targets the minted ?token= capability URL for the configured board, never the viewer-gated ?id= URL', async () => {
    render(<DisplayConfig tid="t1" modules={MEET_ON} publicUrl={PUBLIC_URL} />, { wrapper: MemoryRouter });
    const link = await screen.findByRole('link', { name: /preview fullscreen/i });
    await waitFor(() =>
      expect(link).toHaveAttribute('href', `${window.location.origin}/display?token=cap-tok`),
    );
    expect(link.getAttribute('href')).not.toContain('?id=');
    expect(link).toHaveAttribute('target', '_blank');
    expect(apiClient.getDisplayToken).not.toHaveBeenCalled();
  });

  // Opening the action does not touch the configuration page's own state —
  // it is a plain new-window link, so the surface underneath is never
  // unmounted and there is nothing to "return" to but what was already there.
  it('leaves the configuration page state untouched after the preview action is present', async () => {
    render(<DisplayConfig tid="t1" modules={MEET_ON} publicUrl={PUBLIC_URL} />, { wrapper: MemoryRouter });
    await screen.findByRole('link', { name: /preview fullscreen/i });
    expect(screen.getByRole('heading', { name: 'Board' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Board layout' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Display mode' })).toBeInTheDocument();
  });

  it('does not retrieve or preview a previously issued link', async () => {
    render(<DisplayConfig tid="t1" modules={MEET_ON} />, { wrapper: MemoryRouter });
    expect(screen.getByTestId('display-link-unavailable')).toHaveTextContent('Create or replace a board link above');
    expect(screen.queryByRole('link', { name: /preview fullscreen/i })).toBeNull();
    expect(apiClient.getDisplayToken).not.toHaveBeenCalled();
  });

  it('clears the preview when its issuing view clears the link', async () => {
    const view = render(<DisplayConfig tid="t1" modules={MEET_ON} publicUrl={PUBLIC_URL} />, { wrapper: MemoryRouter });
    expect(screen.getByTestId('display-config-preview')).toHaveAttribute('src', PUBLIC_URL);
    view.rerender(<DisplayConfig tid="t1" modules={MEET_ON} publicUrl={null} />);
    expect(screen.queryByTestId('display-config-preview')).toBeNull();
    expect(screen.queryByRole('link', { name: /preview fullscreen/i })).toBeNull();
  });

});
