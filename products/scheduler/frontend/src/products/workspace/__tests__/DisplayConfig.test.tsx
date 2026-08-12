/**
 * Tests for DisplayConfig's "Board layout" + "Preview" mount (Task 6).
 * The existing Feeds + Public link sections are untouched (no coverage
 * regression to guard there — verified by inspection, not duplicated here).
 * tv* fields only drive the Meet board, so the new sections are gated to
 * Meet-enabled workspaces.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DisplayConfig } from '../DisplayConfig';
import { apiClient } from '../../../api/client';
import { useTournamentStore } from '../../../store/tournamentStore';
import type { WorkspaceModule } from '../../../platform/product-shell/types';

const MEET_ON: WorkspaceModule[] = [{ id: 'meet', label: 'Meet', status: 'enabled' }];
const BRACKET_ONLY: WorkspaceModule[] = [
  { id: 'meet', label: 'Meet', status: 'disabled' },
  { id: 'bracket', label: 'Bracket', status: 'enabled' },
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
    render(<DisplayConfig tid="t1" modules={MEET_ON} />);
    expect(screen.getByRole('heading', { name: 'Board layout' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Preview' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Display mode' })).toBeInTheDocument();
    expect(screen.getByTestId('display-preview-frame')).toBeInTheDocument();
  });

  it('hides Board layout + Preview for a bracket-only workspace (tv* fields do not drive it)', () => {
    render(<DisplayConfig tid="t1" modules={BRACKET_ONLY} />);
    expect(screen.queryByRole('heading', { name: 'Board layout' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Preview' })).toBeNull();
  });

  it('still renders the existing Feeds + Public link sections untouched', () => {
    render(<DisplayConfig tid="t1" modules={MEET_ON} />);
    expect(screen.getByRole('heading', { name: 'Feeds' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Public link' })).toBeInTheDocument();
    expect(screen.getByLabelText('Public display URL')).toBeInTheDocument();
  });

  // The link on this tab used to be `${origin}/display?id=<uuid>` under the
  // caption "Anyone with the link can watch, with no sign-in." That route is
  // viewer-gated: signed out it 401s, the board says the link "has been turned
  // off or never existed", and the client blames an expired session that never
  // existed. The real public link is the capability token.
  it('shows the minted ?token= capability link, never the viewer-gated ?id= URL', async () => {
    render(<DisplayConfig tid="t1" modules={MEET_ON} />);
    const field = screen.getByLabelText('Public display URL') as HTMLInputElement;
    await waitFor(() =>
      expect(field.value).toBe(`${window.location.origin}/display?token=cap-tok`),
    );
    expect(field.value).not.toContain('?id=');
    expect(apiClient.getDisplayToken).toHaveBeenCalledWith('t1');
  });

  it('says what to do instead of handing over a URL when no link can be minted', async () => {
    vi.spyOn(apiClient, 'getDisplayToken').mockRejectedValue(new Error('404'));
    render(<DisplayConfig tid="t1" modules={MEET_ON} />);
    expect(await screen.findByTestId('display-link-unavailable')).toBeInTheDocument();
    expect(screen.queryByLabelText('Public display URL')).toBeNull();
  });

  // Locks the headline feature end-to-end: editor -> store -> preview, with
  // no Save step. Proves the "live" in "live preview" isn't just correct by
  // construction (new config object -> selector re-render -> new prop) but
  // actually observable: toggling "Show scores" makes the sample match's
  // score disappear from the preview frame in the SAME render pass, with no
  // debounced PUT needed (setConfig writes to the store synchronously).
  it('reflects an unsaved editor edit in the preview immediately (live-draft preview)', () => {
    render(<DisplayConfig tid="t1" modules={MEET_ON} />);
    const preview = screen.getByTestId('display-preview-frame');
    expect(preview).toHaveTextContent('11–7');

    fireEvent.click(screen.getByRole('switch', { name: 'Show scores' }));

    expect(preview).not.toHaveTextContent('11–7');
  });
});
