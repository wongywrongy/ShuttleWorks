import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const MANAGE_STACK = process.env.E2E_MANAGE_STACK !== '0';
const KEEP_STACK = process.env.E2E_KEEP_STACK === '1';

export default async function globalTeardown(): Promise<void> {
  if (!MANAGE_STACK || KEEP_STACK) {
    console.log('[e2e] leaving docker stack running');
    return;
  }
  // The compose stack lives in infra/compose/ since SP-REORG-1. This used to
  // resolve `..` (products/scheduler), where the compose file sat beside the
  // apps; the stack directory and the suite's own parent are no longer the
  // same place, so it is spelled out rather than derived from one `..`.
  const stackDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'infra', 'compose');
  // Match global setup: Docker Compose v2 is a `docker compose` plugin, not
  // necessarily the separately installed legacy `docker-compose` binary.
  console.log('[e2e] docker compose down');
  execFileSync('docker', ['compose', 'down'], {
    cwd: stackDir,
    stdio: 'inherit',
  });
}
