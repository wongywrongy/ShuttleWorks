/**
 * The tiers are named for the CONDITION (`schedule` / `results`), not the
 * volume (`soft` / `hard`). What these tests hold is the pairing of the two
 * axes that decide a tier: editable-vs-read-only, and pending-consequence
 * (warning) vs standing-condition (neutral).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LockRibbon } from '../LockRibbon';
import { useTournamentStore } from '../../../store/tournamentStore';

describe('LockRibbon', () => {
  beforeEach(() => {
    useTournamentStore.setState({ isScheduleLocked: false });
  });

  it('schedule tier: amber caution naming the data-loss consequence', () => {
    render(<LockRibbon tier="schedule" locked />);
    const ribbon = screen.getByTestId('lock-ribbon');
    expect(ribbon.dataset.tier).toBe('schedule');
    expect(ribbon).toHaveTextContent('Schedule committed');
    expect(ribbon).toHaveTextContent('Saving these settings will clear it.');
    // Warning severity is for a consequence the operator is ABOUT to cause.
    expect(ribbon.className).toContain('bg-status-warning-bg');
  });

  it('results tier: calm neutral read-only state with an exit-path action', () => {
    render(
      <LockRibbon
        tier="results"
        locked
        action={<a href="/draws">View draws →</a>}
      />,
    );
    const ribbon = screen.getByTestId('lock-ribbon');
    expect(ribbon.dataset.tier).toBe('results');
    expect(ribbon).toHaveTextContent('Results recorded');
    expect(ribbon).toHaveTextContent(
      'Settings are read-only while matches are in play.',
    );
    // A standing condition with nothing pending must NOT read as an alarm —
    // colouring every lock amber is what teaches an operator to skip amber.
    expect(ribbon.className).not.toContain('bg-status-warning-bg');
    // An inert surface has to name where the state is resolved.
    expect(screen.getByRole('link', { name: 'View draws →' })).toBeInTheDocument();
  });

  it('both tiers read as one family: same anatomy, engine-neutral copy', () => {
    // The copy names no engine, so Meet and Bracket Configuration show the
    // identical banner for the identical condition — the divergence that
    // prompted the rename.
    const { unmount } = render(<LockRibbon tier="schedule" locked />);
    const scheduleText = screen.getByTestId('lock-ribbon').textContent ?? '';
    unmount();
    render(<LockRibbon tier="results" locked />);
    const resultsText = screen.getByTestId('lock-ribbon').textContent ?? '';

    for (const text of [scheduleText, resultsText]) {
      expect(text).not.toMatch(/draw|meet|bracket/i);
      // "<Condition>. <Consequence or reason>." — one sentence pattern.
      expect(text).toMatch(/^[^.]+\.\s*[^.]+\./);
    }
  });

  it('renders nothing when not locked', () => {
    render(<LockRibbon tier="schedule" locked={false} />);
    expect(screen.queryByTestId('lock-ribbon')).toBeNull();
  });

  it('falls back to the meet store flag when `locked` is omitted', () => {
    useTournamentStore.setState({ isScheduleLocked: true });
    render(<LockRibbon tier="schedule" />);
    expect(screen.getByTestId('lock-ribbon')).toBeInTheDocument();
  });
});
