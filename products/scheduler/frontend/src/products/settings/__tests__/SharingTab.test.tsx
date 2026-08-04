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
  },
}));

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
  });

  it('shows the capability display link fetched from getDisplayToken', async () => {
    render(<SharingTab tid="t1" />);
    const input = screen.getByLabelText('Public display link') as HTMLInputElement;
    await waitFor(() => expect(input.value).toContain('/display?token=tok-abc'));
    expect(apiClient.getDisplayToken).toHaveBeenCalledWith('t1');
    expect(input.value).not.toContain('?id=');
  });

  it('Rotate link swaps in the new token from rotateDisplayToken', async () => {
    render(<SharingTab tid="t1" />);
    const input = screen.getByLabelText('Public display link') as HTMLInputElement;
    await waitFor(() => expect(input.value).toContain('tok-abc'));
    fireEvent.click(screen.getByRole('button', { name: 'Rotate link' }));
    await waitFor(() => expect(input.value).toContain('/display?token=tok-new'));
    expect(apiClient.rotateDisplayToken).toHaveBeenCalledWith('t1');
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
