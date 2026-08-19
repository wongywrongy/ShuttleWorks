import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SharingTab } from '../SharingTab';
import { apiClient } from '../../../api/client';

vi.mock('../../../api/client', () => ({
  apiClient: {
    listInvites: vi.fn(),
    createInvite: vi.fn(),
    revokeInvite: vi.fn(),
    getDisplayToken: vi.fn(),
    rotateDisplayToken: vi.fn(),
    getEntryPage: vi.fn(),
    patchEntryPagePublication: vi.fn(),
  },
}));

/** A stored entry page with every gate off — the migration default. */
const entryPage = (over: Record<string, unknown> = {}) =>
  ({
    slug: 'spring-open',
    isOpen: true,
    entrantsPublished: false,
    drawsPublished: false,
    resultsPublished: false,
    ...over,
  }) as never;

describe('SharingTab', () => {
  beforeEach(() => {
    vi.mocked(apiClient.listInvites).mockReset();
    vi.mocked(apiClient.createInvite).mockReset();
    vi.mocked(apiClient.revokeInvite).mockReset();
    vi.mocked(apiClient.getDisplayToken).mockReset();
    vi.mocked(apiClient.rotateDisplayToken).mockReset();
    vi.mocked(apiClient.listInvites).mockResolvedValue([] as never);
    vi.mocked(apiClient.createInvite).mockResolvedValue({ token: 'new' } as never);
    vi.mocked(apiClient.revokeInvite).mockResolvedValue(undefined as never);
    vi.mocked(apiClient.getDisplayToken).mockResolvedValue({
      token: 'tok-abc',
      url: '/display?token=tok-abc',
    } as never);
    vi.mocked(apiClient.rotateDisplayToken).mockResolvedValue({
      token: 'tok-new',
      url: '/display?token=tok-new',
    } as never);
    vi.mocked(apiClient.getEntryPage).mockReset();
    vi.mocked(apiClient.patchEntryPagePublication).mockReset();
    // Default: no entry page — the publication card stays hidden, and every
    // pre-SP-P7 test in this file renders exactly what it used to.
    vi.mocked(apiClient.getEntryPage).mockRejectedValue(
      Object.assign(new Error('404'), { response: { status: 404 } }),
    );
  });

  it('shows the capability display link fetched from getDisplayToken', async () => {
    render(<SharingTab tid="t1" />);
    const input = screen.getByLabelText('Public display link') as HTMLInputElement;
    await waitFor(() => expect(input.value).toContain('/display?token=tok-abc'));
    expect(apiClient.getDisplayToken).toHaveBeenCalledWith('t1');
    expect(input.value).not.toContain('?id=');
  });

  /* Rotate revokes the LIVE venue display link on the spot: mid-event, the
   * hall's screen goes blank. It used to be one click, in a row with Copy and
   * Open fullscreen, at the same size and variant as both. It now arms first
   * (the canon `useConfirmClick` two-click guard) and sits below the rule,
   * outside that row. */
  it('Rotate link does NOT rotate on the first click: it arms', async () => {
    render(<SharingTab tid="t1" />);
    const input = screen.getByLabelText('Public display link') as HTMLInputElement;
    await waitFor(() => expect(input.value).toContain('tok-abc'));

    fireEvent.click(screen.getByRole('button', { name: 'Rotate the public display link' }));

    expect(apiClient.rotateDisplayToken).not.toHaveBeenCalled();
    expect(input.value).toContain('tok-abc');
    // Armed state names the consequence rather than repeating the label.
    expect(
      screen.getByRole('button', { name: 'Confirm rotating the public display link' }),
    ).toBeInTheDocument();
  });

  it('Rotate link swaps in the new token on the confirming second click', async () => {
    render(<SharingTab tid="t1" />);
    const input = screen.getByLabelText('Public display link') as HTMLInputElement;
    await waitFor(() => expect(input.value).toContain('tok-abc'));

    fireEvent.click(screen.getByRole('button', { name: 'Rotate the public display link' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm rotating the public display link' }),
    );

    await waitFor(() => expect(input.value).toContain('/display?token=tok-new'));
    expect(apiClient.rotateDisplayToken).toHaveBeenCalledWith('t1');
  });

  it('Escape disarms a Rotate armed by mistake', async () => {
    render(<SharingTab tid="t1" />);
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Public display link') as HTMLInputElement).value,
      ).toContain('tok-abc'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rotate the public display link' }));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(
      screen.getByRole('button', { name: 'Rotate the public display link' }),
    ).toBeInTheDocument();
    expect(apiClient.rotateDisplayToken).not.toHaveBeenCalled();
  });

  it('keeps Rotate out of the row that holds the two safe controls', async () => {
    render(<SharingTab tid="t1" />);
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Public display link') as HTMLInputElement).value,
      ).toContain('tok-abc'),
    );

    // Copy and Open fullscreen share a parent with the link input. Rotate must
    // not: a destructive control 24px from two read-only ones, styled the same,
    // is the misclick this separation exists to prevent.
    const safeRow = screen.getByRole('button', { name: 'Copy' }).parentElement!;
    expect(within(safeRow).getByRole('button', { name: 'Open fullscreen' })).toBeInTheDocument();
    expect(
      within(safeRow).queryByRole('button', { name: /rotate/i }),
    ).toBeNull();
  });

  it('hides the public display section when the token fetch fails (not owner)', async () => {
    vi.mocked(apiClient.getDisplayToken).mockRejectedValue(
      Object.assign(new Error('Not found'), { status: 404 }),
    );
    render(<SharingTab tid="t1" />);
    await waitFor(() =>
      expect(screen.queryByTestId('sharing-public')).toBeNull(),
    );
    // Invites remain available.
    expect(screen.getByTestId('sharing-invites')).toBeInTheDocument();
  });

  it('separates the public display link from collaborator invites with safety copy', async () => {
    render(<SharingTab tid="t1" />);
    const pub = screen.getByTestId('sharing-public');
    expect(pub).toHaveTextContent(/anyone with this link/i);
    expect(within(pub).getByLabelText('Public display link')).toBeInTheDocument();
    const inv = screen.getByTestId('sharing-invites');
    expect(within(inv).getByText(/operate this workspace/i)).toBeInTheDocument();
    expect(within(inv).getByRole('button', { name: 'Create invite' })).toBeInTheDocument();
    await waitFor(() => expect(apiClient.getDisplayToken).toHaveBeenCalled());
  });

  it('Create invite calls createInvite then refetches the list', async () => {
    render(<SharingTab tid="t1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Create invite' }));
    await waitFor(() =>
      expect(apiClient.createInvite).toHaveBeenCalledWith('t1', { role: 'operator' }),
    );
    expect(vi.mocked(apiClient.listInvites).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('passes a non-empty email through to createInvite and clears the field', async () => {
    render(<SharingTab tid="t1" />);
    const emailInput = screen.getByLabelText('Invite email (optional)') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: '  coach@club.org  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create invite' }));
    await waitFor(() =>
      expect(apiClient.createInvite).toHaveBeenCalledWith('t1', {
        role: 'operator',
        email: 'coach@club.org',
      }),
    );
    await waitFor(() => expect(emailInput.value).toBe(''));
  });

  it('renders the recipient email on invite rows that carry one', async () => {
    vi.mocked(apiClient.listInvites).mockResolvedValue([
      { token: 'a', tournamentId: 't1', role: 'operator', createdAt: '', expiresAt: null, revokedAt: null, valid: true, email: 'coach@club.org' },
      { token: 'b', tournamentId: 't1', role: 'viewer', createdAt: '', expiresAt: null, revokedAt: null, valid: true, email: null },
    ] as never);
    render(<SharingTab tid="t1" />);
    const row = await screen.findByTestId('invite-a');
    expect(row).toHaveTextContent('coach@club.org');
    expect(screen.getByTestId('invite-b')).not.toHaveTextContent('@');
  });

  it('active invite shows Revoke (calls revokeInvite); revoked invite shows none', async () => {
    vi.mocked(apiClient.listInvites).mockResolvedValue([
      { token: 'a', tournamentId: 't1', role: 'operator', createdAt: '', expiresAt: null, revokedAt: null, valid: true },
      { token: 'b', tournamentId: 't1', role: 'viewer', createdAt: '', expiresAt: null, revokedAt: '2020-01-01T00:00:00Z', valid: false },
    ] as never);
    render(<SharingTab tid="t1" />);
    await waitFor(() => expect(screen.getByTestId('invite-a')).toBeInTheDocument());
    fireEvent.click(within(screen.getByTestId('invite-a')).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(apiClient.revokeInvite).toHaveBeenCalledWith('a'));
    expect(
      within(screen.getByTestId('invite-b')).queryByRole('button', { name: 'Revoke' }),
    ).toBeNull();
  });
});

/**
 * Sibling of the Entries-desk defect (2026-08-10 browser pass): a rejected
 * `listInvites` became `[]` and rendered as "No invite links yet." An owner
 * reading that would mint a duplicate invite for someone who already has one.
 */
describe('SharingTab — the public-site publication card (SP-P7 §4)', () => {
  beforeEach(() => {
    vi.mocked(apiClient.listInvites).mockResolvedValue([] as never);
    vi.mocked(apiClient.getDisplayToken).mockResolvedValue({
      token: 'tok-abc',
      url: '/display?token=tok-abc',
    } as never);
    vi.mocked(apiClient.getEntryPage).mockRejectedValue(
      Object.assign(new Error('404'), { response: { status: 404 } }),
    );
    vi.mocked(apiClient.patchEntryPagePublication).mockReset();
  });

  it('is absent when the workspace has no entry page', async () => {
    render(<SharingTab tid="t1" />);
    await screen.findByLabelText('Public display link');
    expect(screen.queryByTestId('sharing-publication')).toBeNull();
  });

  it('renders the three gates off by default and flips only the one toggled', async () => {
    vi.mocked(apiClient.getEntryPage).mockResolvedValue(entryPage());
    vi.mocked(apiClient.patchEntryPagePublication).mockResolvedValue(
      entryPage({ drawsPublished: true }),
    );
    render(<SharingTab tid="t1" />);

    const card = await screen.findByTestId('sharing-publication');
    const boxes = within(card).getAllByRole('checkbox');
    expect(boxes).toHaveLength(3);
    expect(boxes.every((b) => !(b as HTMLInputElement).checked)).toBe(true);

    fireEvent.click(within(card).getByLabelText(/Draws & seeded entries/));
    await waitFor(() =>
      expect(apiClient.patchEntryPagePublication).toHaveBeenCalledWith('t1', {
        drawsPublished: true,
      }),
    );
    // The card re-renders from the server's answer, not optimistic state.
    await waitFor(() =>
      expect(
        (within(card).getByLabelText(/Draws & seeded entries/) as HTMLInputElement)
          .checked,
      ).toBe(true),
    );
    expect(
      (within(card).getByLabelText(/Entrant list/) as HTMLInputElement).checked,
    ).toBe(false);
  });

  it('unpublishing sends false — the gate is reversible from the same control', async () => {
    vi.mocked(apiClient.getEntryPage).mockResolvedValue(
      entryPage({ resultsPublished: true }),
    );
    vi.mocked(apiClient.patchEntryPagePublication).mockResolvedValue(entryPage());
    render(<SharingTab tid="t1" />);

    const card = await screen.findByTestId('sharing-publication');
    fireEvent.click(within(card).getByLabelText(/Results/));
    await waitFor(() =>
      expect(apiClient.patchEntryPagePublication).toHaveBeenCalledWith('t1', {
        resultsPublished: false,
      }),
    );
  });
});

describe('SharingTab — a failed read is not an empty invite list', () => {
  beforeEach(() => {
    vi.mocked(apiClient.getDisplayToken).mockResolvedValue({
      token: 'tok-abc',
      url: '/display?token=tok-abc',
    } as never);
    vi.mocked(apiClient.getEntryPage).mockRejectedValue(
      Object.assign(new Error('404'), { response: { status: 404 } }),
    );
  });

  it('says the invites did not load, and never claims there are none', async () => {
    vi.mocked(apiClient.listInvites).mockRejectedValue(
      Object.assign(new Error('Server error 500'), { status: 500 }),
    );
    render(<SharingTab tid="t1" />);
    expect(await screen.findByTestId('invites-load-error')).toBeInTheDocument();
    expect(screen.queryByText(/no invite links yet/i)).toBeNull();
  });

  it('NEGATIVE CONTROL: a real (empty) list still reads as empty', async () => {
    vi.mocked(apiClient.listInvites).mockResolvedValue([] as never);
    render(<SharingTab tid="t1" />);
    expect(await screen.findByText(/no invite links yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('invites-load-error')).toBeNull();
  });
});
