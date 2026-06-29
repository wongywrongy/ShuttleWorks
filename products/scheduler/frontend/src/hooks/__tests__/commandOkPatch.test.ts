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
});
