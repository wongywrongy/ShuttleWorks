/**
 * Vitest + React Testing Library coverage for Step G's three
 * conflict-UI components.
 *
 * The prompt's five required scenarios plus a few supplementary
 * assertions on dismiss-button visibility, tooltip text, and the
 * exact transition behaviour of the connection indicator.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { PendingBadge } from '../../../components/PendingBadge';
import { ConflictBanner } from '../../../components/ConflictBanner';
import { ConnectionIndicator } from '../../../components/ConnectionIndicator';
import { useMatchStateStore } from '../../../store/matchStateStore';

beforeEach(() => {
  // Each test starts with a clean store so subscriber-style banners
  // don't leak state between cases.
  useMatchStateStore.getState().reset();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---- PendingBadge -----------------------------------------------------

describe('PendingBadge', () => {
  it('renders the pulsing dot when isPending is true', () => {
    render(<PendingBadge isPending={true} />);
    const badge = screen.getByTestId('pending-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('animate-pulse');
    expect(badge.className).toContain('bg-amber-500');
  });

  it('renders nothing when isPending is false', () => {
    const { container } = render(<PendingBadge isPending={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('uses the prompt-specified tooltip text by default', () => {
    render(<PendingBadge isPending={true} />);
    const badge = screen.getByTestId('pending-badge');
    expect(badge).toHaveAttribute(
      'title',
      'Change pending — waiting for connection',
    );
  });
});

// ---- ConflictBanner — stale_version flavour --------------------------

describe('ConflictBanner — stale_version', () => {
  it('renders the prompt-specified copy and auto-dismisses after 4 s', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <ConflictBanner
        flavour="stale_version"
        message="Server is canonical"
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByTestId('conflict-banner-stale_version')).toBeInTheDocument();
    expect(
      screen.getByText(/Updated by someone else — reloaded/),
    ).toBeInTheDocument();

    // Banner has no dismiss button — the stale flavour is informational.
    expect(screen.queryByTestId('conflict-dismiss')).not.toBeInTheDocument();

    // Advance 3999 ms — still visible.
    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(
      screen.queryByTestId('conflict-banner-stale_version'),
    ).toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();

    // Advance one more ms — auto-dismiss fires.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(
      screen.queryByTestId('conflict-banner-stale_version'),
    ).not.toBeInTheDocument();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

// ---- ConflictBanner — conflict flavour -------------------------------

describe('ConflictBanner — conflict', () => {
  it('renders the server-supplied message + dismiss button; persists until clicked', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <ConflictBanner
        flavour="conflict"
        message="Cannot transition match m1 from 'finished' to 'called'"
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByTestId('conflict-banner-conflict')).toBeInTheDocument();
    expect(
      screen.getByText(/Cannot transition match m1 from 'finished' to 'called'/),
    ).toBeInTheDocument();

    // Far past the stale-version auto-dismiss window — still here.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId('conflict-banner-conflict')).toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();

    // Click the dismiss button — banner disappears.
    fireEvent.click(screen.getByTestId('conflict-dismiss'));
    expect(
      screen.queryByTestId('conflict-banner-conflict'),
    ).not.toBeInTheDocument();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

// ---- ConflictBanner — subscriber mode --------------------------------

describe('ConflictBanner — subscriber mode', () => {
  it('renders when the store records a conflict for the match id', () => {
    useMatchStateStore.getState().recordConflict('m-sub', 'conflict', 'No-go');
    render(<ConflictBanner matchId="m-sub" />);
    expect(screen.getByTestId('conflict-banner-conflict')).toBeInTheDocument();
    expect(screen.getByText('No-go')).toBeInTheDocument();
  });

  it('renders nothing when the store has no conflict for the match id', () => {
    const { container } = render(<ConflictBanner matchId="m-clean" />);
    expect(container.firstChild).toBeNull();
  });
});

// ---- ConnectionIndicator ---------------------------------------------

describe('ConnectionIndicator', () => {
  it('renders green dot, no text, when both signals are healthy', () => {
    render(<ConnectionIndicator reachability="online" realtime="connected" />);
    const indicator = screen.getByTestId('connection-indicator');
    expect(indicator).toHaveAttribute('data-state', 'green');
    expect(screen.queryByTestId('connection-text')).not.toBeInTheDocument();
  });

  it('renders amber + "Reconnecting…" when reachability is offline but realtime is connected', () => {
    render(<ConnectionIndicator reachability="offline" realtime="connected" />);
    expect(screen.getByTestId('connection-indicator')).toHaveAttribute(
      'data-state',
      'amber',
    );
    expect(screen.getByTestId('connection-text').textContent).toBe('Reconnecting…');
  });

  it('renders amber when reachability is online but realtime is reconnecting', () => {
    render(<ConnectionIndicator reachability="online" realtime="reconnecting" />);
    expect(screen.getByTestId('connection-indicator')).toHaveAttribute(
      'data-state',
      'amber',
    );
  });

  it('stays amber until the 60-second threshold elapses with both offline', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <ConnectionIndicator
        reachability="offline"
        realtime="disconnected"
        redThresholdMs={60_000}
      />,
    );
    expect(screen.getByTestId('connection-indicator')).toHaveAttribute(
      'data-state',
      'amber',
    );

    // 59 999 ms in — still amber.
    act(() => {
      vi.advanceTimersByTime(59_999);
    });
    rerender(
      <ConnectionIndicator
        reachability="offline"
        realtime="disconnected"
        redThresholdMs={60_000}
      />,
    );
    expect(screen.getByTestId('connection-indicator')).toHaveAttribute(
      'data-state',
      'amber',
    );

    // One more ms — flips to red + "Offline".
    act(() => {
      vi.advanceTimersByTime(1);
    });
    rerender(
      <ConnectionIndicator
        reachability="offline"
        realtime="disconnected"
        redThresholdMs={60_000}
      />,
    );
    expect(screen.getByTestId('connection-indicator')).toHaveAttribute(
      'data-state',
      'red',
    );
    expect(screen.getByTestId('connection-text').textContent).toBe('Offline');
  });

  it('flips back to amber the moment either signal recovers', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <ConnectionIndicator
        reachability="offline"
        realtime="disconnected"
        redThresholdMs={1_000}
      />,
    );
    // Advance past the threshold so we go red.
    act(() => {
      vi.advanceTimersByTime(1_001);
    });
    rerender(
      <ConnectionIndicator
        reachability="offline"
        realtime="disconnected"
        redThresholdMs={1_000}
      />,
    );
    expect(screen.getByTestId('connection-indicator')).toHaveAttribute(
      'data-state',
      'red',
    );

    // Realtime recovers — indicator should go back to amber
    // (reachability is still offline).
    rerender(
      <ConnectionIndicator
        reachability="offline"
        realtime="connected"
        redThresholdMs={1_000}
      />,
    );
    expect(screen.getByTestId('connection-indicator')).toHaveAttribute(
      'data-state',
      'amber',
    );
  });
});
