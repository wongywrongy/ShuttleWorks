import { describe, it, expect } from 'vitest';
import { resolveActivePane, resolveModuleCatalog } from '../AppShell';
import type { ModuleId, WorkspaceModule } from '../../platform/product-shell/types';

const wm = (id: ModuleId, status: string): WorkspaceModule =>
  ({ id, label: id[0].toUpperCase() + id.slice(1), status, note: undefined }) as never;

describe('resolveActivePane', () => {
  it('renders the outlet when the active module is enterable', () => {
    const r = resolveActivePane('meet', [
      wm('meet', 'enabled'),
      wm('bracket', 'coming-soon'),
      wm('display', 'available'),
    ]);
    expect(r.kind).toBe('outlet');
  });
  it('renders the panel when the active module is coming-soon', () => {
    const r = resolveActivePane('bracket', [
      wm('meet', 'enabled'),
      wm('bracket', 'coming-soon'),
      wm('display', 'available'),
    ]);
    expect(r.kind).toBe('panel');
    if (r.kind === 'panel') {
      expect(r.label).toBe('Bracket');
      expect(r.primary).toBe('meet');
      expect(r.canOpenSettings).toBe(false);
    }
  });
  it('panel offers settings only when the module is disabled', () => {
    const r = resolveActivePane('display', [wm('meet', 'enabled'), wm('display', 'disabled')]);
    expect(r.kind).toBe('panel');
    if (r.kind === 'panel') expect(r.canOpenSettings).toBe(true);
  });
  it('renders the outlet when status is unknown/loading (resilient)', () => {
    const r = resolveActivePane('meet', []);
    expect(r.kind).toBe('outlet');
  });
});

/**
 * The absent-module guard (SP-E1-1).
 *
 * Before this, an active module missing from the catalog fell through to the
 * outlet — and `ModuleOutlet`'s final `else` is `<MeetProduct />`. That was
 * harmless only while every module in the union also appeared in the
 * kind-derived fallback. Entries is cloud-only, so it appears in no fallback
 * and in no local-mode catalog: `/tournaments/{id}/entries` would have
 * rendered the Meet product under an Entries URL, silently.
 */
describe('resolveActivePane — unknown/absent module fails closed', () => {
  it('shows the unavailable panel once the real catalog says the module is absent', () => {
    const r = resolveActivePane(
      'entries',
      [wm('meet', 'enabled'), wm('display', 'available')],
      true,
    );
    expect(r.kind).toBe('panel');
    if (r.kind === 'panel') {
      // A label, not a raw id — the module has no row to read one off.
      expect(r.label).toBe('Entries');
      expect(r.note).toMatch(/not available in this workspace/i);
      // And a way out, rather than a dead end.
      expect(r.primary).toBe('meet');
      // Nothing to "enable" — the row does not exist to be turned on.
      expect(r.canOpenSettings).toBe(false);
    }
  });

  it('still fails OPEN while the catalog is loading', () => {
    // NEGATIVE CONTROL for the guard: flip the one bit that arms it and the
    // answer inverts. This is not defensive padding — failing closed during
    // the load window would flash the unavailable panel at an operator whose
    // module IS enabled, on every workspace entry.
    const r = resolveActivePane('entries', [wm('meet', 'enabled')], false);
    expect(r.kind).toBe('outlet');
  });

  it('a present, enterable entries module still gets the outlet', () => {
    // The guard must not fire on the happy path it was written to protect.
    const r = resolveActivePane(
      'entries',
      [wm('meet', 'enabled'), wm('entries', 'enabled')],
      true,
    );
    expect(r.kind).toBe('outlet');
  });

  it('an empty catalog that has actually loaded also fails closed', () => {
    const r = resolveActivePane('meet', [], true);
    expect(r.kind).toBe('panel');
  });
});

/**
 * A failed `/modules` fetch must not be answered with a guess.
 *
 * 2026-08-10 browser pass: with the endpoint 500ing, Husky Open (bracket +
 * display, both enabled) rendered a Meet section that is not enabled, hid
 * Bracket and Display, and drew the Meet group as an empty grey void — while
 * the main pane showed bracket content. The kind-derived catalog is the right
 * answer for the LOAD WINDOW (where it prevents a flash) and the wrong answer
 * for a FAILURE, where it is a plausible-looking lie.
 */
describe('resolveModuleCatalog — loading may guess, failure may not', () => {
  it('uses the real catalog whenever it has arrived', () => {
    const real = [wm('bracket', 'enabled'), wm('display', 'enabled')];
    expect(resolveModuleCatalog(real, false, 'bracket')).toBe(real);
  });

  it('falls back to the kind-derived catalog WHILE the fetch is in flight', () => {
    expect(resolveModuleCatalog(null, false, 'bracket').map((m) => m.id)).toEqual([
      'meet',
      'bracket',
      'display',
    ]);
  });

  it('yields NOTHING once the fetch has failed — unknown is not meet-shaped', () => {
    expect(resolveModuleCatalog(null, true, null)).toEqual([]);
    // The exact reported shape: kind is null on the kind-agnostic Overview,
    // and the fallback defaulted that to a meet-enabled workspace.
    expect(resolveModuleCatalog(null, true, 'meet')).toEqual([]);
  });
});
