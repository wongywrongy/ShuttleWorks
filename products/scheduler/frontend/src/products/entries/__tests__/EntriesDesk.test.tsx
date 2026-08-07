/**
 * The Entries desk (SP-E1-1, Phase D).
 *
 * The desk is the operator's half of the walking skeleton: an entry that has
 * landed in the database is worth nothing until someone can see it, confirm
 * it, and push it onto the roster. These tests cover exactly that pipe —
 * list, the one confirm transition ruling D1 allows, and the commit summary.
 *
 * They deliberately do NOT cover a reject/promote/withdraw affordance: those
 * are E2, and a test asserting their absence is what keeps the scope line
 * visible to the next session.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntriesDesk } from '../EntriesDesk';
import { apiClient } from '../../../api/client';
import { useUiStore } from '../../../store/uiStore';
import type { EntryDTO } from '../../../api/dto';

function entry(partial: Partial<EntryDTO> & { id: string }): EntryDTO {
  return {
    entryEventId: 'ev-1',
    eventCode: 'MS',
    state: 'pending',
    pendingReasons: [],
    contactName: 'Parent One',
    contactEmail: 'parent@club.org',
    playerName: 'Alice Chen',
    remarks: null,
    listOptOut: false,
    committedPlayerId: null,
    submittedAt: '2026-08-06T10:00:00Z',
    withdrawnAt: null,
    ...partial,
  };
}

const row = (id: string) => screen.getByTestId(`entry-row-${id}`);

beforeEach(() => {
  useUiStore.setState({ activeTournamentRole: 'owner', toasts: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EntriesDesk — the list', () => {
  it('renders the entrant, their event, state and remarks', async () => {
    vi.spyOn(apiClient, 'listEntries').mockResolvedValue([
      entry({
        id: 'e-1',
        playerName: 'Alice Chen',
        eventCode: 'MS',
        state: 'pending',
        remarks: "can't play before 6pm Saturday",
      }),
    ]);

    render(<EntriesDesk tid="t-1" />);

    const r = await screen.findByTestId('entry-row-e-1');
    expect(within(r).getByText('Alice Chen')).toBeInTheDocument();
    expect(within(r).getByText('MS')).toBeInTheDocument();
    expect(within(r).getByText('Pending')).toBeInTheDocument();
    expect(
      within(r).getByText("can't play before 6pm Saturday"),
    ).toBeInTheDocument();
  });

  it('shows the contact email — this is the operator surface, not the public one', async () => {
    // The public entrant list is a strict projection (names + events only).
    // The desk is the opposite: the operator is the person who has to email
    // someone back about a clash, so withholding it here would be theatre.
    vi.spyOn(apiClient, 'listEntries').mockResolvedValue([
      entry({ id: 'e-1', contactEmail: 'parent@club.org' }),
    ]);

    render(<EntriesDesk tid="t-1" />);

    expect(await screen.findByText('parent@club.org')).toBeInTheDocument();
  });

  it('flags a needs_review entry with an attention chip', async () => {
    vi.spyOn(apiClient, 'listEntries').mockResolvedValue([
      entry({ id: 'e-flagged', pendingReasons: ['needs_review'] }),
      entry({ id: 'e-clean', pendingReasons: [] }),
    ]);

    render(<EntriesDesk tid="t-1" />);
    await screen.findByTestId('entry-row-e-flagged');

    expect(
      within(row('e-flagged')).getByText('Needs review'),
    ).toBeInTheDocument();
    // NEGATIVE CONTROL: the chip is driven by the reason, not painted on
    // every row. Without this, a chip rendered unconditionally would pass.
    expect(within(row('e-clean')).queryByText('Needs review')).toBeNull();
  });

  it('renders an empty state when nothing has been submitted', async () => {
    vi.spyOn(apiClient, 'listEntries').mockResolvedValue([]);

    render(<EntriesDesk tid="t-1" />);

    expect(await screen.findByText(/no entries yet/i)).toBeInTheDocument();
  });
});

describe('EntriesDesk — the confirm action (ruling D1)', () => {
  it('offers Confirm on a pending entry and not on a confirmed one', async () => {
    vi.spyOn(apiClient, 'listEntries').mockResolvedValue([
      entry({ id: 'e-pending', state: 'pending' }),
      entry({ id: 'e-done', state: 'confirmed' }),
    ]);

    render(<EntriesDesk tid="t-1" />);
    await screen.findByTestId('entry-row-e-pending');

    expect(
      within(row('e-pending')).getByRole('button', { name: 'Confirm' }),
    ).toBeInTheDocument();
    // NEGATIVE CONTROL for the state gate: the backend answers 409 on a
    // non-pending confirm, so an always-rendered button would hand the
    // operator a control whose only outcome is an error toast.
    expect(
      within(row('e-done')).queryByRole('button', { name: 'Confirm' }),
    ).toBeNull();
  });

  it('confirms through the API and re-reads the list', async () => {
    const list = vi
      .spyOn(apiClient, 'listEntries')
      .mockResolvedValueOnce([entry({ id: 'e-1', state: 'pending' })])
      .mockResolvedValueOnce([entry({ id: 'e-1', state: 'confirmed' })]);
    const confirm = vi
      .spyOn(apiClient, 'confirmEntry')
      .mockResolvedValue(entry({ id: 'e-1', state: 'confirmed' }));

    render(<EntriesDesk tid="t-1" />);
    await screen.findByTestId('entry-row-e-1');

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(confirm).toHaveBeenCalledWith('t-1', 'e-1'));
    // Re-read rather than patch in place: the confirm can change more than
    // the state (it is the server's row that is authoritative).
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Confirmed')).toBeInTheDocument();
  });

  it('ships no reject / promote / withdraw affordance (E2 scope line)', async () => {
    vi.spyOn(apiClient, 'listEntries').mockResolvedValue([
      entry({ id: 'e-1', state: 'pending' }),
    ]);

    render(<EntriesDesk tid="t-1" />);
    await screen.findByTestId('entry-row-e-1');

    for (const name of [/reject/i, /promote/i, /withdraw/i]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });
});

describe('EntriesDesk — the commit summary', () => {
  it('reports what was committed', async () => {
    vi.spyOn(apiClient, 'listEntries').mockResolvedValue([
      entry({ id: 'e-1', state: 'confirmed' }),
    ]);
    const commit = vi.spyOn(apiClient, 'commitEntries').mockResolvedValue({
      committed: [{ id: 'e-1', playerId: 'p-1' }],
      skipped: [],
    });

    render(<EntriesDesk tid="t-1" />);
    await screen.findByTestId('entry-row-e-1');

    await userEvent.click(
      screen.getByRole('button', { name: /commit to roster/i }),
    );

    await waitFor(() => expect(commit).toHaveBeenCalledWith('t-1'));
    const summary = await screen.findByTestId('entries-commit-summary');
    expect(within(summary).getByText(/1 committed/i)).toBeInTheDocument();
    expect(within(summary).queryByText(/skipped/i)).toBeNull();
  });

  it('lists every skipped entry with its reason spelled out', async () => {
    vi.spyOn(apiClient, 'listEntries').mockResolvedValue([
      entry({ id: 'e-1', state: 'confirmed', playerName: 'Alice Chen' }),
      entry({
        id: 'e-2',
        state: 'confirmed',
        playerName: 'Bo Lin',
        eventCode: 'XD9',
      }),
    ]);
    vi.spyOn(apiClient, 'commitEntries').mockResolvedValue({
      committed: [{ id: 'e-1', playerId: 'p-1' }],
      skipped: [{ id: 'e-2', reason: 'UNMAPPABLE_EVENT' }],
    });

    render(<EntriesDesk tid="t-1" />);
    await screen.findByTestId('entry-row-e-1');

    await userEvent.click(
      screen.getByRole('button', { name: /commit to roster/i }),
    );

    const summary = await screen.findByTestId('entries-commit-summary');
    expect(within(summary).getByText(/1 committed/i)).toBeInTheDocument();
    // The skip must name the ENTRANT, not just an opaque uuid — the operator
    // has to go find that person's event code and fix it.
    expect(within(summary).getByText(/Bo Lin/)).toBeInTheDocument();
    expect(
      within(summary).getByText(/no match in this workspace/i),
    ).toBeInTheDocument();
  });

  it('says so plainly when a re-run commits nothing (the seam is idempotent)', async () => {
    vi.spyOn(apiClient, 'listEntries').mockResolvedValue([
      entry({ id: 'e-1', state: 'confirmed', committedPlayerId: 'p-1' }),
    ]);
    vi.spyOn(apiClient, 'commitEntries').mockResolvedValue({
      committed: [],
      skipped: [],
    });

    render(<EntriesDesk tid="t-1" />);
    await screen.findByTestId('entry-row-e-1');

    await userEvent.click(
      screen.getByRole('button', { name: /commit to roster/i }),
    );

    const summary = await screen.findByTestId('entries-commit-summary');
    expect(within(summary).getByText(/nothing new/i)).toBeInTheDocument();
  });
});

describe('EntriesDesk — the write gate', () => {
  it('a viewer gets no Confirm and no Commit', async () => {
    // Fails closed the same way every other surface does (audit A2): the
    // routes are operator-guarded server-side, so leaving the controls live
    // would only ever produce a 403 toast.
    useUiStore.setState({ activeTournamentRole: 'viewer' });
    vi.spyOn(apiClient, 'listEntries').mockResolvedValue([
      entry({ id: 'e-1', state: 'pending' }),
    ]);

    render(<EntriesDesk tid="t-1" />);
    await screen.findByTestId('entry-row-e-1');

    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(screen.queryByRole('button', { name: /commit to roster/i })).toBeNull();
  });
});
