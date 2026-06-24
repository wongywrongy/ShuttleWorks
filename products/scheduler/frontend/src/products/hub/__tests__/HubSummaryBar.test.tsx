import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HubSummaryBar } from '../HubSummaryBar';
import type { TournamentSummaryDTO } from '../../../api/dto';

const t = (o: Partial<TournamentSummaryDTO>): TournamentSummaryDTO => ({
  id: 'x', name: 'X', status: 'active', kind: 'meet', tournamentDate: null,
  createdAt: '', updatedAt: '', role: 'owner', ownerName: null, ...o,
});

describe('HubSummaryBar', () => {
  it('renders totals and routes a metric click to the filter', () => {
    const onPick = vi.fn();
    render(<HubSummaryBar list={[t({}), t({ role: 'viewer' })]} onPickFilter={onPick} />);
    expect(screen.getByTestId('metric-workspaces')).toHaveTextContent('2');
    fireEvent.click(screen.getByTestId('metric-attention'));
    expect(onPick).toHaveBeenCalledWith('attention');
  });
});
