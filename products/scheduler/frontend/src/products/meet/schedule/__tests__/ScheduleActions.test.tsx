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
