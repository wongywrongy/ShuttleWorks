/**
 * Unit tests for _buildCommandOkPatch — the pure helper extracted from
 * useCommandQueue's case 'ok' branch (SP-G1 carry-over from Task 5).
 *
 * These tests prove that a command response carrying `time_slot` produces
 * `actualSlotId` on the stored match-state patch, without spinning up the
 * full hook (which depends on IndexedDB, Zustand, and the API client).
 */
import { describe, expect, it } from 'vitest';
import { _buildCommandOkPatch } from '../useCommandQueue';
import type { MatchStateDTO } from '../../api/dto';

const base: MatchStateDTO = { matchId: 'm1', status: 'scheduled' };

describe('_buildCommandOkPatch', () => {
  it('maps a non-null time_slot to actualSlotId', () => {
    const patch = _buildCommandOkPatch(base, 'called', 7);
    expect(patch.actualSlotId).toBe(7);
  });

  it('updates the status to the provided legacy status', () => {
    const patch = _buildCommandOkPatch(base, 'started', null);
    expect(patch.status).toBe('started');
  });

  it('does not set actualSlotId when time_slot is null', () => {
    const patch = _buildCommandOkPatch(base, 'called', null);
    expect(patch.actualSlotId).toBeUndefined();
  });

  it('preserves an existing actualSlotId when time_slot is null', () => {
    const prev: MatchStateDTO = { ...base, actualSlotId: 5 };
    const patch = _buildCommandOkPatch(prev, 'started', null);
    // null time_slot must not clobber an existing slot value
    expect(patch.actualSlotId).toBe(5);
  });

  it('overwrites an existing actualSlotId when time_slot is non-null', () => {
    const prev: MatchStateDTO = { ...base, actualSlotId: 5 };
    const patch = _buildCommandOkPatch(prev, 'called', 9);
    expect(patch.actualSlotId).toBe(9);
  });

  it('preserves all other fields from the previous state', () => {
    const prev: MatchStateDTO = {
      ...base,
      actualCourtId: 3,
      notes: 'some note',
      delayed: true,
    };
    const patch = _buildCommandOkPatch(prev, 'called', 7);
    expect(patch.actualCourtId).toBe(3);
    expect(patch.notes).toBe('some note');
    expect(patch.delayed).toBe(true);
    expect(patch.matchId).toBe('m1');
  });

  it('maps a non-null courtId to actualCourtId (C-2)', () => {
    const patch = _buildCommandOkPatch(base, 'called', null, 4);
    expect(patch.actualCourtId).toBe(4);
  });

  it('does not overwrite actualCourtId when courtId is null (C-2)', () => {
    const prev: MatchStateDTO = { ...base, actualCourtId: 2 };
    const patch = _buildCommandOkPatch(prev, 'called', null, null);
    expect(patch.actualCourtId).toBe(2);
  });
});

// ── action-aware postpone / assign (RED: these fail before the fix) ─────────

describe('_buildCommandOkPatch — action-aware postpone_match / assign_court', () => {
  const courted: MatchStateDTO = {
    matchId: 'm1', status: 'scheduled', actualCourtId: 2, actualSlotId: 5,
  };

  it('postpone_match sets postponed=true and clears actualCourtId + actualSlotId', () => {
    const patch = _buildCommandOkPatch(courted, 'scheduled', null, null, 'postpone_match');
    expect(patch.postponed).toBe(true);
    expect(patch.actualCourtId).toBeUndefined();
    expect(patch.actualSlotId).toBeUndefined();
  });

  it('assign_court sets postponed=false and wires actualCourtId + actualSlotId', () => {
    const prev: MatchStateDTO = { matchId: 'm1', status: 'scheduled', postponed: true };
    const patch = _buildCommandOkPatch(prev, 'scheduled', 7, 3, 'assign_court');
    expect(patch.postponed).toBe(false);
    expect(patch.actualCourtId).toBe(3);
    expect(patch.actualSlotId).toBe(7);
  });

  it('other actions leave postponed unchanged (no mutation)', () => {
    const prev: MatchStateDTO = { matchId: 'm1', status: 'scheduled', postponed: true };
    const patch = _buildCommandOkPatch(prev, 'called', null, null, 'call_to_court');
    expect(patch.postponed).toBe(true);
  });

  it('no action param leaves postponed unchanged (backward compat)', () => {
    const prev: MatchStateDTO = { matchId: 'm1', status: 'scheduled', postponed: true };
    const patch = _buildCommandOkPatch(prev, 'called', null);
    expect(patch.postponed).toBe(true);
  });
});
