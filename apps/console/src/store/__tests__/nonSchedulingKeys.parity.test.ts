/**
 * Pins the console NON_SCHEDULING_KEYS to the shared contract the API
 * classifier loads. If this fails, one side changed the exempt list
 * without the other.
 *
 * The path is gone on purpose (F-DM-53). This used to reach the file by
 * counting five directory levels up — the exact fragility
 * `config_lock._locate_shared`'s docstring argues against, in a test five
 * directories deep. The contract is a workspace package now, so it is
 * imported by name and a move on either side is a resolution error, not a
 * silently wrong file.
 */
import { describe, expect, it } from 'vitest';
import contract from '@scheduler/shared-contract/non-scheduling-keys.json';
import { NON_SCHEDULING_KEYS } from '../tournamentStore';

describe('non-scheduling keys parity', () => {
  it('console list matches the shared contract', () => {
    expect([...NON_SCHEDULING_KEYS].sort()).toEqual([...contract.keys].sort());
  });

  it('reads a contract version this side understands', () => {
    // R-DM-8(a): the console half of the same refusal the backend makes.
    // A bumped version means the shape changed and this mirror is suspect.
    expect(contract.version).toBe(1);
  });
});
