import { execSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost';
const HEALTH_URL = `${BASE_URL}/api/health`;
const PLAY_BASE_URL = process.env.E2E_PLAY_BASE_URL ?? 'http://localhost:8081';
const PLAY_CONFIG_URL = `${PLAY_BASE_URL}/e/api/config`;
const STARTUP_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 2_000;

const MANAGE_STACK = process.env.E2E_MANAGE_STACK !== '0';
const FORCE_REBUILD = process.env.E2E_REBUILD === '1';

export function requiresEntrantOrigin(
  env: { E2E_REQUIRE_PLAY?: string; npm_lifecycle_event?: string } = process.env,
): boolean {
  return env.E2E_REQUIRE_PLAY === '1' || env.npm_lifecycle_event === 'test:entrant-evidence';
}

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(HEALTH_URL);
      if (res.ok) {
        const body = await res.json();
        if (body?.status === 'healthy') {
          console.log(`[e2e] stack healthy at ${HEALTH_URL} (version=${body.version})`);
          return;
        }
      }
      lastError = new Error(`unhealthy response: ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `[e2e] stack did not become healthy within ${STARTUP_TIMEOUT_MS / 1000}s; last error: ${lastError}`,
  );
}

async function waitForEntrantOrigin(): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(PLAY_CONFIG_URL);
      if (res.ok) {
        console.log(`[e2e] entrant origin ready at ${PLAY_CONFIG_URL}`);
        return;
      }
      lastError = new Error(`unhealthy response: ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `[e2e] entrant origin did not become ready within ${STARTUP_TIMEOUT_MS / 1000}s; last error: ${lastError}`,
  );
}

export default async function globalSetup(): Promise<void> {
  if (!MANAGE_STACK) {
    console.log('[e2e] E2E_MANAGE_STACK=0 — skipping docker orchestration');
    await waitForHealth();
    if (requiresEntrantOrigin()) await waitForEntrantOrigin();
    return;
  }

  const upFlags = FORCE_REBUILD ? '-d --build' : '-d';
  // URL.pathname encodes spaces as %20 — use fileURLToPath so `execSync`
  // gets a real decoded filesystem path when the project dir contains a space.
  // The compose stack lives in infra/compose/ since SP-REORG-1. This used to
  // resolve `..` (products/scheduler), where the compose file sat beside the
  // apps; the stack directory and the suite's own parent are no longer the
  // same place, so it is spelled out rather than derived from one `..`.
  const stackDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'infra', 'compose');
  console.log(`[e2e] docker-compose up ${upFlags}`);
  execSync(`docker-compose up ${upFlags}`, {
    cwd: stackDir,
    stdio: 'inherit',
  });

  await waitForHealth();
  if (requiresEntrantOrigin()) await waitForEntrantOrigin();
}
