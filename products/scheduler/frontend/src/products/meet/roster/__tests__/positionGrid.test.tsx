import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import type { PlayerDTO, RosterGroupDTO, TournamentConfig } from '../../../../api/dto';
import { useTournamentStore } from '../../../../store/tournamentStore';
import { usePositionGridColumns } from '../positionGrid/usePositionGridColumns';
import { ROSTER_DRAG_ACTIVATION_DISTANCE } from '../positionGrid/helpers';
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

  it('derives columns from NON-discipline events too (age groups, etc.)', () => {
    // A league's events are its own vocabulary — F&K Junior League runs U10 and
    // U11. Intersecting rankCounts against the canonical five disciplines
    // dropped every column and showed "No events configured" on a configured
    // meet (2026-08-10 browser pass).
    useTournamentStore.setState({ config: cfg({ rankCounts: { U10: 5, U11: 5 } }) });
    const { result } = renderHook(() => usePositionGridColumns());
    expect(result.current.events.map((e) => e.prefix)).toEqual(['U10', 'U11']);
  });

  it('orders canonical disciplines first, then the rest', () => {
    useTournamentStore.setState({ config: cfg({ rankCounts: { U10: 5, MS: 1, WD: 2 } }) });
    const { result } = renderHook(() => usePositionGridColumns());
    // EVENT_ORDER is MD,WD,XD,WS,MS — the two disciplines keep that order,
    // then the non-canonical event follows in rankCounts order.
    expect(result.current.events.map((e) => e.prefix)).toEqual(['WD', 'MS', 'U10']);
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
    useTournamentStore.setState({ config: cfg({ rankCounts: {} }) });
    renderGrid();
    expect(screen.getByText(/No events configured/i)).toBeTruthy();
    expect(screen.queryByTestId('position-grid-table')).toBeNull();
  });

  it('renders the grid — not the empty state — for non-discipline events', () => {
    useTournamentStore.setState({ config: cfg({ rankCounts: { U10: 5, U11: 5 } }) });
    renderGrid();
    expect(screen.queryByText(/No events configured/i)).toBeNull();
    // U10, U11 + the "#" stub = 3
    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
  });

  it('disables cells beyond an event count (dash, no add button)', () => {
    renderGrid();
    // XD count is 1, so XD2 (row 2) is disabled.
    const disabled = screen.getByTestId('pos-cell-S1-XD2');
    expect(disabled.textContent).toContain('–');
    expect(screen.queryByTestId('pos-cell-btn-S1-XD2')).toBeNull();
  });

  it('renders an assigned player chip in its rank cell', () => {
    useTournamentStore.setState({ players: [mkPlayer('p1', 'S1', ['MS1'])] });
    renderGrid();
    expect(screen.getByTestId('pos-cell-S1-MS1').textContent).toContain('p1');
  });
});

/* Console-IA finding 1.1 + defect D13 (2026-08-12). A lineup cell used to
 * carry one immediate, unconfirmed `×` unassign per seat — 24 of them on a
 * full screen, ~4px from the name button whose click means "just show me
 * this" — and its only reassign gesture was a double-click on a `<div>`. */
describe('PositionCell interaction model', () => {
  beforeEach(() => {
    useTournamentStore.setState({ players: [mkPlayer('p1', 'S1', ['MS1'])] });
  });

  it('carries NO unassign control (it lives in the pane, armed)', () => {
    renderGrid();
    const cell = screen.getByTestId('pos-cell-S1-MS1');
    expect(within(cell).queryByLabelText(/^Unassign/)).not.toBeInTheDocument();
    // Nothing in the cell destroys anything: the only controls are the name
    // (opens the pane) and the reassign button (opens the picker).
    expect(within(cell).getAllByRole('button')).toHaveLength(2);
    expect(useTournamentStore.getState().players[0].ranks).toEqual(['MS1']);
  });

  it('opens the position pane on a name click, with no debounce', () => {
    const onSelect = vi.fn();
    render(
      <DndContext>
        <PositionGrid schoolId="S1" onSelectPosition={onSelect} />
      </DndContext>,
    );
    const cell = screen.getByTestId('pos-cell-S1-MS1');
    fireEvent.click(within(cell).getByText('p1'));
    // Synchronously, not after the 220ms single/double-click debounce the
    // removed double-click gesture forced on every open.
    expect(onSelect).toHaveBeenCalledWith('MS1');
  });

  it('reassigns from a real button, so the keyboard can reach it (D13)', () => {
    renderGrid();
    const reassign = screen.getByTestId('pos-cell-reassign-S1-MS1');
    expect(reassign.tagName).toBe('BUTTON');
    fireEvent.click(reassign);
    expect(screen.getByTestId('picker-S1-MS1')).toBeInTheDocument();
  });
});

/* Console-IA finding 1.2. jsdom dispatches no real pointer stream and runs no
 * layout, so dnd-kit's activation maths is unobservable in a rendering test —
 * the number itself is the contract, and so is the fact that RosterTab reads
 * it rather than spelling a distance out again. */
describe('the roster pool drag threshold', () => {
  const rosterTab = readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../RosterTab.tsx',
    ),
    'utf8',
  );

  it('is outside normal click jitter', () => {
    expect(ROSTER_DRAG_ACTIVATION_DISTANCE).toBeGreaterThanOrEqual(8);
  });

  it('is what the pool actually arms its MouseSensor with', () => {
    expect(rosterTab).toMatch(
      /activationConstraint:\s*\{\s*distance:\s*ROSTER_DRAG_ACTIVATION_DISTANCE\s*\}/,
    );
  });
});
