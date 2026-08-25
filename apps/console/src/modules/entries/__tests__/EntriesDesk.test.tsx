/**
 * The Entries desk (SP-E1-1 Phase D, reshaped by SP-E1-2 Phase D).
 *
 * The desk is the operator's half of the walking skeleton: an entry that has
 * landed in the database is worth nothing until someone can see it, confirm
 * it, and push it onto the roster. These tests cover exactly that pipe —
 * list, the one confirm transition ruling D1 allows, and the commit summary.
 *
 * They deliberately do NOT cover a reject/promote/withdraw affordance: those
 * are E2, and a test asserting their absence is what keeps the scope line
 * visible to the next session.
 *
 * **Unwound by ruling R13.** `contactName` / `contactEmail` were fields on an
 * entry row and are now one hop out, under the submission. The test that
 * asserted the desk shows the contact address is not deleted — it moves to
 * where the address moved, onto the act's band, and gains the grouping claim
 * that is the actual point of the level: entries that arrived on one form
 * are shown as one form.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntriesDesk } from '../EntriesDesk';
import { apiClient } from '../../../api/client';
import { useUiStore } from '../../../store/uiStore';
import type { EntryDTO, EntrySubmissionDTO } from '../../../api/dto';

function submission(
  partial: Partial<EntrySubmissionDTO> = {},
): EntrySubmissionDTO {
  return {
    id: 'sub-1',
    accountEmail: 'parent@club.org',
    accountName: null,
    feeTotalCents: null,
    submittedAt: '2026-08-06T10:00:00Z',
    ...partial,
  };
}

function entry(partial: Partial<EntryDTO> & { id: string }): EntryDTO {
  return {
    entryEventId: 'ev-1',
    eventCode: 'MS',
    state: 'pending',
    pendingReasons: [],
    submission: submission(),
    playerName: 'Alice Chen',
    entryPlayerId: null,
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

  // Design audit T7 / WCAG 1.3.1: the desk is a data-dense reading view, and
  // built from bare div/span it gave a screen reader a flat run of text with
  // no programmatic link between an entrant and their state.
  it('exposes the desk as a table — an entrant and their state are one row', async () => {
    vi.spyOn(apiClient, 'listEntries').mockResolvedValue([
      entry({ id: 'e-1', playerName: 'Alice Chen', eventCode: 'MS', state: 'pending' }),
    ]);

    render(<EntriesDesk tid="t-1" />);
    const r = await screen.findByTestId('entry-row-e-1');

    expect(screen.getByRole('table')).toContainElement(r);
    expect(r).toHaveAttribute('role', 'row');
    const cells = within(r).getAllByRole('cell');
    expect(cells).toHaveLength(6);
    expect(cells[0]).toHaveTextContent('Alice Chen');
    expect(cells[2]).toHaveTextContent('Pending');
    expect(screen.getAllByRole('columnheader').map((c) => c.textContent)).toEqual([
      'Entrant',
      'Event',
      'State',
      'Attention',
      'Remarks',
      '',
    ]);
  });

  it('shows the submitting address on the act — the operator surface, not the public one', async () => {
    // The public entrant list is a strict projection (names + events only).
    // The desk is the opposite: the operator is the person who has to email
    // someone back about a clash, so withholding it here would be theatre.
    //
    // R13 moved WHERE it is shown, not WHETHER: the address belongs to the
    // act, so it is on the band once instead of on every row of the form.
    vi.spyOn(apiClient, 'listEntries').mockResolvedValue([
      entry({
        id: 'e-1',
        submission: submission({ accountEmail: 'parent@club.org' }),
      }),
    ]);

    render(<EntriesDesk tid="t-1" />);

    expect(await screen.findByText(/parent@club\.org/)).toBeInTheDocument();
  });

  it('bands entries that arrived on one form, and separates ones that did not', async () => {
    // The case the submission level exists for: a parent entering two
    // children in one sitting. Before R13 an operator inferred this from a
    // repeated email address — ambiguous exactly when it mattered, since one
    // account is *expected* to submit many times.
    vi.spyOn(apiClient, 'listEntries').mockResolvedValue([
      entry({ id: 'e-1', playerName: 'Alice Chen', submission: submission() }),
      entry({ id: 'e-2', playerName: 'Bo Chen', submission: submission() }),
      entry({
        id: 'e-3',
        playerName: 'Unrelated Person',
        submission: submission({ id: 'sub-2', accountEmail: 'other@club.org' }),
      }),
    ]);

    render(<EntriesDesk tid="t-1" />);
    await screen.findByTestId('entry-row-e-1');

    const first = screen.getByTestId('entry-act-sub-1');
    expect(within(first).getByText(/parent@club\.org/)).toBeInTheDocument();
    // The count is the band's, so two children on one form read as one act.
    expect(within(first).getByText('2')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('entry-act-sub-2')).getByText(/other@club\.org/),
    ).toBeInTheDocument();
  });

  it("shows the act's fee total once, not per entry", async () => {
    // Tiered pricing prices the PERSON, not the event: two events for one
    // player cost one total between them. A per-row fee would read as two
    // charges.
    vi.spyOn(apiClient, 'listEntries').mockResolvedValue([
      entry({ id: 'e-1', submission: submission({ feeTotalCents: 5500 }) }),
      entry({ id: 'e-2', submission: submission({ feeTotalCents: 5500 }) }),
    ]);

    render(<EntriesDesk tid="t-1" />);
    await screen.findByTestId('entry-row-e-1');

    expect(screen.getAllByText(/55\.00/)).toHaveLength(1);
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

  it('flags a gender mismatch, and does not refuse it', async () => {
    // Q14 §5: the form filters by gender and offers an override; a mismatch
    // that comes through is ACCEPTED and flagged. So the desk's job is to
    // show a normal, actionable row wearing a chip — not to hide it or mark
    // it broken.
    vi.spyOn(apiClient, 'listEntries').mockResolvedValue([
      entry({ id: 'e-x', pendingReasons: ['gender_mismatch'] }),
      entry({ id: 'e-clean', pendingReasons: [] }),
    ]);

    render(<EntriesDesk tid="t-1" />);
    await screen.findByTestId('entry-row-e-x');

    expect(within(row('e-x')).getByText('Gender mismatch')).toBeInTheDocument();
    // …and it is still confirmable: the operator decides (invariant I4).
    expect(
      within(row('e-x')).getByRole('button', { name: 'Confirm' }),
    ).toBeInTheDocument();
    // NEGATIVE CONTROL: driven by the reason, not painted on every row.
    expect(within(row('e-clean')).queryByText('Gender mismatch')).toBeNull();
  });

  it('renders an empty state when nothing has been submitted', async () => {
    vi.spyOn(apiClient, 'listEntries').mockResolvedValue([]);

    render(<EntriesDesk tid="t-1" />);

    expect(await screen.findByText(/no entries yet/i)).toBeInTheDocument();
  });
});

/**
 * A failed read is not an empty desk (2026-08-10 full-scale browser pass).
 *
 * `GET /tournaments/{id}/entries` 500'd and the desk rendered
 * "0 submitted · No entries yet" — on a workspace with 54 real submissions.
 * The organiser was told nobody had entered their tournament. A dropped
 * request is normal in the deployment this product is built for (a laptop
 * sleeping, sports-hall wifi, a restart mid-event), so the count of entries
 * has to be *unknown* when the read fails, never zero.
 */
describe('EntriesDesk — a failed read is not an empty desk', () => {
  it('says the list did not load, and never claims zero entries', async () => {
    vi.spyOn(apiClient, 'listEntries').mockRejectedValue(
      Object.assign(new Error('Internal Server Error'), { status: 500 }),
    );

    render(<EntriesDesk tid="t-1" />);

    expect(await screen.findByTestId('entries-load-error')).toBeInTheDocument();
    // The two lies this replaces, verbatim from the browser pass.
    expect(screen.queryByText(/no entries yet/i)).toBeNull();
    expect(screen.queryByText(/0 submitted/i)).toBeNull();
  });

  it('re-reads from the failure state, and stops claiming failure once it lands', async () => {
    const list = vi
      .spyOn(apiClient, 'listEntries')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([entry({ id: 'e-1' })]);

    render(<EntriesDesk tid="t-1" />);
    await screen.findByTestId('entries-load-error');

    await userEvent.click(screen.getByRole('button', { name: /retry/i }));

    expect(await screen.findByTestId('entry-row-e-1')).toBeInTheDocument();
    expect(screen.queryByTestId('entries-load-error')).toBeNull();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('NEGATIVE CONTROL: a genuine zero still reads as a genuine zero', async () => {
    // Without this, "always show the failure banner" would pass the two tests
    // above and destroy the empty state the desk is supposed to have.
    vi.spyOn(apiClient, 'listEntries').mockResolvedValue([]);

    render(<EntriesDesk tid="t-1" />);

    expect(await screen.findByText(/no entries yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('entries-load-error')).toBeNull();
    expect(screen.getByText(/0 submitted/i)).toBeInTheDocument();
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

  // The test that used to sit here asserted the ABSENCE of reject / promote /
  // withdraw — E1's scope line, made visible on purpose. E2 (program Phase 7)
  // ships all three, so the assertion is inverted rather than deleted: the
  // scope line moved, and these are what it moved to.

  it('offers each transition only from a state it is legal in', async () => {
    // The desk draws from `state` alone. The SERVER refuses regardless (the
    // 409 carries its own reason) — this only avoids offering a control
    // whose one possible outcome is a toast.
    vi.spyOn(apiClient, 'listEntries').mockResolvedValue([
      entry({ id: 'e-pending', state: 'pending' }),
      entry({ id: 'e-queued', state: 'waitlisted' }),
      entry({ id: 'e-done', state: 'confirmed' }),
      entry({ id: 'e-gone', state: 'withdrawn' }),
    ]);

    render(<EntriesDesk tid="t-1" />);
    await screen.findByTestId('entry-row-e-pending');

    const actions = (id: string) =>
      within(screen.getByTestId(`entry-row-${id}`))
        .queryAllByRole('button')
        .map((b) => b.textContent);

    expect(actions('e-pending')).toEqual(['Confirm', 'Reject', 'Withdraw']);
    // Promote first on a queued row: it is what an operator is looking for
    // there, and confirm is refused until it happens.
    expect(actions('e-queued')).toEqual(['Promote', 'Reject', 'Withdraw']);
    // A confirmed entry may be on a roster and in a draw — withdrawing says
    // what happens to the player; rejecting would pretend it was never taken.
    expect(actions('e-done')).toEqual(['Withdraw']);
    // Terminal. Nothing to offer.
    expect(actions('e-gone')).toEqual([]);
  });

  it('arms the terminal actions before running them', async () => {
    // `window.confirm` is banned product-wide (2026-07-11 interaction audit).
    // The canon replacement is the two-click arm, and this asserts a single
    // press does NOT reject — the defect the arm exists to prevent.
    vi.spyOn(apiClient, 'listEntries').mockResolvedValue([
      entry({ id: 'e-1', state: 'pending' }),
    ]);
    const reject = vi
      .spyOn(apiClient, 'rejectEntry')
      .mockResolvedValue(entry({ id: 'e-1', state: 'rejected' }));

    render(<EntriesDesk tid="t-1" />);
    await screen.findByTestId('entry-row-e-1');

    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(reject).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Reject?' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reject?' }));
    await waitFor(() => expect(reject).toHaveBeenCalledWith('t-1', 'e-1'));
  });

  it('promotes through the API and re-reads', async () => {
    const list = vi
      .spyOn(apiClient, 'listEntries')
      .mockResolvedValueOnce([entry({ id: 'e-1', state: 'waitlisted' })])
      .mockResolvedValueOnce([entry({ id: 'e-1', state: 'pending' })]);
    const promote = vi
      .spyOn(apiClient, 'promoteEntry')
      .mockResolvedValue(entry({ id: 'e-1', state: 'pending' }));

    render(<EntriesDesk tid="t-1" />);
    await screen.findByTestId('entry-row-e-1');

    // Not armed: promotion opens a place, it destroys nothing.
    await userEvent.click(screen.getByRole('button', { name: 'Promote' }));

    await waitFor(() => expect(promote).toHaveBeenCalledWith('t-1', 'e-1'));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Pending')).toBeInTheDocument();
  });

  it('a viewer is offered none of them', async () => {
    // NEGATIVE CONTROL — the read role decides nothing. `useCanEdit` gates
    // every one of these, and the seam fails closed on an unknown role.
    useUiStore.setState({ activeTournamentRole: 'viewer' });
    vi.spyOn(apiClient, 'listEntries').mockResolvedValue([
      entry({ id: 'e-1', state: 'pending' }),
    ]);

    render(<EntriesDesk tid="t-1" />);
    await screen.findByTestId('entry-row-e-1');

    expect(
      within(screen.getByTestId('entry-row-e-1')).queryAllByRole('button'),
    ).toEqual([]);
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

describe('EntriesDesk — the payment record (E5)', () => {
  const paid = { submissionId: 'sub-1', paidAt: '2026-08-22T09:00:00Z', entriesUpdated: 1 };

  function pricedAct(over: Partial<EntryDTO> = {}) {
    return entry({
      id: 'e-1',
      submission: submission({ feeTotalCents: 4000 }),
      pendingReasons: ['awaiting_payment'],
      ...over,
    });
  }

  it('offers the control on the BAND, not on the row', async () => {
    // The submission is what was paid: a form act covering three events is
    // one agreement and one transfer, so a per-row control would offer to
    // mark one third of a payment received.
    vi.spyOn(apiClient, 'listEntries').mockResolvedValue([pricedAct()]);

    render(<EntriesDesk tid="t-1" />);
    await screen.findByTestId('entry-row-e-1');

    expect(
      within(row('e-1')).queryByRole('button', { name: /paid/i }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Mark paid' })).toBeInTheDocument();
  });

  it('records a payment against the act and re-reads', async () => {
    const list = vi
      .spyOn(apiClient, 'listEntries')
      .mockResolvedValueOnce([pricedAct()])
      .mockResolvedValueOnce([pricedAct({ pendingReasons: [] })]);
    const mark = vi.spyOn(apiClient, 'markSubmissionPaid').mockResolvedValue(paid);

    render(<EntriesDesk tid="t-1" />);
    await screen.findByTestId('entry-row-e-1');
    await userEvent.click(screen.getByRole('button', { name: 'Mark paid' }));

    await waitFor(() => expect(mark).toHaveBeenCalledWith('t-1', 'sub-1'));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Paid')).toBeInTheDocument();
  });

  it('offers nothing where the act owes nothing', async () => {
    // NEGATIVE CONTROL — `null` is not zero. A tournament that priced
    // nothing has not declared its entries free, so offering to mark this
    // act paid would offer to record a transfer of an unknown amount.
    vi.spyOn(apiClient, 'listEntries').mockResolvedValue([
      entry({ id: 'e-1', submission: submission({ feeTotalCents: null }) }),
    ]);

    render(<EntriesDesk tid="t-1" />);
    await screen.findByTestId('entry-row-e-1');

    expect(screen.queryByRole('button', { name: 'Mark paid' })).toBeNull();
    expect(screen.queryByText('Paid')).toBeNull();
  });

  it('a viewer is offered no payment control', async () => {
    useUiStore.setState({ activeTournamentRole: 'viewer' });
    vi.spyOn(apiClient, 'listEntries').mockResolvedValue([pricedAct()]);

    render(<EntriesDesk tid="t-1" />);
    await screen.findByTestId('entry-row-e-1');

    expect(screen.queryByRole('button', { name: 'Mark paid' })).toBeNull();
  });
});
