import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SharingTab } from '../SharingTab';
import { apiClient } from '../../../api/client';

vi.mock('../../../api/client', () => ({
  apiClient: {
    listInvites: vi.fn(),
    createInvite: vi.fn(),
    revokeInvite: vi.fn(),
  },
}));

describe('SharingTab', () => {
  beforeEach(() => {
    vi.mocked(apiClient.listInvites).mockReset();
    vi.mocked(apiClient.createInvite).mockReset();
    vi.mocked(apiClient.revokeInvite).mockReset();
    vi.mocked(apiClient.listInvites).mockResolvedValue([] as never);
    vi.mocked(apiClient.createInvite).mockResolvedValue({ token: 'new' } as never);
    vi.mocked(apiClient.revokeInvite).mockResolvedValue(undefined as never);
  });

  it('shows the public display link for this workspace', () => {
    render(<SharingTab tid="t1" />);
    const input = screen.getByLabelText('Public display link') as HTMLInputElement;
    expect(input.value).toContain('/display?id=t1');
  });

  it('separates the public display link from collaborator invites with safety copy', () => {
    render(<SharingTab tid="t1" />);
    const pub = screen.getByTestId('sharing-public');
    expect(pub).toHaveTextContent(/anyone with this link/i);
    expect(within(pub).getByLabelText('Public display link')).toBeInTheDocument();
    const inv = screen.getByTestId('sharing-invites');
    expect(within(inv).getByText(/operate this workspace/i)).toBeInTheDocument();
    expect(within(inv).getByRole('button', { name: 'Create invite' })).toBeInTheDocument();
  });

  it('Create invite calls createInvite then refetches the list', async () => {
    render(<SharingTab tid="t1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Create invite' }));
    await waitFor(() =>
      expect(apiClient.createInvite).toHaveBeenCalledWith('t1', { role: 'operator' }),
    );
    expect(vi.mocked(apiClient.listInvites).mock.calls.length).toBeGreaterThanOrEqual(2);
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
