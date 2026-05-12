import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const MANAGE_STACK = process.env.E2E_MANAGE_STACK !== '0';
const KEEP_STACK = process.env.E2E_KEEP_STACK === '1';

export default async function globalTeardown(): Promise<void> {
  if (!MANAGE_STACK || KEEP_STACK) {
    console.log('[e2e] leaving docker stack running');
    return;
  }
  const productRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  console.log('[e2e] docker-compose down');
  execSync('docker-compose down', {
    cwd: productRoot,
    stdio: 'inherit',
  });
}
