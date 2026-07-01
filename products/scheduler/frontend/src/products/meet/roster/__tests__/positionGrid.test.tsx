import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import type { PlayerDTO, RosterGroupDTO, TournamentConfig } from '../../../../api/dto';
import { useTournamentStore } from '../../../../store/tournamentStore';
import { usePositionGridColumns } from '../positionGrid/usePositionGridColumns';
import { PositionGrid } from '../PositionGrid';

const cfg = (over: Partial<TournamentConfig> = {}): TournamentConfig =>
  ({ rankCounts: { MS: 3, WS: 2, MD: 2, WD: 0, XD: 1 }, ...over } as TournamentConfig);

const mkPlayer = (id: string, groupId: string, ranks: string[] = []): PlayerDTO =>
  ({ id, name: id, groupId, ranks, availability: [] } as PlayerDTO);

const S1 = [{ id: 'S1', name: 'School 1' }] as RosterGroupDTO[];

beforeEach(() => {
  useTournamentStore.setState({ config: cfg(), groups: S1, players: [] });
});

describe('usePositionGridColumns', () => {
  it('derives columns from rankCounts (count>0) in canonical order', () => {
    const { result } = renderHook(() => usePositionGridColumns());
    // EVENT_ORDER is MD,WD,XD,WS,MS; WD has count 0 so it drops out.
    expect(result.current.events.map((e) => e.prefix)).toEqual(['MD', 'XD', 'WS', 'MS']);
  });

  it('honors config.eventOrder', () => {
    useTournamentStore.setState({
      config: cfg({ eventOrder: ['MS', 'WS', 'MD', 'WD', 'XD'] }),
    });
    const { result } = renderHook(() => usePositionGridColumns());
    expect(result.current.events.map((e) => e.prefix)).toEqual(['MS', 'WS', 'MD', 'XD']);
  });

  it('hides a column via eventVisible but keeps it in allConfiguredEvents', () => {
    useTournamentStore.setState({ config: cfg({ eventVisible: { MS: false } }) });
    const { result } = renderHook(() => usePositionGridColumns());
    expect(result.current.events.find((e) => e.prefix === 'MS')).toBeUndefined();
    expect(result.current.allConfiguredEvents).toContain('MS');
  });

  it('toggleVisible then resetColumns clears the overrides', () => {
    const { result } = renderHook(() => usePositionGridColumns());
    act(() => result.current.toggleVisible('MS'));
    expect(useTournamentStore.getState().config?.eventVisible?.MS).toBe(false);
    act(() => result.current.resetColumns());
    expect(useTournamentStore.getState().config?.eventOrder).toBeUndefined();
    expect(useTournamentStore.getState().config?.eventVisible).toBeUndefined();
  });
});

const renderGrid = (schoolId = 'S1') =>
  render(
    <DndContext>
      <PositionGrid schoolId={schoolId} />
    </DndContext>,
  );

describe('PositionGrid structure', () => {
  it('renders one column header per visible event plus the # stub', () => {
    renderGrid();
    // MD, XD, WS, MS (4) + the "#" stub = 5
    expect(screen.getAllByRole('columnheader')).toHaveLength(5);
  });

  it('shows the empty state (no table) when no events are configured', () => {
    useTournamentStore.setState({ config: { rankCounts: {} } as TournamentConfig });
    renderGrid();
    expect(screen.getByText(/No events configured/i)).toBeTruthy();
    expect(screen.queryByTestId('position-grid-table')).toBeNull();
  });

  it('disables cells beyond an event count (dash, no add button)', () => {
    renderGrid();
    // XD count is 1, so XD2 (row 2) is disabled.
    const disabled = screen.getByTestId('pos-cell-S1-XD2');
    expect(disabled.textContent).toContain('—');
    expect(screen.queryByTestId('pos-cell-btn-S1-XD2')).toBeNull();
  });

  it('renders an assigned player chip in its rank cell', () => {
    useTournamentStore.setState({ players: [mkPlayer('p1', 'S1', ['MS1'])] });
    renderGrid();
    expect(screen.getByTestId('pos-cell-S1-MS1').textContent).toContain('p1');
  });
});
