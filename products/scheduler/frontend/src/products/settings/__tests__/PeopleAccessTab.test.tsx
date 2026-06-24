import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PeopleAccessTab } from '../PeopleAccessTab';
import { apiClient } from '../../../api/client';

vi.mock('../../../api/client', () => ({ apiClient: { listMembers: vi.fn() } }));

const summary = {
  id: 't1', name: 'WS', kind: 'meet', status: 'draft', tournamentDate: null,
  createdAt: '', updatedAt: '', role: 'owner', ownerName: 'owner@x.com',
} as never;

describe('PeopleAccessTab', () => {
  beforeEach(() => vi.mocked(apiClient.listMembers).mockReset());

  it('renders the roles legend, the owner, and members from listMembers', async () => {
    vi.mocked(apiClient.listMembers).mockResolvedValue([
      { userId: 'u-abc', role: 'operator', joinedAt: '2026-01-01T00:00:00Z' },
    ] as never);
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    expect(screen.getByText('Operator')).toBeInTheDocument(); // legend entry
    expect(screen.getByText(/owner@x\.com/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('member-u-abc')).toBeInTheDocument());
  });

  it('shows a short id chip + role, not the full raw UUID', async () => {
    const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    vi.mocked(apiClient.listMembers).mockResolvedValue([
      { userId: uuid, role: 'operator', joinedAt: '2026-01-01T00:00:00Z' },
    ] as never);
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    const row = await screen.findByTestId(`member-${uuid}`);
    expect(row).toHaveTextContent('AAAAAAAA'); // short id chip
    expect(screen.queryByText(uuid)).toBeNull(); // full UUID never shown as text
  });

  it('shows an empty-members hint', async () => {
    vi.mocked(apiClient.listMembers).mockResolvedValue([] as never);
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    await waitFor(() =>
      expect(screen.getByText(/No members yet/i)).toBeInTheDocument(),
    );
  });
});
