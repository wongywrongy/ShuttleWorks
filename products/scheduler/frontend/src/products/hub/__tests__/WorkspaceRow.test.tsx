import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('renders a Modules column with a solid glyph per enabled module', () => {
    render(
      <WorkspaceRow tournament={t} group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop} />,
    );
    // fixture `t` has meet enabled → a solid "M" glyph.
    const glyph = screen.getByTestId('row-module-meet');
    expect(glyph).toHaveTextContent('M');
    expect(glyph.className).not.toMatch(/border-dashed/);
  });

  it('says "needs attention" for a workspace that does — the dot is aria-hidden', () => {
    const { rerender } = render(
      <WorkspaceRow tournament={t} group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop} />,
    );
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    // NEGATIVE CONTROL: a healthy row stays quiet.
    rerender(
      <WorkspaceRow
        tournament={{ ...t, signals: { ...t.signals!, health: 'good', attention: [] } }}
        group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop}
      />,
    );
    expect(screen.queryByText('Needs attention')).toBeNull();
  });

  // T4: the glyphs were `<span title>` — a letter with a tooltip is decoded
  // for a mouse and for nobody else. Nothing else on the Hub explains M/B/D/E.
  it('names each module glyph, so the letter is not the only cue', () => {
    render(
      <WorkspaceRow tournament={t} group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop} />,
    );
    expect(screen.getByRole('img', { name: 'Meet: enabled' })).toHaveTextContent('M');
  });

  it('shows a dashed kind-default glyph when nothing is enabled', () => {
    const draft: TournamentSummaryDTO = {
      ...t,
      tournamentDate: null,
      modules: [{ moduleId: 'meet', status: 'available', config: null }],
    };
    render(
      <WorkspaceRow tournament={draft} group="undated" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop} />,
    );
    expect(screen.getByTestId('row-module-meet').className).toMatch(/border-dashed/);
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

  // Console-mock adoption (2026-08-13): the row states its lifecycle via the
  // shared lifecycleBadge precedence; resting rows stay unbadged.
  it('badges a live row, and leaves a resting row unbadged', () => {
    const { rerender } = render(
      <WorkspaceRow
        tournament={{ ...t, signals: { ...t.signals!, phase: 'live' } }}
        group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop}
      />,
    );
    expect(screen.getByTestId('row-lifecycle')).toHaveTextContent('Live');
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

  it('name leads the row — the date is trailing metadata, not the first cell', () => {
    const { container } = render(
      <WorkspaceRow tournament={t} group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop} />,
    );
    const row = container.firstElementChild!;
    // First cell carries the name; the date lives after the Modules column.
    expect(row.firstElementChild).toHaveTextContent('Spring');
    const text = row.textContent ?? '';
    expect(text.indexOf('Spring')).toBeLessThan(text.indexOf('Jul 1'));
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
      <WorkspaceRow tournament={t} group="upcoming" selected={false} onSelect={noop} onOpen={noop} onSetDate={noop} onSettings={noop} onDelete={onDelete} />,
    );
    // No inline Delete button on the row surface.
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    fireEvent.click(screen.getByTestId('overflow-delete'));
    expect(onDelete).toHaveBeenCalled();
  });
});
