import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SyncHealthIndicator, deriveSyncHealth } from '../SyncHealthIndicator';

describe('SyncHealthIndicator', () => {
  const now = 100_000;

  it('distinguishes connected, refreshing, stale, and offline', () => {
    expect(deriveSyncHealth(now, 99_500, null)).toBe('connected');
    expect(deriveSyncHealth(now, null, null)).toBe('refreshing');
    expect(deriveSyncHealth(now, 80_000, null)).toBe('stale');
    expect(deriveSyncHealth(now, 50_000, 'Connection lost')).toBe('offline');
    expect(deriveSyncHealth(now, 99_500, null, true)).toBe('offline');
  });

  it('states freshness and last update in text, while healthy state stays visually quiet', () => {
    const { rerender } = render(
      <SyncHealthIndicator lastSyncedAt={99_500} nowMs={now} />,
    );
    expect(screen.getByTestId('sync-health-indicator')).toHaveTextContent(/Connected/);
    expect(screen.getByTestId('sync-health-indicator')).toHaveClass('sr-only');

    rerender(<SyncHealthIndicator lastSyncedAt={80_000} nowMs={now} />);
    expect(screen.getByTestId('sync-health-indicator')).toHaveTextContent(/Stale/);
    expect(screen.getByTestId('sync-health-indicator')).toHaveTextContent(/Last updated/);
    expect(screen.getByTestId('sync-health-indicator')).not.toHaveClass('sr-only');
  });
});
