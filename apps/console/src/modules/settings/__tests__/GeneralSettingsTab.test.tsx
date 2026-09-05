/**
 * Lifecycle is DISPLAY-ONLY on Settings (SP-CONSOLE-REFINE A6.1).
 *
 * The pane used to carry a stored-status dropdown the rest of the app
 * ignored (D6 put the derived badge beside it to stop the two facts
 * contradicting each other). The dropdown is gone: the row shows the SAME
 * derivation the Hub and shell header use, and the one explicit lifecycle
 * action is Archive / Unarchive in the danger zone.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GeneralSettingsTab } from '../GeneralSettingsTab';
import { apiClient } from '../../../api/client';
import type { TournamentSummaryDTO } from '../../../api/dto';

vi.mock('../../../api/client', () => ({
  apiClient: { updateTournament: vi.fn().mockResolvedValue({}) },
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

describe('GeneralSettingsTab — lifecycle is display-only', () => {
  it('shows the DERIVED state and offers no stored-status control', () => {
    render(
      <GeneralSettingsTab
        tid="t1"
        summary={summaryWith({ status: 'draft', signals: { phase: 'live' } as never })}
        onSaved={noop}
      />,
    );
    expect(screen.getByTestId('general-lifecycle')).toHaveTextContent(/live/i);
    expect(screen.queryByLabelText('Workspace status')).toBeNull();
  });

  it('falls back to the phase label when no badge applies (setup, not archived)', () => {
    render(<GeneralSettingsTab tid="t1" summary={summaryWith()} onSaved={noop} />);
    expect(screen.getByTestId('general-lifecycle')).toHaveTextContent(/setup/i);
  });

  it('reads Archived from the stored column — archive stays the danger-zone action', () => {
    render(
      <GeneralSettingsTab
        tid="t1"
        summary={summaryWith({ status: 'archived', signals: { phase: 'complete' } as never })}
        onSaved={noop}
      />,
    );
    expect(screen.getByTestId('general-lifecycle')).toHaveTextContent(/archived/i);
  });

  it('links to canonical Setup editors without a competing save', () => {
    render(<GeneralSettingsTab tid="t1" summary={summaryWith()} onSaved={noop} />);
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(screen.queryByLabelText('Workspace name')).toBeNull();
    expect(screen.getByText('Spring Meet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit tournament properties' })).toHaveAttribute('href', '/tournaments/t1/setup/general');
    expect(screen.getByRole('link', { name: 'Edit dates' })).toHaveAttribute('href', '/tournaments/t1/setup/dates');
    expect(apiClient.updateTournament).not.toHaveBeenCalled();
  });
});
