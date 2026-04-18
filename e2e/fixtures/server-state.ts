/**
 * Helpers for seeding / clearing the server-side tournament state file
 * from Playwright tests.
 *
 * With the persistence layer in place, `useTournamentState` hydrates from
 * the server on every app mount and will overwrite anything seeded via
 * localStorage. Any test that needs a known starting tournament must push
 * it through `PUT /tournament/state` before navigating.
 */
import type { APIRequestContext } from '@playwright/test';
import { SEED_TOURNAMENT } from './seed';

export async function resetServerState(request: APIRequestContext): Promise<void> {
  await request.put('/api/tournament/state', {
    data: {
      version: 1,
      config: null,
      groups: [],
      players: [],
      matches: [],
      schedule: null,
      scheduleStats: null,
      scheduleIsStale: false,
    },
  });
}

export async function seedServer(
  request: APIRequestContext,
  seed: typeof SEED_TOURNAMENT = SEED_TOURNAMENT,
): Promise<void> {
  const s = seed.state;
  await request.put('/api/tournament/state', {
    data: {
      version: 1,
      config: s.config,
      groups: s.groups,
      players: s.players,
      matches: s.matches,
      schedule: null,
      scheduleStats: null,
      scheduleIsStale: false,
    },
  });
}
