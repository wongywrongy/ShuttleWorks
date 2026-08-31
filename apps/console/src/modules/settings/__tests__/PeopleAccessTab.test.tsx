import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { PeopleAccessTab } from '../PeopleAccessTab';
import { apiClient } from '../../../api/client';

vi.mock('../../../api/client', () => ({
  apiClient: {
    listMembers: vi.fn(),
    changeMemberRole: vi.fn(),
    removeMember: vi.fn(),
    leaveTournament: vi.fn(),
    transferOwnership: vi.fn(),
    listInvites: vi.fn(),
    createInvite: vi.fn(),
    revokeInvite: vi.fn(),
  },
}));

// The tab reads the signed-in identity to decide whose row is "you" and
// what that person may do. Mocked rather than wrapped in a real
// AuthProvider so tests can vary the current user without standing up
// the whole session machinery.
let CURRENT_USER: { id: string } | null = { id: 'u-owner' };
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: CURRENT_USER, session: null, loading: false }),
}));

// The tab links to the Sharing page — renders need a router.
const render = (ui: ReactElement) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

const summary = {
  id: 't1', name: 'WS', kind: 'meet', status: 'draft', tournamentDate: null,
  createdAt: '', updatedAt: '', role: 'owner', ownerName: 'owner@x.com',
} as never;

const OWNER = {
  userId: 'u-owner', role: 'owner', joinedAt: '2026-01-01T00:00:00Z',
  email: 'owner@x.com', displayName: 'Olive Owner',
};
const OPERATOR = {
  userId: 'u-op', role: 'operator', joinedAt: '2026-01-02T00:00:00Z',
  email: 'op@x.com', displayName: 'Ossie Op',
};
const SECOND_OWNER = {
  userId: 'u-owner2', role: 'owner', joinedAt: '2026-01-03T00:00:00Z',
  email: 'two@x.com', displayName: 'Owen Two',
};

beforeEach(() => {
  vi.mocked(apiClient.listInvites).mockResolvedValue([]);
});

function mockMembers(...rows: unknown[]) {
  vi.mocked(apiClient.listMembers).mockResolvedValue(rows as never);
}

/** Open a row's "…" menu and return the menu's items. */
async function openMenu(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(await screen.findByRole('button', { name: `Actions for ${label}` }));
}

describe('PeopleAccessTab — display (pre-existing behaviour)', () => {
  beforeEach(() => {
    vi.mocked(apiClient.listMembers).mockReset();
    CURRENT_USER = { id: 'u-owner' };
  });

  it('renders the roles legend, the owner, and members from listMembers', async () => {
    mockMembers({ userId: 'u-abc', role: 'operator', joinedAt: '2026-01-01T00:00:00Z' });
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    expect(screen.getAllByText('Operator').length).toBeGreaterThan(0); // legend and invite-role option
    expect(screen.getByText(/owner@x\.com/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('member-u-abc')).toBeInTheDocument());
  });

  it('shows a short id chip + role, not the full raw UUID', async () => {
    const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    mockMembers({ userId: uuid, role: 'operator', joinedAt: '2026-01-01T00:00:00Z' });
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    const row = await screen.findByTestId(`member-${uuid}`);
    expect(row).toHaveTextContent('AAAAAAAA');
    expect(screen.queryByText(uuid)).toBeNull();
  });

  it('renders displayName when the member row carries a real identity', async () => {
    mockMembers(OPERATOR);
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    const row = await screen.findByTestId('member-u-op');
    expect(row).toHaveTextContent('Ossie Op');
  });

  it('falls back to email when there is no displayName', async () => {
    mockMembers({ ...OPERATOR, displayName: null });
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    expect(await screen.findByTestId('member-u-op')).toHaveTextContent('op@x.com');
  });

  it('keeps the short-id chip for pre-account rows (null email)', async () => {
    mockMembers({
      userId: 'deadbeef-0000-1111-2222-333344445555',
      role: 'operator', joinedAt: '2026-01-01T00:00:00Z', email: null, displayName: null,
    });
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    const row = await screen.findByTestId('member-deadbeef-0000-1111-2222-333344445555');
    expect(row).toHaveTextContent('DEADBEEF');
  });

  it('shows an empty-members hint', async () => {
    mockMembers();
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    await waitFor(() => expect(screen.getByText(/No members yet/i)).toBeInTheDocument());
  });
});

describe('PeopleAccessTab — action visibility by role', () => {
  beforeEach(() => {
    vi.mocked(apiClient.listMembers).mockReset();
    CURRENT_USER = { id: 'u-owner' };
  });

  it('an owner sees role changes, transfer and remove on another member', async () => {
    const user = userEvent.setup();
    mockMembers(OWNER, OPERATOR);
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    await screen.findByTestId('member-u-op');

    await openMenu(user, 'Ossie Op');
    expect(screen.getByTestId('transfer-u-op')).toBeInTheDocument();
    expect(screen.getByTestId('remove-u-op')).toBeInTheDocument();
    expect(screen.getByTestId('role-owner-u-op')).toBeInTheDocument();
    expect(screen.getByTestId('role-viewer-u-op')).toBeInTheDocument();
    // No "Make operator" — that is already their role.
    expect(screen.queryByTestId('role-operator-u-op')).toBeNull();
  });

  it('a non-owner sees no management actions at all — not disabled ones', async () => {
    CURRENT_USER = { id: 'u-op' };
    mockMembers(OWNER, OPERATOR);
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    await screen.findByTestId('member-u-owner');

    // Owner's row offers this viewer nothing, so no menu is rendered.
    expect(screen.queryByRole('button', { name: 'Actions for Olive Owner' })).toBeNull();
  });

  it('your own row offers Leave rather than a disabled Remove', async () => {
    const user = userEvent.setup();
    mockMembers(OWNER, SECOND_OWNER);
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    await screen.findByTestId('member-u-owner');

    await openMenu(user, 'Olive Owner');
    expect(screen.getByTestId('leave-u-owner')).toBeInTheDocument();
    expect(screen.queryByTestId('remove-u-owner')).toBeNull();
    // Nor an offer to transfer the workspace to yourself.
    expect(screen.queryByTestId('transfer-u-owner')).toBeNull();
  });

  it('a non-owner can still leave their own row', async () => {
    const user = userEvent.setup();
    CURRENT_USER = { id: 'u-op' };
    mockMembers(OWNER, OPERATOR);
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    await screen.findByTestId('member-u-op');

    await openMenu(user, 'Ossie Op');
    expect(screen.getByTestId('leave-u-op')).toBeInTheDocument();
    expect(screen.queryByTestId('remove-u-op')).toBeNull();
  });
});

describe('PeopleAccessTab — last-owner guard', () => {
  beforeEach(() => {
    vi.mocked(apiClient.listMembers).mockReset();
    CURRENT_USER = { id: 'u-owner' };
  });

  it('keeps the reason off the resting card — it surfaces on attempt (WSM-1)', async () => {
    const user = userEvent.setup();
    mockMembers(OWNER, OPERATOR); // exactly one owner
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    await screen.findByTestId('member-u-owner');
    // The last-owner rule used to sit as a standing third line on the owner's
    // own card — a warning about an action nobody had taken.
    expect(screen.queryByTestId('member-reason-u-owner')).toBeNull();
    // On attempt, the blocked item itself carries the rule and the way out.
    await openMenu(user, 'Olive Owner');
    expect(screen.getByTestId('role-viewer-u-owner').getAttribute('aria-label')).toMatch(
      /at least one owner/i,
    );
  });

  it('marks the blocked demotion aria-disabled, keeping it focusable', async () => {
    const user = userEvent.setup();
    mockMembers(OWNER, OPERATOR);
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    await screen.findByTestId('member-u-owner');

    await openMenu(user, 'Olive Owner');
    const demote = screen.getByTestId('role-viewer-u-owner');
    expect(demote).toHaveAttribute('aria-disabled', 'true');
    // aria-disabled, NOT the disabled attribute — the item must stay in
    // the tab order so the reason reaches keyboard users.
    expect(demote).not.toBeDisabled();
    expect(demote.getAttribute('aria-label')).toMatch(/at least one owner/i);
  });

  it('blocks the sole owner from leaving', async () => {
    const user = userEvent.setup();
    mockMembers(OWNER, OPERATOR);
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    await screen.findByTestId('member-u-owner');

    await openMenu(user, 'Olive Owner');
    const leave = screen.getByTestId('leave-u-owner');
    expect(leave).toHaveAttribute('aria-disabled', 'true');

    await user.click(leave);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(apiClient.leaveTournament).not.toHaveBeenCalled();
  });

  it('degrades cleanly in local mode — the lone bootstrap owner', async () => {
    // Verified against a real AUTH_MODE=local backend: the bootstrap
    // identity is the sole member and sole owner, and both `leave` and
    // self-demote answer 409 MEMBER_LAST_OWNER. The UI must block them
    // before the call, explain why, and offer nothing that would fail.
    const user = userEvent.setup();
    CURRENT_USER = { id: '00000000-0000-0000-0000-000000000000' };
    mockMembers({
      userId: '00000000-0000-0000-0000-000000000000',
      role: 'owner',
      joinedAt: '2026-01-01T00:00:00Z',
      email: 'local@dev',
      displayName: null,
    });
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    await screen.findByTestId('member-00000000-0000-0000-0000-000000000000');

    // No resting warning on the lone bootstrap owner either (WSM-1).
    expect(
      screen.queryByTestId('member-reason-00000000-0000-0000-0000-000000000000'),
    ).toBeNull();

    await openMenu(user, 'local@dev');
    // Nothing offered here can succeed, so nothing is left actionable.
    for (const t of ['leave', 'role-viewer', 'role-operator']) {
      const el = screen.queryByTestId(`${t}-00000000-0000-0000-0000-000000000000`);
      if (el) expect(el).toHaveAttribute('aria-disabled', 'true');
    }
    // And no request is ever attempted.
    await user.click(screen.getByTestId('leave-00000000-0000-0000-0000-000000000000'));
    expect(apiClient.leaveTournament).not.toHaveBeenCalled();
  });

  it('allows demotion once a second owner exists', async () => {
    const user = userEvent.setup();
    mockMembers(OWNER, SECOND_OWNER);
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    await screen.findByTestId('member-u-owner');

    expect(screen.queryByTestId('member-reason-u-owner')).toBeNull();
    await openMenu(user, 'Olive Owner');
    expect(screen.getByTestId('role-viewer-u-owner')).not.toHaveAttribute('aria-disabled');
  });
});

describe('PeopleAccessTab — confirmation', () => {
  beforeEach(() => {
    vi.mocked(apiClient.listMembers).mockReset();
    vi.mocked(apiClient.removeMember).mockReset().mockResolvedValue(undefined as never);
    vi.mocked(apiClient.transferOwnership).mockReset().mockResolvedValue(undefined as never);
    CURRENT_USER = { id: 'u-owner' };
  });

  it('requires confirmation before removing, and cancel calls nothing', async () => {
    const user = userEvent.setup();
    mockMembers(OWNER, OPERATOR);
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    await screen.findByTestId('member-u-op');

    await openMenu(user, 'Ossie Op');
    await user.click(screen.getByTestId('remove-u-op'));

    const dialog = await screen.findByRole('dialog');
    expect(apiClient.removeMember).not.toHaveBeenCalled();
    expect(within(dialog).getByTestId('confirm-body')).toHaveTextContent(/immediately lose access/i);

    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));
    expect(apiClient.removeMember).not.toHaveBeenCalled();
  });

  it('removes after confirmation and refetches once', async () => {
    const user = userEvent.setup();
    mockMembers(OWNER, OPERATOR);
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    await screen.findByTestId('member-u-op');
    const initialFetches = vi.mocked(apiClient.listMembers).mock.calls.length;

    await openMenu(user, 'Ossie Op');
    await user.click(screen.getByTestId('remove-u-op'));
    await user.click(await screen.findByTestId('confirm-action'));

    await waitFor(() => expect(apiClient.removeMember).toHaveBeenCalledWith('t1', 'u-op'));
    await waitFor(() =>
      expect(vi.mocked(apiClient.listMembers).mock.calls.length).toBe(initialFetches + 1),
    );
  });

  it('transfer confirmation names the recipient and states irreversibility', async () => {
    const user = userEvent.setup();
    mockMembers(OWNER, OPERATOR);
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    await screen.findByTestId('member-u-op');

    await openMenu(user, 'Ossie Op');
    await user.click(screen.getByTestId('transfer-u-op'));

    const body = await screen.findByTestId('confirm-body');
    expect(body).toHaveTextContent('Ossie Op');
    expect(body).toHaveTextContent(/become an operator/i);
    expect(body).toHaveTextContent(/not be able to reverse this/i);
  });

  it('leave confirmation warns that rejoining needs a new invite', async () => {
    const user = userEvent.setup();
    mockMembers(OWNER, SECOND_OWNER);
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    await screen.findByTestId('member-u-owner');

    await openMenu(user, 'Olive Owner');
    await user.click(screen.getByTestId('leave-u-owner'));
    expect(await screen.findByTestId('confirm-body')).toHaveTextContent(/new invite/i);
  });

  it('a FAILED leave does not log the user out', async () => {
    // `run()` swallows errors so it can render them inline, which means
    // `await run(...)` resolves on failure too. The session-expired
    // dispatch used to fire unconditionally right after it — so a
    // refused leave (last-owner, 403, or a network blip) showed the
    // error AND bounced the user to /login, out of a workspace they
    // were still a member of.
    const user = userEvent.setup();
    mockMembers(OWNER, SECOND_OWNER);
    vi.mocked(apiClient.leaveTournament).mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'MEMBER_LAST_OWNER', status: 409 }),
    );
    const onExpired = vi.fn();
    window.addEventListener('sw:session-expired', onExpired);

    try {
      render(<PeopleAccessTab tid="t1" summary={summary} />);
      await screen.findByTestId('member-u-owner');
      await openMenu(user, 'Olive Owner');
      await user.click(screen.getByTestId('leave-u-owner'));
      await user.click(await screen.findByTestId('confirm-action'));

      await waitFor(() => expect(apiClient.leaveTournament).toHaveBeenCalled());
      expect(onExpired).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('sw:session-expired', onExpired);
    }
  });

  it('a SUCCESSFUL leave still logs the user out', async () => {
    // The other half of the guard: fixing the failure path must not
    // break the redirect that the success path depends on.
    const user = userEvent.setup();
    mockMembers(OWNER, SECOND_OWNER);
    vi.mocked(apiClient.leaveTournament).mockResolvedValue(undefined as never);
    const onExpired = vi.fn();
    window.addEventListener('sw:session-expired', onExpired);

    try {
      render(<PeopleAccessTab tid="t1" summary={summary} />);
      await screen.findByTestId('member-u-owner');
      await openMenu(user, 'Olive Owner');
      await user.click(screen.getByTestId('leave-u-owner'));
      await user.click(await screen.findByTestId('confirm-action'));

      await waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1));
    } finally {
      window.removeEventListener('sw:session-expired', onExpired);
    }
  });

  it('dialog is focus-trapped, Escape-dismissible, and returns focus', async () => {
    const user = userEvent.setup();
    mockMembers(OWNER, OPERATOR);
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    await screen.findByTestId('member-u-op');

    const trigger = screen.getByRole('button', { name: 'Actions for Ossie Op' });
    await user.click(trigger);
    await user.click(screen.getByTestId('remove-u-op'));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // Named by its visible heading rather than a generic label.
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    // The confirm verb is specific, never "Proceed"/"OK".
    expect(within(dialog).getByTestId('confirm-action')).toHaveTextContent('Remove member');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(apiClient.removeMember).not.toHaveBeenCalled();
  });
});

describe('PeopleAccessTab — error handling', () => {
  beforeEach(() => {
    vi.mocked(apiClient.listMembers).mockReset();
    vi.mocked(apiClient.changeMemberRole).mockReset();
    vi.mocked(apiClient.removeMember).mockReset();
    CURRENT_USER = { id: 'u-owner' };
  });

  function apiError(extra: Record<string, unknown>) {
    return Object.assign(new Error('boom'), extra);
  }

  it('renders MEMBER_LAST_OWNER specifically and refetches (the stale-tab path)', async () => {
    const user = userEvent.setup();
    // The tab believes there are two owners; the server disagrees.
    mockMembers(OWNER, SECOND_OWNER);
    vi.mocked(apiClient.changeMemberRole).mockRejectedValue(
      apiError({ code: 'MEMBER_LAST_OWNER', status: 409 }),
    );
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    await screen.findByTestId('member-u-owner');
    const before = vi.mocked(apiClient.listMembers).mock.calls.length;

    await openMenu(user, 'Olive Owner');
    await user.click(screen.getByTestId('role-viewer-u-owner'));

    const err = await screen.findByTestId('member-error');
    expect(err).toHaveTextContent(/at least one owner/i);
    expect(err).toHaveTextContent(/transfer ownership/i);
    // Generic failure copy would waste the invariant.
    expect(err).not.toHaveTextContent(/try again/i);
    await waitFor(() =>
      expect(vi.mocked(apiClient.listMembers).mock.calls.length).toBe(before + 1),
    );
  });

  it('refetches on 404 without speculating about why', async () => {
    const user = userEvent.setup();
    mockMembers(OWNER, OPERATOR);
    vi.mocked(apiClient.removeMember).mockRejectedValue(apiError({ status: 404 }));
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    await screen.findByTestId('member-u-op');
    const before = vi.mocked(apiClient.listMembers).mock.calls.length;

    await openMenu(user, 'Ossie Op');
    await user.click(screen.getByTestId('remove-u-op'));
    await user.click(await screen.findByTestId('confirm-action'));

    expect(await screen.findByTestId('member-error')).toHaveTextContent(/no longer part of/i);
    await waitFor(() =>
      expect(vi.mocked(apiClient.listMembers).mock.calls.length).toBe(before + 1),
    );
  });

  it('refetches on 403 and says the role changed', async () => {
    const user = userEvent.setup();
    mockMembers(OWNER, OPERATOR);
    vi.mocked(apiClient.removeMember).mockRejectedValue(apiError({ status: 403 }));
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    await screen.findByTestId('member-u-op');
    const before = vi.mocked(apiClient.listMembers).mock.calls.length;

    await openMenu(user, 'Ossie Op');
    await user.click(screen.getByTestId('remove-u-op'));
    await user.click(await screen.findByTestId('confirm-action'));

    expect(await screen.findByTestId('member-error')).toHaveTextContent(/role.*changed/i);
    await waitFor(() =>
      expect(vi.mocked(apiClient.listMembers).mock.calls.length).toBe(before + 1),
    );
  });

  it('leaves the row unchanged on failure — no optimistic residue', async () => {
    const user = userEvent.setup();
    mockMembers(OWNER, OPERATOR);
    vi.mocked(apiClient.changeMemberRole).mockRejectedValue(
      apiError({ status: 500, message: 'Server error 500' }),
    );
    render(<PeopleAccessTab tid="t1" summary={summary} />);
    await screen.findByTestId('member-u-op');

    await openMenu(user, 'Ossie Op');
    await user.click(screen.getByTestId('role-viewer-u-op'));

    await screen.findByTestId('member-error');
    // The row still reads "operator" — nothing was applied locally, so
    // there is nothing to roll back.
    expect(screen.getByTestId('member-u-op')).toHaveTextContent('operator');
  });
});

/**
 * Sibling of the Entries-desk defect (2026-08-10 browser pass): a rejected
 * fetch was turned into an empty collection and rendered as fact. Here the
 * lie is louder — a workspace ALWAYS has at least an owner, so "No members
 * yet" is a state that cannot exist. It also poisons `currentUserRole`,
 * which is derived from this list and gates every action in the menu.
 */
describe('PeopleAccessTab — a failed read is not an empty workspace', () => {
  beforeEach(() => {
    vi.mocked(apiClient.listMembers).mockReset();
    CURRENT_USER = { id: 'u-owner' };
  });

  it('says the members did not load, and never claims there are none', async () => {
    vi.mocked(apiClient.listMembers).mockRejectedValue(
      Object.assign(new Error('Server error 500'), { status: 500 }),
    );
    render(<PeopleAccessTab tid="t1" summary={summary} />);

    expect(await screen.findByTestId('members-load-error')).toBeInTheDocument();
    expect(screen.queryByText(/no members yet/i)).toBeNull();
  });

  it('NEGATIVE CONTROL: a real (empty) list still reads as empty', async () => {
    mockMembers();
    render(<PeopleAccessTab tid="t1" summary={summary} />);

    expect(await screen.findByText(/no members yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('members-load-error')).toBeNull();
  });
});
