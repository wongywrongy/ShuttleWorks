import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HubSummaryBar } from '../HubSummaryBar';
import type { TournamentSummaryDTO } from '../../../api/dto';

const t = (o: Partial<TournamentSummaryDTO>): TournamentSummaryDTO => ({
  id: 'x', name: 'X', status: 'active', kind: 'meet', tournamentDate: null,
  createdAt: '', updatedAt: '', role: 'owner', ownerName: null, ...o,
});

describe('HubSummaryBar', () => {
  it('renders the operational metrics and routes attention to the filter', () => {
    const onPick = vi.fn();
    render(<HubSummaryBar list={[t({}), t({ role: 'viewer' })]} onPickFilter={onPick} />);
    expect(screen.getByTestId('metric-workspaces')).toHaveTextContent('2');
    expect(screen.getByTestId('metric-active')).toBeInTheDocument();
    expect(screen.getByTestId('metric-modules')).toBeInTheDocument();
    // Collaboration metrics are no longer headlined in the band.
    expect(screen.queryByTestId('metric-invites')).toBeNull();
    expect(screen.queryByTestId('metric-shared')).toBeNull();
    fireEvent.click(screen.getByTestId('metric-attention'));
    expect(onPick).toHaveBeenCalledWith('attention');
  });
});
