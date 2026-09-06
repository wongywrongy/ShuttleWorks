import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { ActivityTab } from '../ActivityTab';
import { useAlertStore } from '../../../store/alertStore';
import { apiClient } from '../../../api/client';
import type { TournamentActivityEntryDTO, TournamentActivityFeedDTO } from '../../../api/dto';

vi.mock('../../../api/client', () => ({
  apiClient: { getTournamentActivity: vi.fn() },
}));

const ACTIVITY_MAX_ENTRIES = 200; // pinned to the backend constant (workspaces/setup.py::ACTIVITY_MAX_ENTRIES)

function entry(over: Partial<TournamentActivityEntryDTO> = {}): TournamentActivityEntryDTO {
  return {
    id: 'entry-1',
    occurredAt: '2026-08-08T12:30:00Z',
    actorId: 'user-1',
    actorName: 'Local operator',
    action: 'setup.updated',
    target: 'public-info',
    summary: 'Changed Public information: Venue address',
    fields: [{ key: 'venueAddress', label: 'Venue address', old: '12 Court St', new: '99 Arena Way' }],
    payloadHash: 'abc123',
    ...over,
  };
}

function feedOf(entries: TournamentActivityEntryDTO[], retentionLimit = ACTIVITY_MAX_ENTRIES): TournamentActivityFeedDTO {
  return { entries, retentionLimit };
}

describe('ActivityTab', () => {
  beforeEach(() => {
    useAlertStore.getState().reset();
    vi.mocked(apiClient.getTournamentActivity).mockReset();
  });

  it('distinguishes durable tournament history from current-session observations', () => {
    render(<ActivityTab />);
    expect(screen.getByRole('heading', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tournament history' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Current browser session' })).toBeInTheDocument();
    expect(screen.getByText(/Server-recorded changes identify who changed what and when/i)).toBeInTheDocument();
  });

  it('renders observed entries with exact timestamps', () => {
    useAlertStore.getState().logActivity({
      id: 'activity-1',
      severity: 'info',
      ts: '2026-08-29T12:34:56Z',
      title: 'Match M12',
      message: 'score recorded',
      source: 'activity',
    });
    render(<ActivityTab />);
    expect(screen.getByTestId('session-activity-list')).toHaveTextContent('Match M12');
    expect(screen.getByText('score recorded')).toBeInTheDocument();
    expect(screen.getByTestId('activity-timestamp')).toHaveAttribute('datetime', '2026-08-29T12:34:56Z');
  });

  it('renders a durable row with the actor, plain-language change, and a tournament-timezone timestamp', async () => {
    vi.mocked(apiClient.getTournamentActivity).mockResolvedValue(feedOf([entry()]));
    render(<ActivityTab tid="t1" timeZone="Africa/Johannesburg" />);

    const list = await screen.findByTestId('durable-activity-list');
    expect(list).toHaveTextContent('Changed Public information: Venue address');
    expect(list).toHaveTextContent('Local operator');
    // Africa/Johannesburg is UTC+2, so 12:30Z renders as 2:30 PM local — the
    // tournament timezone, not the browser's.
    expect(list).toHaveTextContent('2:30 PM');
  });

  it('does not repeat a section label beside the actor', async () => {
    vi.mocked(apiClient.getTournamentActivity).mockResolvedValue(feedOf([entry()]));
    render(<ActivityTab tid="t1" timeZone="UTC" />);

    const list = await screen.findByTestId('durable-activity-list');
    const actorLine = within(list).getByText('Local operator');
    expect(actorLine.textContent).toBe('Local operator');
  });

  it('expands to show old and new values when the record has a field diff', async () => {
    vi.mocked(apiClient.getTournamentActivity).mockResolvedValue(feedOf([entry()]));
    render(<ActivityTab tid="t1" timeZone="UTC" />);
    await screen.findByTestId('durable-activity-list');

    expect(screen.getByText('12 Court St')).toBeInTheDocument();
    expect(screen.getByText('99 Arena Way')).toBeInTheDocument();
  });

  it('renders "Details not recorded for this change" when the record carries no field diff', async () => {
    vi.mocked(apiClient.getTournamentActivity).mockResolvedValue(
      feedOf([entry({ id: 'entry-old', fields: [], summary: 'Changed General' })]),
    );
    render(<ActivityTab tid="t1" timeZone="UTC" />);
    await screen.findByTestId('durable-activity-list');

    expect(screen.getByText('Details not recorded for this change.')).toBeInTheDocument();
  });

  it('keeps diagnostics (operation id, ISO timestamp, payload hash) behind the row expansion only', async () => {
    vi.mocked(apiClient.getTournamentActivity).mockResolvedValue(feedOf([entry({ id: 'op-42', payloadHash: 'deadbeef' })]));
    render(<ActivityTab tid="t1" timeZone="UTC" />);
    const list = await screen.findByTestId('durable-activity-list');

    // Not in the default row's visible text.
    expect(list.querySelector('summary')?.parentElement).not.toBeNull();
    expect(screen.queryByText('op-42')).not.toBeVisible();
    // Reachable via the expansion.
    expect(screen.getByText('op-42')).toBeInTheDocument();
    expect(screen.getByText('deadbeef')).toBeInTheDocument();
  });

  it('shows retention copy pinned to the backend-reported limit', async () => {
    vi.mocked(apiClient.getTournamentActivity).mockResolvedValue(feedOf([entry()], ACTIVITY_MAX_ENTRIES));
    render(<ActivityTab tid="t1" timeZone="UTC" />);

    await waitFor(() =>
      expect(screen.getByText(`Kept for the most recent ${ACTIVITY_MAX_ENTRIES} changes.`)).toBeInTheDocument(),
    );
  });
});
