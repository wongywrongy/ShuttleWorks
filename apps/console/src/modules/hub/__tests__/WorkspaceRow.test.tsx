import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorkspaceRow } from '../WorkspaceRow';
import type { TournamentSummaryDTO } from '../../../api/dto';

const t: TournamentSummaryDTO = {
  id: 't1', name: 'Spring', status: 'active', kind: 'meet', tournamentDate: '2026-07-01',
  createdAt: '', updatedAt: '', role: 'owner', ownerName: null,
  modules: [{ moduleId: 'meet', status: 'enabled', config: null }],
  signals: { health: 'attention', attention: [{ code: 'NO_ROSTER', label: 'No players added yet' }], modules: { enabled: 1, available: 1, disabled: 0, comingSoon: 1 }, setup: { roster: false }, collaboration: { memberCount: 1, activeInviteCount: 0 } },
};

const noop = () => {};

describe('WorkspaceRow', () => {
  it('upcoming: shows the primary next action from signals', () => {
    render(
      <WorkspaceRow tournament={t} group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop} />,
    );
    expect(screen.getByRole('button', { name: 'Add players' })).toBeInTheDocument();
  });

  it('undated: the action is "Set date" and calls onSetDate', () => {
    const onSetDate = vi.fn();
    const onOpen = vi.fn();
    render(
      <WorkspaceRow tournament={{ ...t, tournamentDate: null }} group="undated" selected={false} onSelect={noop} onOpen={onOpen} onSetDate={onSetDate} onSettings={noop} />,
    );
    const btn = screen.getByRole('button', { name: 'Set date' });
    fireEvent.click(btn);
    expect(onSetDate).toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('past: the action is "View results"', () => {
    render(
      <WorkspaceRow tournament={t} group="past" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop} />,
    );
    expect(screen.getByRole('button', { name: 'View results' })).toBeInTheDocument();
  });

  it('past bracket: the action opens Draws first', () => {
    const onOpen = vi.fn();
    render(
      <WorkspaceRow
        tournament={{ ...t, kind: 'bracket' }}
        group="past"
        selected={false}
        onSelect={noop}
        onOpen={onOpen}
        onSetDate={noop}
        onSettings={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'View draws' }));
    expect(onOpen).toHaveBeenCalledWith('bracket/draws');
  });

  it('states attention as ONE labelled dot, not a column of prose', () => {
    render(
      <WorkspaceRow tournament={t} group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop} />,
    );
    const dot = screen.getByTestId('row-attention');
    expect(dot.tagName).toBe('BUTTON');
    // The reason is in the accessible name, not rendered as row text: the
    // details belong to the inspector.
    expect(dot).toHaveAccessibleName(
      `Needs attention: ${t.signals!.attention[0].label}. Open details.`,
    );
    expect(screen.queryByText(t.signals!.attention[0].label)).toBeNull();
  });

  it('names the additional issues in the dot label', () => {
    render(
      <WorkspaceRow
        tournament={{
          ...t,
          signals: {
            ...t.signals!,
            attention: [
              { code: 'NO_ROSTER', label: 'No players added yet' },
              { code: 'ENTRIES_NOT_COMMITTED', label: 'Confirmed entries not on the roster' },
            ],
          },
        }}
        group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop}
      />,
    );
    expect(screen.getByTestId('row-attention')).toHaveAccessibleName(
      /No players added yet and 1 more issue/,
    );
  });

  it('the dot is keyboard-reachable and opens the details', () => {
    const onSelect = vi.fn();
    render(
      <WorkspaceRow tournament={t} group="upcoming" selected={false} onSelect={onSelect} onOpen={noop} onSetDate={noop} onSettings={noop} />,
    );
    const dot = screen.getByTestId('row-attention');
    dot.focus();
    expect(dot).toHaveFocus();
    fireEvent.click(dot);
    expect(onSelect).toHaveBeenCalled();
  });

  it('renders no dot at all when nothing is wrong', () => {
    render(
      <WorkspaceRow
        tournament={{ ...t, signals: { ...t.signals!, health: 'good', attention: [] } }}
        group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop}
      />,
    );
    expect(screen.queryByTestId('row-attention')).toBeNull();
    expect(screen.queryByText('Needs attention')).toBeNull();
  });

  it('shows enabled modules as glyphs with accessible names, on the right', () => {
    render(
      <WorkspaceRow
        tournament={{
          ...t,
          modules: [
            { moduleId: 'meet', status: 'enabled', config: null },
            { moduleId: 'bracket', status: 'available', config: null },
            { moduleId: 'display', status: 'enabled', config: null },
          ],
        }}
        group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop}
      />,
    );
    const glyphs = screen.getByTestId('row-modules');
    expect(glyphs.querySelectorAll('[role="img"]')).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'Meet' })).toHaveTextContent('M');
    expect(screen.getByRole('img', { name: 'Display' })).toHaveTextContent('D');
    expect(screen.queryByRole('img', { name: 'Bracket' })).toBeNull();
  });


  // SP-UI-1: the next action is the row's call to action, not a metadata
  // column. Pin the properties that make it read that way — the chevron is
  // decorative and must not enter the accessible name.
  it('the next action is a keyboard-focusable affordance whose name is the label alone', () => {
    render(
      <WorkspaceRow tournament={t} group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop} />,
    );
    const cta = screen.getByTestId('row-next-action');
    expect(cta.tagName).toBe('BUTTON');
    expect(cta).toHaveAccessibleName('Add players');
    cta.focus();
    expect(cta).toHaveFocus();
  });

  // R-D (SP-CONSOLE-3, Option A): LIVE is suppressed — the HealthDot and
  // next action already say it — while Complete still badges; resting
  // rows stay unbadged as before.
  it('badges a complete row, and suppresses the chip on live and resting rows', () => {
    const { rerender } = render(
      <WorkspaceRow
        tournament={{ ...t, signals: { ...t.signals!, phase: 'complete' } }}
        group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop}
      />,
    );
    expect(screen.getByTestId('row-lifecycle')).toHaveTextContent('Complete');
    rerender(
      <WorkspaceRow
        tournament={{ ...t, signals: { ...t.signals!, phase: 'live' } }}
        group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop}
      />,
    );
    expect(screen.queryByTestId('row-lifecycle')).toBeNull();
    // NEGATIVE CONTROL: setup/ready rows carry no pill.
    rerender(
      <WorkspaceRow
        tournament={{ ...t, signals: { ...t.signals!, phase: 'ready' } }}
        group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop}
      />,
    );
    expect(screen.queryByTestId('row-lifecycle')).toBeNull();
  });

  it('an archived workspace never badges Live (shared precedence)', () => {
    render(
      <WorkspaceRow
        tournament={{ ...t, status: 'archived', signals: { ...t.signals!, phase: 'live' } }}
        group="past" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop}
      />,
    );
    expect(screen.getByTestId('row-lifecycle')).toHaveTextContent('Archived');
  });

  it('puts the name and its numeric date on the left, in that order', () => {
    const { container } = render(
      <WorkspaceRow tournament={t} group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop} />,
    );
    const row = container.firstElementChild!;
    expect(row.firstElementChild).toHaveTextContent('Spring');
    expect(screen.getByTestId('row-date')).toHaveTextContent('2026-07-01');
    const text = row.textContent ?? '';
    expect(text.indexOf('Spring')).toBeLessThan(text.indexOf('2026-07-01'));
  });

  it('shows a multi-day event as a date range', () => {
    render(
      <WorkspaceRow
        tournament={{ ...t, tournamentDate: '2026-07-28', tournamentEndDate: '2026-08-03' }}
        group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop}
      />,
    );
    expect(screen.getByTestId('row-date')).toHaveTextContent('2026-07-28 → 08-03');
  });

  it('drops a year the date already supplies from the displayed name', () => {
    render(
      <WorkspaceRow
        tournament={{ ...t, name: 'Yunavero Club Open 2026', tournamentDate: '2026-07-01' }}
        group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop}
      />,
    );
    expect(screen.getByText('Yunavero Club Open')).toBeInTheDocument();
    expect(screen.queryByText('Yunavero Club Open 2026')).toBeNull();
  });

  it('keeps a year the date does NOT supply', () => {
    render(
      <WorkspaceRow
        tournament={{ ...t, name: 'Yunavero Club Open 2025', tournamentDate: '2026-07-01' }}
        group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop}
      />,
    );
    expect(screen.getByText('Yunavero Club Open 2025')).toBeInTheDocument();
  });

  // 2026-08-11 design audit, T4: the menu was revealed only by
  // `group-hover:opacity-100`. `:hover` never fires on a touch device, so on
  // a tablet the row's only route to Settings and Delete did not exist — at
  // any width. jsdom applies no stylesheet, so the rest state is asserted on
  // the class that carries it; what is being pinned is that the resting
  // opacity is not zero.
  it('the overflow menu is visible at rest, not only on hover', () => {
    render(
      <WorkspaceRow tournament={t} group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop} onDelete={noop} />,
    );
    const trigger = screen.getByRole('button', { name: /more actions/i });
    const wrapper = trigger.closest('span[class]')!;
    expect(wrapper.className).not.toMatch(/\bopacity-0\b/);
    expect(wrapper.className).toMatch(/\bopacity-\d+\b/);
  });

  it('Delete lives in the overflow menu, not inline', () => {
    const onDelete = vi.fn();
    render(
      <MemoryRouter>
        <WorkspaceRow tournament={t} group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop} onDelete={onDelete} />
      </MemoryRouter>,
    );
    // No inline Delete button on the row surface.
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    expect(screen.getByRole('menuitem', { name: 'Open administration' })).toHaveAttribute(
      'href',
      '/tournaments/t1/administration/lifecycle',
    );
    fireEvent.click(screen.getByTestId('overflow-delete'));
    expect(onDelete).toHaveBeenCalled();
  });

  // V3-OC02.2: a completed bracket workspace with an unresolved entries
  // reason used to offer "View draws", which opens nothing that fixes the
  // problem the row is flagging.
  it('offers "Review entries" instead of "View draws" when the leading reason concerns entries', () => {
    const onOpen = vi.fn();
    render(
      <MemoryRouter>
        <WorkspaceRow
          tournament={{
            ...t,
            kind: 'bracket',
            signals: {
              ...t.signals!,
              attention: [{ code: 'ENTRIES_NOT_COMMITTED', label: 'Confirmed entries not on the roster' }],
              phase: 'complete',
            },
          }}
          group="past" selected={false} onSelect={noop} onOpen={onOpen} onSetDate={noop} onSettings={noop}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review entries' }));
    expect(onOpen).toHaveBeenCalledWith('participants/entries');
  });
});
