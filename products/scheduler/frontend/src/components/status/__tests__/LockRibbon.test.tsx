import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LockRibbon } from '../LockRibbon';
import { useTournamentStore } from '../../../store/tournamentStore';

describe('LockRibbon', () => {
  beforeEach(() => {
    useTournamentStore.setState({ isScheduleLocked: false });
  });

  it('soft tier: amber caution naming the data-loss consequence', () => {
    render(<LockRibbon tier="soft" locked />);
    const ribbon = screen.getByTestId('lock-ribbon');
    expect(ribbon.dataset.tier).toBe('soft');
    expect(ribbon).toHaveTextContent('Schedule locked');
    expect(ribbon).toHaveTextContent('Saving will clear the committed schedule.');
    expect(ribbon.className).toContain('bg-status-warning-bg');
  });

  it('hard tier: calm neutral read-only state with an exit-path action', () => {
    render(
      <LockRibbon
        tier="hard"
        locked
        action={<a href="/draws">View draws →</a>}
      />,
    );
    const ribbon = screen.getByTestId('lock-ribbon');
    expect(ribbon.dataset.tier).toBe('hard');
    expect(ribbon).toHaveTextContent('Results in play');
    expect(ribbon).toHaveTextContent(
      'Settings are read-only until the started draws are finished or reset.',
    );
    // Protective state must NOT read as an alarm.
    expect(ribbon.className).not.toContain('bg-status-warning-bg');
    expect(screen.getByRole('link', { name: 'View draws →' })).toBeInTheDocument();
  });

  it('renders nothing when not locked', () => {
    render(<LockRibbon tier="soft" locked={false} />);
    expect(screen.queryByTestId('lock-ribbon')).toBeNull();
  });

  it('falls back to the meet store flag when `locked` is omitted', () => {
    useTournamentStore.setState({ isScheduleLocked: true });
    render(<LockRibbon tier="soft" />);
    expect(screen.getByTestId('lock-ribbon')).toBeInTheDocument();
  });
});
