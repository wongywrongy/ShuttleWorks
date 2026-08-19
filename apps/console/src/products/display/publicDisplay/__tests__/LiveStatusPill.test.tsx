/**
 * `LiveStatusPill` is the public TV boards' only visible connection
 * indicator. It must speak spectator-calm freshness (Live / Delayed /
 * Out of date), never operator/technical language. This test pins the
 * three labels and asserts the retired operator vocabulary — and any
 * "server"/"backend" wording — never renders, for any freshness state.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveStatusPill } from '../LiveStatusPill';
import type { FreshnessState } from '../freshness';

const FORBIDDEN = [/reconnecting/i, /offline/i, /server/i, /backend/i];

function renderPill(status: FreshnessState) {
  const { unmount } = render(<LiveStatusPill status={status} />);
  return unmount;
}

describe('LiveStatusPill', () => {
  it('renders "Live" for the live state', () => {
    renderPill('live');
    expect(screen.getByTestId('tv-live-status')).toHaveTextContent('Live');
  });

  it('renders "Delayed" for the delayed state', () => {
    renderPill('delayed');
    expect(screen.getByTestId('tv-live-status')).toHaveTextContent('Delayed');
  });

  it('renders "Out of date" for the stale state', () => {
    renderPill('stale');
    expect(screen.getByTestId('tv-live-status')).toHaveTextContent('Out of date');
  });

  it('never renders operator/technical language, in any state', () => {
    (['live', 'delayed', 'stale'] as const).forEach((status) => {
      const unmount = renderPill(status);
      const pill = screen.getByTestId('tv-live-status');
      for (const pattern of FORBIDDEN) {
        expect(pill.textContent).not.toMatch(pattern);
        expect(pill.getAttribute('title') ?? '').not.toMatch(pattern);
      }
      unmount();
    });
  });
});
