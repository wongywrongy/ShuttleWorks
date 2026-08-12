/**
 * The Generate button's disabled vocabulary.
 *
 * Two audit findings meet on this one control: A2 (a viewer must not be able to
 * re-solve the day) and A6 (Generate was enabled with zero matches, so pressing
 * it ran a solve that could only ever return an empty plan). Both are asserted
 * the way the user experiences them — the button refuses the press — rather than
 * by reaching into the handler.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScheduleActions } from '../ScheduleActions';
import { useUiStore } from '../../../../store/uiStore';

const asRole = (role: 'owner' | 'viewer' | null) =>
  useUiStore.setState({ activeTournamentRole: role });

describe('ScheduleActions', () => {
  beforeEach(() => asRole('owner'));

  it('generates when there are matches and the caller may edit', async () => {
    const onGenerate = vi.fn();
    render(<ScheduleActions onGenerate={onGenerate} generating={false} hasSchedule={false} />);
    await userEvent.click(screen.getByTestId('schedule-generate'));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('refuses to generate with no matches to schedule (A6)', async () => {
    const onGenerate = vi.fn();
    render(
      <ScheduleActions
        onGenerate={onGenerate}
        generating={false}
        hasSchedule={false}
        hasMatches={false}
      />,
    );
    const btn = screen.getByTestId('schedule-generate');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'Add matches before generating a schedule');
    await userEvent.click(btn);
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('refuses to generate for a viewer (A2)', async () => {
    asRole('viewer');
    const onGenerate = vi.fn();
    render(<ScheduleActions onGenerate={onGenerate} generating={false} hasSchedule={false} />);
    const btn = screen.getByTestId('schedule-generate');
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(onGenerate).not.toHaveBeenCalled();
  });

  // O3. Generate REPLACES the whole schedule once one exists, and it sat in a
  // row of five 8px-apart buttons wearing the one primary style on the header.
  // Two things follow: it must not look like the invitation, and the press
  // must arm.
  it('arms before replacing an existing schedule, and commits on the second press', async () => {
    const onGenerate = vi.fn();
    render(<ScheduleActions onGenerate={onGenerate} generating={false} hasSchedule />);
    const btn = screen.getByTestId('schedule-generate');

    await userEvent.click(btn);
    expect(onGenerate).not.toHaveBeenCalled();
    expect(btn).toHaveTextContent(/replace/i);

    await userEvent.click(btn);
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('Escape cancels an accidental arm instead of waiting the window out', async () => {
    const onGenerate = vi.fn();
    render(<ScheduleActions onGenerate={onGenerate} generating={false} hasSchedule />);
    const btn = screen.getByTestId('schedule-generate');

    await userEvent.click(btn);
    expect(btn).toHaveTextContent(/replace/i);

    await userEvent.keyboard('{Escape}');
    expect(btn).toHaveTextContent('Generate');

    // Disarmed, so the next press arms again rather than replacing the plan.
    await userEvent.click(btn);
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('drops the primary glow once the press would replace a schedule', () => {
    const { rerender } = render(
      <ScheduleActions onGenerate={vi.fn()} generating={false} hasSchedule={false} />,
    );
    // First solve of the day: this IS the primary action of the surface.
    expect(screen.getByTestId('schedule-generate').className).toMatch(/shadow-glow/);

    rerender(<ScheduleActions onGenerate={vi.fn()} generating={false} hasSchedule />);
    expect(screen.getByTestId('schedule-generate').className).not.toMatch(/shadow-glow/);
  });

  it('names the stakes on a live day', async () => {
    render(<ScheduleActions onGenerate={vi.fn()} generating={false} hasSchedule liveDay />);
    const btn = screen.getByTestId('schedule-generate');
    await userEvent.click(btn);
    expect(btn).toHaveTextContent('Replace LIVE schedule?');
  });

  it('names the permission, not the empty roster, when both would block', () => {
    // A viewer looking at an empty workspace should be told the thing they
    // cannot change, not handed a task they are not allowed to perform.
    asRole('viewer');
    render(
      <ScheduleActions
        onGenerate={vi.fn()}
        generating={false}
        hasSchedule={false}
        hasMatches={false}
      />,
    );
    expect(screen.getByTestId('schedule-generate')).not.toHaveAttribute(
      'title',
      'Add matches before generating a schedule',
    );
  });
});
