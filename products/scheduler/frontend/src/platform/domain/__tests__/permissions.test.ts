/**
 * Interaction-audit finding A2: the app never threaded the caller's role into
 * its surfaces. A `viewer` saw the full editing UI with every control enabled;
 * each press optimistically applied, then 403'd ("Role 'viewer' is insufficient")
 * with a futile "Save now" retry, leaving local state diverged from the server.
 *
 * The contract: a viewer's press must no-op CLIENT-SIDE — never reach the wire.
 */
import { describe, it, expect } from 'vitest';
import { canEdit, roleLabel } from '../permissions';

describe('permissions.canEdit — mirrors backend require_tournament_access', () => {
  it('owner and operator may write', () => {
    expect(canEdit('owner')).toBe(true);
    expect(canEdit('operator')).toBe(true);
  });

  it('viewer may not write', () => {
    expect(canEdit('viewer')).toBe(false);
  });

  it('an unknown/absent role is treated as read-only, never as write access', () => {
    // Fail CLOSED. While the role is still loading (null) we must not let a
    // press through optimistically — a wrong "allow" is exactly the A2 bug.
    expect(canEdit(null)).toBe(false);
    expect(canEdit(undefined)).toBe(false);
  });

  it('labels the role for the read-only explanation', () => {
    expect(roleLabel('viewer')).toBe('Viewer');
    expect(roleLabel(null)).toBe('Viewer');
  });
});
