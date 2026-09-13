/**
 * The Hub row is a table row: Tournament · Dates · Status · Open · Actions
 * (D2). What is pinned here is that a long name or an unusual status cannot
 * move the later columns, that Status is never blank, and that Open says and
 * does the same thing on every row.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorkspaceRow } from '../WorkspaceRow';
import type { TournamentSummaryDTO } from '../../../api/dto';

const NOW = new Date('2026-07-30T10:00:00Z');

const t: TournamentSummaryDTO = {
  id: 't1', name: 'Spring', status: 'active', kind: 'meet', tournamentDate: '2026-07-01',
  createdAt: '', updatedAt: '', role: 'owner', ownerName: null,
  modules: [{ moduleId: 'meet', status: 'enabled', config: null }],
  signals: { health: 'attention', attention: [{ code: 'NO_ROSTER', label: 'No players added yet' }], modules: { enabled: 1, available: 1, disabled: 0, comingSoon: 1 }, setup: { roster: false }, collaboration: { memberCount: 1, activeInviteCount: 0 } },
};

const noop = () => {};

function row(
  over: Partial<TournamentSummaryDTO> = {},
  handlers: Partial<{ onSelect: () => void; onOpen: () => void; onSettings: () => void; onDelete: () => void }> = {},
) {
  return render(
    <MemoryRouter>
      <WorkspaceRow
        tournament={{ ...t, ...over }}
        now={NOW}
        selected={false}
        onSelect={handlers.onSelect ?? noop}
        onOpen={handlers.onOpen ?? noop}
        onSettings={handlers.onSettings ?? noop}
        onDelete={handlers.onDelete}
      />
    </MemoryRouter>,
  );
}

describe('WorkspaceRow', () => {
  it('Open carries the same label on every row and never navigates on selection', () => {
    const onOpen = vi.fn();
    const onSelect = vi.fn();
    row({}, { onOpen, onSelect });
    const open = screen.getByTestId('row-open');
    expect(open).toHaveAccessibleName('Open');
    fireEvent.click(open);
    expect(onOpen).toHaveBeenCalledTimes(1);
    // Clicking the row selects it; it does not open the workspace.
    fireEvent.click(screen.getByText('Spring'));
    expect(onSelect).toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('states a status on every row, including the ones with no lifecycle chip', () => {
    const cases: [Partial<TournamentSummaryDTO>, string][] = [
      [{ status: 'draft', tournamentDate: '2026-12-01' }, 'Draft'],
      // An old DRAFT is still a draft: a passed date must not silently
      // promote it to Completed.
      [{ status: 'draft', tournamentDate: '2020-01-01' }, 'Draft'],
      [{ status: 'active', tournamentDate: '2026-12-01' }, 'Upcoming'],
      [{ status: 'active', tournamentDate: '2026-07-30' }, 'Live'],
      [{ status: 'active', tournamentDate: '2026-01-01' }, 'Completed'],
      [{ status: 'archived', signals: { ...t.signals!, phase: 'live' } }, 'Archived'],
      [{ status: 'active', tournamentDate: null }, 'Upcoming'],
    ];
    for (const [over, label] of cases) {
      const { unmount } = row(over);
      expect(screen.getByTestId('row-status')).toHaveTextContent(label);
      unmount();
    }
  });

  it('keeps the date column stable and separate from the name', () => {
    row({ name: 'Yunavero Club Open (2026)', tournamentDate: '2026-07-28', tournamentEndDate: '2026-08-03' });
    // The stored name renders verbatim, with no appended date.
    expect(screen.getByText('Yunavero Club Open (2026)')).toBeInTheDocument();
    const date = screen.getByTestId('row-date');
    expect(date).toHaveTextContent('2026-07-28 – 08-03');
    expect(date.className).toMatch(/\bw-36\b/);
  });

  it('says "No date set" instead of leaving the date cell blank', () => {
    row({ tournamentDate: null });
    expect(screen.getByTestId('row-date')).toHaveTextContent('No date set');
  });

  it('falls back to Untitled when the workspace has no name', () => {
    row({ name: '  ' });
    expect(screen.getByText('Untitled')).toBeInTheDocument();
  });

  it('states attention as ONE labelled dot that opens the preview panel', () => {
    const onSelect = vi.fn();
    row({}, { onSelect });
    const dot = screen.getByTestId('row-attention');
    expect(dot.tagName).toBe('BUTTON');
    expect(dot).toHaveAccessibleName(
      `Needs attention: ${t.signals!.attention[0].label}. Open details.`,
    );
    // The reason is in the accessible name, not rendered as row text.
    expect(screen.queryByText(t.signals!.attention[0].label)).toBeNull();
    dot.focus();
    expect(dot).toHaveFocus();
    fireEvent.click(dot);
    expect(onSelect).toHaveBeenCalled();
  });

  it('renders no dot at all when nothing is wrong', () => {
    row({ signals: { ...t.signals!, health: 'good', attention: [] } });
    expect(screen.queryByTestId('row-attention')).toBeNull();
  });

  it('carries no module glyph badges in the primary table', () => {
    row({
      modules: [
        { moduleId: 'meet', status: 'enabled', config: null },
        { moduleId: 'display', status: 'enabled', config: null },
      ],
    });
    expect(screen.queryByTestId('row-modules')).toBeNull();
  });

  // 2026-08-11 design audit, T4: `:hover` never fires on a touch device, so
  // a menu revealed only by `group-hover` did not exist on a tablet.
  it('the overflow menu is visible at rest, not only on hover', () => {
    row({}, { onDelete: noop });
    const trigger = screen.getByRole('button', { name: /more actions/i });
    const wrapper = trigger.closest('span[class]')!;
    expect(wrapper.className).not.toMatch(/\bopacity-0\b/);
    expect(wrapper.className).toMatch(/\bopacity-\d+\b/);
  });

  it('separates Delete from Settings in the actions menu', () => {
    const onDelete = vi.fn();
    row({}, { onDelete });
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    expect(screen.getByRole('menuitem', { name: 'Open settings' })).toHaveAttribute(
      'href',
      '/tournaments/t1/administration/lifecycle',
    );
    fireEvent.click(screen.getByTestId('overflow-delete'));
    expect(onDelete).toHaveBeenCalled();
  });
});
