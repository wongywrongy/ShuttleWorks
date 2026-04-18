import { execSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost';
const HEALTH_URL = `${BASE_URL}/api/health`;
const STARTUP_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 2_000;

const MANAGE_STACK = process.env.E2E_MANAGE_STACK !== '0';
const FORCE_REBUILD = process.env.E2E_REBUILD === '1';

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

export default async function globalSetup(): Promise<void> {
  if (!MANAGE_STACK) {
    console.log('[e2e] E2E_MANAGE_STACK=0 — skipping docker orchestration');
    await waitForHealth();
    return;
  }

  const upFlags = FORCE_REBUILD ? '-d --build' : '-d';
  // URL.pathname encodes spaces as %20 — use fileURLToPath so `execSync`
  // gets a real decoded filesystem path when the project dir contains a space.
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  console.log(`[e2e] docker-compose up ${upFlags}`);
  execSync(`docker-compose up ${upFlags}`, {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  await waitForHealth();
}
