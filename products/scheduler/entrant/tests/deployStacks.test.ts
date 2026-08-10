/**
 * What the deployment stacks hand this app (Task 22).
 *
 * Three facts about the entrant container are load-bearing and none of them
 * is visible from inside the app's own code:
 *
 *   1. `API_BASE_URL` must be set. `apiBaseUrl()` throws when it is not —
 *      deliberately — so a container without it serves 500s and nothing
 *      else. It was defined in NO compose file until this task.
 *   2. The container must run the BUILT output. In `development` mode React
 *      Router serializes error messages and absolute-path stack traces into
 *      `window.__reactRouterContext`, on a public page. Verified, not
 *      assumed: the same image run with `NODE_ENV=development` published
 *      `file:///app/products/scheduler/entrant/node_modules/...` frames into
 *      the HTML (task-22-report.md, mutation E).
 *   3. `SESSION_COOKIE_SECURE` is read by TWO processes — the backend for
 *      its session cookie, node for the `sw_play_csrf` nonce — on ONE
 *      origin. Nothing checked they agreed. A node container missing it
 *      issues the nonce without `Secure` on an HTTPS-only deployment.
 *
 * The compose files are read as text and sliced by service, rather than
 * parsed with a YAML library this workspace does not depend on. The slicing
 * is asserted before it is trusted: `every stack is sliced into services`
 * fails if the splitter stops finding them, which is the failure that would
 * otherwise make every check below vacuously green.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const STACK_DIR = join(import.meta.dirname, '..', '..');
const DOCKERFILE = join(import.meta.dirname, '..', 'Dockerfile');

const stackFiles = readdirSync(STACK_DIR).filter((f) => /^docker-compose.*\.yml$/.test(f));

function stackSource(file: string): string {
  return readFileSync(join(STACK_DIR, file), 'utf8');
}

/** `{ serviceName: yamlBlock }` for one compose file's `services:` mapping. */
function services(source: string): Record<string, string> {
  // Everything after `services:` up to the next TOP-LEVEL key. Without the
  // second cut, `networks:`/`secrets:`/`volumes:` and their children read as
  // services (selfhost gained four phantom ones).
  const after = source.split(/^services:\s*$/m)[1] ?? '';
  const body = after.split(/^\S/m)[0];
  const out: Record<string, string> = {};
  // A service key is exactly two spaces of indent; its block runs until the
  // next one. Comment lines at that indent are not keys.
  const heads = [...body.matchAll(/^ {2}([a-z][a-z0-9_-]*):\s*$/gm)];
  heads.forEach((head, i) => {
    const start = head.index! + head[0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index! : body.length;
    out[head[1]] = body.slice(start, end);
  });
  return out;
}

/** An `environment:` entry's value, or `undefined` when the key is absent. */
function envValue(service: string, key: string): string | undefined {
  return new RegExp(`^\\s*-\\s*${key}=(.*)$`, 'm').exec(service)?.[1].trim();
}

const stacks = Object.fromEntries(
  stackFiles.map((f) => [f, services(stackSource(f))]),
) as Record<string, Record<string, string>>;

const withEntrant = Object.entries(stacks).filter(([, svc]) => 'entrant' in svc);

describe('the compose files are actually being read', () => {
  it('finds every stack CI lints', () => {
    // The compose-lint job enumerates six files; if one is added or renamed
    // and this list does not move, the checks below stop covering it.
    expect(stackFiles.sort()).toEqual([
      'docker-compose.cloud.yml',
      'docker-compose.dev.yml',
      'docker-compose.release.yml',
      'docker-compose.selfhost.yml',
      'docker-compose.worker.yml',
      'docker-compose.yml',
    ]);
  });

  it('slices every stack into services', () => {
    // Non-vacuity for the whole file: a splitter that returned {} would make
    // "the entrant service sets X" pass by having no entrant service.
    for (const [file, svc] of Object.entries(stacks)) {
      expect(Object.keys(svc).length, file).toBeGreaterThan(0);
    }
    expect(Object.keys(stacks['docker-compose.selfhost.yml']).sort()).toEqual([
      'api',
      'cloudflared',
      'entrant',
      'frontend',
      'postgres',
    ]);
  });
});

describe('the entrant tier ships exactly where nginx can reach it', () => {
  it('is in every stack with a frontend, and no others', () => {
    // The rule, not a list: nginx implements the `/e/` prefix split, so a
    // stack with no nginx has nothing to put in front of this service.
    for (const [file, svc] of Object.entries(stacks)) {
      expect('entrant' in svc, `${file}: entrant should follow frontend`).toBe(
        'frontend' in svc,
      );
    }
    expect(withEntrant.map(([f]) => f).sort()).toEqual([
      'docker-compose.release.yml',
      'docker-compose.selfhost.yml',
      'docker-compose.yml',
    ]);
  });

  it.each(withEntrant)('%s publishes no host port for it', (_file, svc) => {
    // A published port is a second door into the entrant tier that bypasses
    // nginx's Cookie allowlist — the control that keeps the operator's
    // session out of this process.
    expect(svc.entrant).not.toMatch(/^\s*ports:/m);
  });

  it.each(withEntrant)('%s sets API_BASE_URL on it', (_file, svc) => {
    const value = envValue(svc.entrant, 'API_BASE_URL');
    expect(value).toBeDefined();
    // An internal compose-network address, not a public URL: node's fetches
    // are server-side.
    expect(value).toMatch(/^http:\/\/[a-z0-9_-]+:\d+$/);
  });

  it.each(withEntrant)('%s agrees with itself on SESSION_COOKIE_SECURE', (file, svc) => {
    const apiService = svc.api ?? svc.backend;
    expect(apiService, `${file} has an entrant but no API service`).toBeDefined();
    // Both may be absent (both default to false) or both present and equal.
    // Only a DISAGREEMENT is a finding — that is the thing that cannot be
    // seen from either process.
    expect(envValue(svc.entrant, 'SESSION_COOKIE_SECURE') ?? 'false').toBe(
      envValue(apiService, 'SESSION_COOKIE_SECURE') ?? 'false',
    );
  });

  it('is HTTPS-only in the stack that terminates TLS', () => {
    // Guards against the pair agreeing on the WRONG value: the check above
    // is satisfied by both being false, which on the tunnelled deployment
    // would drop `Secure` from both cookies.
    const selfhost = stacks['docker-compose.selfhost.yml'];
    expect(envValue(selfhost.entrant, 'SESSION_COOKIE_SECURE')).toBe('true');
    expect(envValue(selfhost.api, 'SESSION_COOKIE_SECURE')).toBe('true');
  });
});

describe('the entrant container runs the built output, never a dev server', () => {
  const dockerfile = readFileSync(DOCKERFILE, 'utf8');

  /**
   * THE LAST match, not any match. Docker honours the last `CMD` and the last
   * `ENV` of a given name in a stage, so `toMatch(/^CMD \["npm", "start"\]$/m)`
   * — which is what this asserted — stayed green with
   * `CMD ["npm", "run", "dev"]` appended below it. The container would then
   * run the Vite dev server and serialise absolute-path stack traces into a
   * public page: verbatim the failure this file's docblock exists to prevent,
   * with the guard reporting success.
   */
  function lastDirective(prefix: string, valuePattern: string): string | undefined {
    return [...dockerfile.matchAll(new RegExp(`^${prefix}(${valuePattern})$`, 'gm'))].at(-1)?.[1];
  }

  it('starts by exec-ing the server directly, in production mode', () => {
    // Not `npm start`: npm at PID 1 does not forward SIGTERM (every stop waits
    // out the 10s kill timeout) and wants a writable $HOME/.npm, which
    // `read_only: true` + `USER node` does not give it.
    expect(lastDirective('CMD ', '.*')).toBe(
      '["node", "./node_modules/@react-router/serve/bin.js", "./build/server/index.js"]',
    );
    // @react-router/serve passes NODE_ENV through as the render mode, so this
    // line is the switch between the built output and dev-mode stack traces.
    expect(lastDirective('ENV NODE_ENV=', '\\S+')).toBe('production');
    // The package scripts still describe the same two worlds, so `npm start`
    // stays a working local equivalent of the CMD above.
    const scripts = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
    ).scripts;
    expect(scripts.start).toBe('react-router-serve ./build/server/index.js');
    expect(scripts.dev).toContain('react-router dev');
  });

  it.each(withEntrant)('%s neither overrides the command nor the mode', (_file, svc) => {
    expect(svc.entrant).not.toMatch(/^\s*(command|entrypoint):/m);
    // Setting NODE_ENV=development here would re-enable the stack-trace
    // serialization the Dockerfile turns off, without touching a line of
    // this app.
    const mode = envValue(svc.entrant, 'NODE_ENV');
    expect(mode ?? 'production').toBe('production');
  });
});
