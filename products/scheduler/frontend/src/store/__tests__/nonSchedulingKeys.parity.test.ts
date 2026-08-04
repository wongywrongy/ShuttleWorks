/**
 * Pins the frontend NON_SCHEDULING_KEYS to the shared JSON the backend
 * classifier loads (products/scheduler/shared/non-scheduling-keys.json).
 * If this fails, one side changed the exempt list without the other.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NON_SCHEDULING_KEYS } from '../tournamentStore';

describe('non-scheduling keys parity', () => {
  it('frontend list matches the shared JSON', () => {
    const jsonPath = resolve(
      __dirname,
      '../../../../shared/non-scheduling-keys.json',
    );
    const shared: string[] = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    expect([...NON_SCHEDULING_KEYS].sort()).toEqual([...shared].sort());
  });
});
