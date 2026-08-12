/**
 * Defect D6: Workspace › Settings showed "Draft" while the shell header and the
 * Hub showed LIVE for the same workspace.
 *
 * Neither was stale. `status` is the stored lifecycle column this pane edits;
 * every other surface's "status" is `lifecycleBadge(signals.phase, status)`,
 * derived from real play state, and a workspace with matches in progress reads
 * Live whatever the column says. Two facts, one word, and this pane was the one
 * using the word for the other thing.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GeneralSettingsTab } from '../GeneralSettingsTab';
import type { TournamentSummaryDTO } from '../../../api/dto';

vi.mock('../../../api/client', () => ({
  apiClient: { updateTournament: vi.fn() },
}));

function summaryWith(over: Partial<TournamentSummaryDTO> = {}): TournamentSummaryDTO {
  return {
    id: 't1',
    name: 'Spring Meet',
    status: 'draft',
    kind: 'meet',
    tournamentDate: '2026-05-15',
    createdAt: '',
    updatedAt: '',
    role: 'owner',
    ownerName: 'op@example.com',
    ...over,
  } as TournamentSummaryDTO;
}

const noop = () => {};

describe('GeneralSettingsTab — the two status facts (D6)', () => {
  it('shows the DERIVED state beside the stored one when they disagree', () => {
    render(
      <GeneralSettingsTab
        tid="t1"
        summary={summaryWith({ status: 'draft', signals: { phase: 'live' } as never })}
        onSaved={noop}
      />,
    );
    // What the Hub and the shell header show, on the same screen as the column
    // that says draft — so the operator can see they are two things.
    expect(screen.getByTestId('general-derived-status')).toHaveTextContent(/live/i);
    expect(screen.getByTestId('general-derived-note')).toHaveTextContent(/Hub/);
    // The control still edits the stored column, unchanged.
    expect(screen.getByLabelText('Workspace status')).toBeInTheDocument();
  });

  it('says nothing extra when the two agree — one fact, said once', () => {
    render(
      <GeneralSettingsTab
        tid="t1"
        summary={summaryWith({ status: 'archived', signals: { phase: 'complete' } as never })}
        onSaved={noop}
      />,
    );
    // lifecycleBadge returns "Archived" here, which is exactly the stored
    // column: a badge restating the select beside it would be noise.
    expect(screen.queryByTestId('general-derived-status')).toBeNull();
    expect(screen.queryByTestId('general-derived-note')).toBeNull();
  });

  it('says nothing on a payload with no signals (older server)', () => {
    render(<GeneralSettingsTab tid="t1" summary={summaryWith()} onSaved={noop} />);
    expect(screen.queryByTestId('general-derived-status')).toBeNull();
  });
});
