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
 *      `file:///app/apps/entrant/node_modules/...` frames into
 *      the HTML (task-22-report.md, mutation E).
 *   3. `SESSION_COOKIE_SECURE` is read by TWO processes — the backend for
 *      its session cookie, node for the `sw_play_csrf` nonce — on ONE
 *      origin. Nothing checked they agreed. A node container missing it
 *      issues the nonce without `Secure` on an HTTPS-only deployment.
 *   4. The release stack's image names must be names something BUILDS.
 *      `docker-compose.release.yml` pulls `ghcr.io/<owner>/scheduler-entrant`
 *      and `publish-release.yml` publishes `scheduler-${{ matrix.name }}`;
 *      nothing connected the two, so a renamed matrix entry stayed green here
 *      and 404'd at `docker compose pull`.
 *   5. The images must build on the node CI tests on. All three install the
 *      one root lockfile but each pins its own base image, and nothing
 *      compared the pins — the frontend image built the production bundle on
 *      node 20 while its own vite plugin required >=22.
 *
 * The compose files are read as text and sliced by service, rather than
 * parsed with a YAML library this workspace does not depend on. The slicing
 * is asserted before it is trusted: `every stack is sliced into services`
 * fails if the splitter stops finding them, which is the failure that would
 * otherwise make every check below vacuously green.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { contains, hostAt } from './helpers/cidr';
import { directive } from './helpers/nginxConf';

const STACK_DIR = join(import.meta.dirname, '..', '..', '..', 'infra', 'compose');
const DOCKERFILE = join(import.meta.dirname, '..', 'Dockerfile');
const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const WORKFLOW = join(REPO_ROOT, '.github', 'workflows', 'publish-release.yml');

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

describe('the release stack pulls images something actually builds', () => {
  // `docker-compose.release.yml` names `ghcr.io/<owner>/scheduler-entrant`;
  // `.github/workflows/publish-release.yml` builds
  // `scheduler-${{ matrix.name }}`. NOTHING tied the two together — rename the
  // matrix entry and every test in this repo stays green while the release
  // stack pulls a 404, which both files' own comments say is a failure this
  // repo has already hit.
  //
  // Both sides are DERIVED. Hardcoding `scheduler-entrant` in each would only
  // assert that this test agrees with itself.
  const workflow = readFileSync(WORKFLOW, 'utf8');
  const matrixBlock = workflow.split(/^\s*matrix:\s*$/m)[1]?.split(/^\s*steps:\s*$/m)[0] ?? '';
  const imagesLine = /^\s*images:\s*ghcr\.io\/(.+)$/m.exec(workflow)?.[1].trim() ?? '';

  /** `<owner>/<repo>:<tag>` → `<repo>`. Owner and tag are interpolations with
   * their own `:` and `{}` inside them (`${OWNER:-misogyu}`, `${TAG:-latest}`),
   * so the repo is "after the last slash, before the first colon there". */
  const repoName = (ref: string): string =>
    ref.slice(ref.lastIndexOf('/') + 1).split(':')[0];

  const built = [...matrixBlock.matchAll(/^\s*- name:\s*(\S+)\s*$/gm)].map((m) =>
    repoName(imagesLine).replace('${{ matrix.name }}', m[1]),
  );
  const referenced = [
    ...stackSource('docker-compose.release.yml').matchAll(/^\s*image:\s*ghcr\.io\/(.+)$/gm),
  ].map((m) => repoName(m[1].trim()));

  it('reads both sides before comparing them', () => {
    // Non-vacuity. An empty list on either side makes the subset check below
    // trivially true — the shape of a control that cannot fail. So is a
    // template that stopped containing the matrix interpolation, which would
    // turn every built name into the same constant.
    expect(repoName(imagesLine)).toContain('${{ matrix.name }}');
    expect(built.length).toBeGreaterThan(1);
    expect(referenced.length).toBeGreaterThan(1);
  });

  it('builds every image the release stack references', () => {
    expect(built).toEqual(expect.arrayContaining(referenced));
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

describe('the chain from "who is the client" to "which bucket" holds in every stack', () => {
  /**
   * Two hops decide the throttle key, and both have to be right:
   *
   *   browser → cloudflared → frontend:8080 (nginx) → /api/*, /e/api/,
   *                                                   /e/account/ → the API
   *
   * nginx's half lives in `frontend/nginx.conf` — believe `CF-Connecting-IP`
   * only from a peer in `set_real_ip_from` — and `ingress.test.ts` holds it.
   * The API's half is `TRUSTED_PROXY_IPS`, and it is COMPOSE that decides
   * whether it can ever match: the API's immediate peer is the nginx
   * container, whose address comes from this file's network.
   *
   * Both ends shipped broken at once, in the same fail-open direction:
   *
   *   - `.env.selfhost.example` set `TRUSTED_PROXY_IPS=172.20.0.3` on a stack
   *     pinned to `10.201.0.0/24`. The runbook's day-one step is
   *     `cp .env.selfhost.example .env`, and compose interpolates `.env`
   *     BEFORE applying a `:-` default — so a dead value in the template beat
   *     a compose file that was already right. One bucket for the whole
   *     internet: the fifth failed sign-in from anyone locks out every user.
   *   - `docker-compose.release.yml` set nothing at all, so every request
   *     through nginx presented nginx's address and `entrant_signup_key(ip)`,
   *     `entrant_ip_key(ip)` and `entries_key(ip)` shared one budget for the
   *     whole internet.
   *
   * Neither is visible from either process, and both fail SILENTLY — which is
   * why the assertions below compare the configured value against the network
   * the stack actually declares, rather than checking that it is set.
   *
   * `docker-compose.yml` is deliberately absent from `PROXIED`. It is the
   * local dev stack: `AUTH_MODE` is unset there, so every anonymous request
   * already acts as the bootstrap operator and there is no per-client budget
   * worth anchoring — and pinning its subnet would break the
   * `COMPOSE_PROJECT_NAME` idiom that lets a second copy run beside the first,
   * since two stacks cannot hold the same block. nginx's half still meters it
   * per real client.
   */
  const PROXIED = ['docker-compose.release.yml', 'docker-compose.selfhost.yml'];

  const subnetOf = (file: string): string | undefined =>
    /^\s*-\s*subnet:\s*(\S+)/m.exec(stackSource(file))?.[1];

  const apiOf = (file: string): string => stacks[file].api ?? stacks[file].backend;

  /** The address the frontend container will actually hold on that network. */
  const nginxAddressOf = (file: string): string =>
    /^\s*ipv4_address:\s*(\S+)/m.exec(stacks[file].frontend)?.[1] ?? subnetOf(file)!;

  /**
   * What an operator ACTUALLY gets, template included — the failure above is
   * invisible to anything that reads only the compose file.
   *
   * `||` rather than `??` on the override is compose's own `:-` semantics: a
   * name present but EMPTY in `.env` falls through to the default.
   */
  function effectiveTrust(file: string): string | undefined {
    const declared = envValue(apiOf(file), 'TRUSTED_PROXY_IPS');
    if (declared === undefined) return undefined;
    const interpolated = /^\$\{TRUSTED_PROXY_IPS(?::-(.*))?\}$/.exec(declared);
    if (!interpolated) return declared; // a literal — no `.env` can change it
    const template = join(
      STACK_DIR,
      file.replace(/^docker-compose(.*)\.yml$/, '.env$1.example'),
    );
    const override = existsSync(template)
      ? /^\s*TRUSTED_PROXY_IPS=(.*)$/m.exec(readFileSync(template, 'utf8'))?.[1].trim()
      : undefined;
    return override || interpolated[1];
  }

  it('is asking the right stacks, with a helper that can say no', () => {
    // Non-vacuity, and the tripwire for a NEW deployment stack: every stack
    // with an nginx in front of an API is either checked below or is the dev
    // stack the docblock exempts.
    const fronted = Object.entries(stacks)
      .filter(([, svc]) => 'frontend' in svc && ('api' in svc || 'backend' in svc))
      .map(([f]) => f)
      .sort();
    expect(fronted).toEqual([...PROXIED, 'docker-compose.yml'].sort());
    expect(contains('10.201.0.0/24', '10.201.0.9')).toBe(true);
    expect(contains('10.201.0.0/24', '172.20.0.3')).toBe(false);
  });

  it.each(PROXIED)('%s pins a network, so a trust list has something to name', (file) => {
    // Unpinned, the stack lands wherever Docker's pool puts it — which varies
    // per host and moves when networks are recreated, so the trust list is
    // either wrong on day one or wrong later. Both fail open.
    expect(subnetOf(file)).toBeDefined();
  });

  it.each(PROXIED)('%s tells the API to trust exactly the nginx it will see', (file) => {
    const trust = effectiveTrust(file);
    expect(
      trust,
      `${file}: the API is never told to trust its proxy, so every request presents nginx's address and every per-IP budget becomes one global bucket`,
    ).toBeDefined();

    const subnet = subnetOf(file)!;
    const nginx = nginxAddressOf(file);
    expect(
      contains(trust!, nginx),
      `${file}: TRUSTED_PROXY_IPS=${trust} can never match nginx at ${nginx} — the trust check fails OPEN, silently`,
    ).toBe(true);
    expect(
      contains(subnet, trust!),
      `${file}: TRUSTED_PROXY_IPS=${trust} reaches outside the compose network ${subnet} — a header trusted from further away is a throttle BYPASS, which is worse than the collapse it fixes`,
    ).toBe(true);
  });

  it.each(PROXIED)('%s does not trust the gateway when the API publishes a port', (file) => {
    const api = apiOf(file);
    if (!/^\s*ports:/m.test(api)) return; // unreachable except through nginx
    // A published port is reachable from the host, and host traffic arrives
    // SNAT'd from the network's gateway — so a subnet-wide trust list on such
    // a stack makes CF-Connecting-IP spoofable by anything that can reach that
    // port. Pin the frontend's own address instead.
    const gateway = hostAt(subnetOf(file)!, 1);
    expect(
      contains(effectiveTrust(file)!, gateway),
      `${file}: the API publishes a host port and trusts ${gateway}, the address host traffic arrives from`,
    ).toBe(false);
  });

  it('offers no example address that could never match anything', () => {
    // The FOURTH instance of the same mistake, and the one the other three
    // were copied from: `backend/.env.example` — the file CLAUDE.md and the
    // runbook both call the full per-variable reference — carried
    // `# Cloud form: TRUSTED_PROXY_IPS=172.20.0.3`, so the value an operator
    // pastes was dead before they pasted it.
    //
    // COMMENTED values count. A template's commented-out line is what people
    // uncomment, which is exactly how a dead address travels.
    const dirs = [STACK_DIR, join(REPO_ROOT, 'apps', 'api')];
    const templates = dirs.flatMap((dir) =>
      readdirSync(dir)
        .filter((f) => /^\.env.*\.example$/.test(f))
        .map((f) => join(dir, f)),
    );
    expect(templates.length).toBeGreaterThan(2); // non-vacuity

    const pinned = stackFiles.map(subnetOf).filter((s): s is string => s !== undefined);
    expect(pinned.length).toBeGreaterThan(0);

    for (const template of templates) {
      const offered = [
        ...readFileSync(template, 'utf8').matchAll(/TRUSTED_PROXY_IPS=(\S+)/g),
      ].map((m) => m[1]);
      for (const value of offered) {
        expect(
          pinned.some((subnet) => contains(subnet, value)),
          `${template} offers TRUSTED_PROXY_IPS=${value}, which is outside every network any shipped stack pins (${pinned.join(', ')}) — it cannot match, and a trust check that cannot match fails OPEN`,
        ).toBe(true);
      }
    }
  });

  it('lets nginx believe the header only on the stack with a tunnel in front', () => {
    // nginx's own trust boundary, checked against the networks it can meet.
    // `set_real_ip_from` names the self-host subnet because that is the one
    // stack with a cloudflared. If it ever covered another stack's network,
    // that stack's GATEWAY — the peer for every host-published request —
    // could set CF-Connecting-IP and pick its own bucket.
    const trusted = directive('set_real_ip_from');
    const selfhost = subnetOf('docker-compose.selfhost.yml')!;
    expect(trusted.some((range) => contains(range, selfhost))).toBe(true);
    for (const file of stackFiles) {
      const subnet = subnetOf(file);
      if (subnet === undefined || subnet === selfhost) continue;
      for (const range of trusted) {
        expect(contains(range, subnet), `${file}'s network ${subnet} is inside ${range}`).toBe(
          false,
        );
      }
    }
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

describe('the images build on the node CI tests on', () => {
  /**
   * Every image here runs `npm ci` against the ONE root lockfile, so they all
   * inherit each other's engine requirements — but each pins its own base
   * image, and nothing compared those pins to anything.
   *
   * They drifted. `apps/console/Dockerfile` sat on
   * `node:20-alpine` while `frontend/vite.config.ts` imported
   * `rollup-plugin-visualizer`, whose `engines.node` is `>=22` with no `^20`
   * branch — the production bundle was being built on an engine its own build
   * plugin excludes. CI could not catch it: CI runs node 22 and never builds
   * these images, so the only two places the version is written never met.
   *
   * Both sides are DERIVED — CI's `node-version` and each `FROM node:` — so
   * this fails on drift in EITHER direction. Hardcoding 22 on both sides would
   * only assert that this test agrees with itself, and bumping CI alone would
   * leave the images behind exactly as before.
   */
  const ciWorkflow = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  const ciMajors = [...ciWorkflow.matchAll(/^\s*node-version:\s*"?(\d+)/gm)].map((m) => m[1]);

  // Relative to REPO_ROOT. Every image that installs the root lockfile.
  const dockerfiles = [
    'apps/console/Dockerfile',
    'apps/entrant/Dockerfile',
    'docs/Dockerfile',
  ];

  it('reads a node major off both sides before comparing them', () => {
    // Non-vacuity. Zero CI matches would make `every` below trivially true,
    // and a Dockerfile the regex stopped matching would silently drop out.
    expect(ciMajors.length).toBeGreaterThan(0);
    expect(new Set(ciMajors).size, `ci.yml disagrees with itself: ${ciMajors}`).toBe(1);
    for (const f of dockerfiles) {
      expect(readFileSync(join(REPO_ROOT, f), 'utf8'), f).toMatch(/^FROM node:\d+/m);
    }
  });

  it.each(dockerfiles)('%s builds on that major', (file) => {
    const source = readFileSync(join(REPO_ROOT, file), 'utf8');
    // Every stage, not the first: a builder on 22 and a runtime on 20 is the
    // same split, just harder to see.
    const majors = [...source.matchAll(/^FROM node:(\d+)/gm)].map((m) => m[1]);
    expect(majors.length, `${file} pins no node base image`).toBeGreaterThan(0);
    for (const major of majors) expect(major).toBe(ciMajors[0]);
  });
});
