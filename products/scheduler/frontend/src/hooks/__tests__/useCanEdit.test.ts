/**
 * The A2 contract at the seam: a viewer's write must no-op CLIENT-SIDE — never
 * reach the wire — and must say why rather than failing silently.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { assertCanEdit } from '../useCanEdit';
import { useUiStore } from '../../store/uiStore';

describe('assertCanEdit — the mutation-seam backstop', () => {
  beforeEach(() => {
    useUiStore.setState({ activeTournamentRole: null, toasts: [] });
  });

  it('lets an operator through without a toast', () => {
    useUiStore.setState({ activeTournamentRole: 'operator' });
    expect(assertCanEdit()).toBe(true);
    expect(useUiStore.getState().toasts).toHaveLength(0);
  });

  it('lets an owner through', () => {
    useUiStore.setState({ activeTournamentRole: 'owner' });
    expect(assertCanEdit()).toBe(true);
  });

  it('refuses a viewer and explains — the refusal is never silent', () => {
    useUiStore.setState({ activeTournamentRole: 'viewer' });
    expect(assertCanEdit()).toBe(false);
    const toasts = useUiStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toMatch(/view-only/i);
  });

  it('fails closed while the role is still unknown', () => {
    // Guessing "allow" during the load window would re-open the A2 bug.
    expect(assertCanEdit()).toBe(false);
  });
});
