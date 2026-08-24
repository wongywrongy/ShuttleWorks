/**
 * A small model of the nginx ingress — enough of one to ASK IT QUESTIONS
 * rather than to grep it.
 *
 * The reason for the parser is the failure it is meant to catch. `nginx -t`
 * proves a config is well-formed and nothing else: the config that shipped
 * before Task 22 was perfectly valid and sent every node-owned route to
 * FastAPI, and a test asserting the file contained the string `location /e/`
 * would have been green throughout. What matters is where a given URL LANDS,
 * which is a function of nginx's matching rules, so those rules are what this
 * module implements.
 *
 * It is deliberately not a general nginx parser. It handles the two forms
 * these files use — `map` blocks in http context and `location` blocks in
 * server context — and `assertModelHolds()` fails loudly if a file grows a
 * construct the model does not cover (a regex location above all), because a
 * model that silently stops describing its subject is worse than none.
 *
 * ── THREE FILES SINCE SP-HOST-1, AND WHY THAT MATTERS TO THIS MODULE ──────
 *
 *   http-shared.conf — realip, every `map`, the rate-limit zones. No server.
 *   console.conf     — `server { listen 8080; }`, the OPERATOR tier.
 *   play.conf        — `server { listen 8081; }`, the PUBLIC entrant tier.
 *
 * `locations()` scans a source for `location` blocks with NO notion of which
 * `server {}` encloses them — it never needed one, because there used to be
 * exactly one. Two server blocks in a single file would therefore have merged
 * both tiers into one model, and every routing assertion in the suite would
 * have stayed green while describing a config that does not exist. That is
 * this module's own failure mode, so the split was made one-server-per-file
 * to keep it honest, and `assertOneServerBlockPerTier()` below is what stops the
 * arrangement from quietly reverting.
 *
 * Every entry point now names its tier. The old single-argument defaults are
 * gone on purpose: "which file did that assertion just read" is exactly the
 * question a default would let a reader skip.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const NGINX_DIR = join(import.meta.dirname, '..', '..', '..', '..', 'infra', 'nginx');

export type Tier = 'console' | 'play';

/** The http-context file: realip, maps, rate-limit zones. Declares no server. */
export function sharedSource(): string {
  return readFileSync(join(NGINX_DIR, 'http-shared.conf'), 'utf8');
}

/** One tier's `server` block. */
export function tierSource(tier: Tier): string {
  return readFileSync(join(NGINX_DIR, `${tier}.conf`), 'utf8');
}

/** The `add_header` snippet both tiers include. */
export function headersSnippet(): string {
  return readFileSync(join(NGINX_DIR, 'security-headers.conf'), 'utf8');
}

/** Every source nginx loads, concatenated — for whole-config assertions. */
export function allSources(): string {
  return [sharedSource(), tierSource('console'), tierSource('play')].join('\n');
}

/** Strip `# …` comments; the file is mostly comments and they mention paths. */
function uncommented(source: string): string {
  return source.replace(/^\s*#.*$/gm, '');
}

/** The body of the block whose opening `{` is at `open`, braces balanced. */
function blockAt(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced braces at offset ${open} in nginx.conf`);
}

/**
 * Every value of a top-level directive, comments stripped —
 * `directive('set_real_ip_from')` → `['10.201.0.0/24']`.
 *
 * The `http`-context directives are as load-bearing as the locations: the
 * rate-limit key and the realip trust boundary are both declared up there,
 * and neither is reachable through `locations()`.
 */
export function directive(name: string, source: string): string[] {
  return [...uncommented(source).matchAll(new RegExp(`^\\s*${name}\\s+([^;]+);`, 'gm'))].map(
    (m) => m[1].trim(),
  );
}

/**
 * The port(s) a tier's `server` block listens on, as numbers.
 *
 * DERIVED rather than repeated, because two other things are keyed on it: the
 * tunnel's ingress rules and the `map $server_port` CSP variables in
 * `http-shared.conf`. A test that hardcoded `8081` would keep passing while
 * the tier moved out from under the policy it is supposed to carry.
 */
export function listenPorts(tier: Tier): number[] {
  return directive('listen', tierSource(tier)).map((v) => Number(v.split(/\s+/)[0]));
}

export interface Location {
  /** `exact` = `location = /x`, `prefix` = `location /x`, `named` = `@x`. */
  kind: 'exact' | 'prefix' | 'named' | 'regex';
  path: string;
  body: string;
}

export function locations(source: string): Location[] {
  const clean = uncommented(source);
  const found: Location[] = [];
  // The whitespace after the modifier is OPTIONAL, because nginx does not
  // require it: `location ~^/e/ {` is a regex location, and requiring `\s+`
  // classified it as a PREFIX one. That is the exact case `assertModelHolds`
  // exists for — a regex location outranks every prefix in the file, so the
  // guard stayed silent about the one construct that makes `resolve()` wrong.
  const opener = /\blocation\s+(=|\^~|~\*?)?\s*(\S+)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = opener.exec(clean)) !== null) {
    const modifier = (m[1] ?? '').trim();
    const path = m[2];
    const kind: Location['kind'] = modifier.startsWith('~')
      ? 'regex'
      : modifier === '='
        ? 'exact'
        : path.startsWith('@')
          ? 'named'
          : 'prefix';
    found.push({ kind, path, body: blockAt(clean, opener.lastIndex - 1) });
  }
  return found;
}

/** The `proxy_pass` target of a location, or `null` when it serves from disk. */
export function proxyPass(location: Location): string | null {
  return /\bproxy_pass\s+(\S+?);/.exec(location.body)?.[1] ?? null;
}

/** The value of a `proxy_set_header <name>` directive in a location. */
export function proxySetHeader(location: Location, name: string): string | null {
  const found = new RegExp(`\\bproxy_set_header\\s+${name}\\s+(.*?);`, 'i').exec(
    location.body,
  );
  return found ? found[1].trim().replace(/^"(.*)"$/, '$1') : null;
}

/**
 * nginx's matching order, for the subset this file uses: an exact (`=`)
 * match wins outright; otherwise the LONGEST matching prefix wins,
 * regardless of the order the blocks appear in. Named locations are never
 * matched from a URL — only reached by `try_files`/`error_page`.
 */
export function resolve(path: string, all: Location[]): Location {
  const exact = all.find((l) => l.kind === 'exact' && l.path === path);
  if (exact) return exact;

  const prefixes = all
    .filter((l) => l.kind === 'prefix' && path.startsWith(l.path))
    .sort((a, b) => b.path.length - a.path.length);
  if (prefixes.length === 0) throw new Error(`no location matches ${path}`);
  return prefixes[0];
}

/** Where a URL ends up: the upstream authority, or `'static'` for disk. */
export function upstreamFor(path: string, all: Location[]): string {
  const target = proxyPass(resolve(path, all));
  return target === null ? 'static' : new URL(target).host;
}

/**
 * The FastAPI prefixes under `/e/`, DERIVED from the config rather than
 * listed. This is ruling R8-A's one machine-readable form; `routeConfig.
 * test.ts` reads it so the node route table and the ingress cannot drift.
 */
export function backendPrefixes(all: Location[]): string[] {
  return all
    .filter((l) => l.kind === 'prefix' && l.path.startsWith('/e/') && l.path !== '/e/')
    .filter((l) => proxyPass(l)?.includes('backend:'))
    .map((l) => l.path)
    .sort();
}

// ---- the cookie allowlist ------------------------------------------------

interface CookieMap {
  variable: string;
  rules: { pattern: RegExp; replacement: string }[];
  fallback: string;
}

/** Every `map $http_cookie $x { … }` in the file, as executable rules. */
export function cookieMaps(source = sharedSource()): CookieMap[] {
  const clean = uncommented(source);
  const opener = /\bmap\s+\$http_cookie\s+\$(\w+)\s*\{/g;
  const maps: CookieMap[] = [];
  let m: RegExpExecArray | null;
  while ((m = opener.exec(clean)) !== null) {
    const body = blockAt(clean, opener.lastIndex - 1);
    const rules: CookieMap['rules'] = [];
    // Statements are matched whole, NOT split on `;` — the patterns
    // themselves contain semicolons (`(?:^|;\s*)`, `[^;]+`), so splitting
    // shredded them into rules that never matched and a map that silently
    // returned its default for every input. Which is exactly the shape of
    // "a control that cannot fail": every strip assertion would have passed.
    for (const rule of body.matchAll(/"~(\*?)([^"]*)"\s+"([^"]*)"\s*;/g)) {
      rules.push({
        // `~` is case-sensitive, `~*` is not — the distinction is
        // load-bearing (cookie names are case-sensitive), so it is carried
        // through rather than normalised away.
        pattern: new RegExp(rule[2], rule[1] === '*' ? 'i' : ''),
        replacement: rule[3],
      });
    }
    const fallback = /\bdefault\s+"([^"]*)"\s*;/.exec(body)?.[1] ?? '';
    maps.push({ variable: m[1], rules, fallback });
  }
  return maps;
}

/** Run one map over a Cookie header, exactly as nginx would. */
function evaluate(map: CookieMap, cookieHeader: string): string {
  for (const rule of map.rules) {
    const hit = rule.pattern.exec(cookieHeader);
    if (hit) return rule.replacement.replace(/\$(\d)/g, (_, n) => hit[Number(n)] ?? '');
  }
  return map.fallback;
}

/**
 * The Cookie header nginx forwards upstream for the location that answers
 * `path`, given an inbound Cookie header — composed from the
 * `proxy_set_header Cookie` directive IN THE CONFIG, so replacing an
 * allowlist with `$http_cookie` (or dropping the directive, which is
 * pass-through) makes this return the operator's session and the tests go
 * red. `path` defaults to node's half of `/e/` on the PLAY tier; the FastAPI
 * half is asked about by passing its own path, and the operator `/api/` plane
 * by passing `'console'` as the tier as well.
 *
 * `null` means no Cookie header is sent at all: nginx omits a header whose
 * value evaluates to the empty string.
 */
export function forwardedCookie(
  cookieHeader: string,
  path = '/e/health',
  tier: Tier = 'play',
): string | null {
  const all = locations(tierSource(tier));
  const directive = proxySetHeader(resolve(path, all), 'Cookie');
  if (directive === null) {
    // No directive means nginx passes the client's Cookie header through.
    return cookieHeader === '' ? null : cookieHeader;
  }
  const maps = cookieMaps();
  const value = directive.replace(/\$(\w+)/g, (_match, name: string) => {
    if (name === 'http_cookie') return cookieHeader;
    const map = maps.find((c) => c.variable === name);
    if (!map) throw new Error(`proxy_set_header Cookie references unknown $${name}`);
    return evaluate(map, cookieHeader);
  });
  return value === '' ? null : value;
}

/**
 * Fails when the file grows something the model above does not describe.
 * Without this, adding a regex location (which outranks every prefix) would
 * leave `resolve()` confidently wrong and every routing test green.
 */
/**
 * How many `server {` blocks a source declares.
 *
 * `\bserver\s*\{` and not just `server`, because `server_name`, `proxy_pass
 * http://backend:8000` and the word in prose all contain it.
 */
export function serverBlockCount(source: string): number {
  return [...uncommented(source).matchAll(/\bserver\s*\{/g)].length;
}

/**
 * **The file layout this whole module depends on** (SP-HOST-1 F-8).
 *
 * `locations()` has no notion of which `server {}` encloses a location — it
 * never needed one, because there used to be exactly one. The day a tier file
 * grows a second block, every routing assertion in the suite silently starts
 * describing a merged config that nginx never serves: `resolve('/api/x')`
 * would find the operator's block from inside the play tier's model and
 * report that the operator API is reachable on the public origin, which is
 * the one thing the split exists to make false.
 *
 * So the layout is asserted, not assumed. The http-context file must declare
 * NO server (its maps and zones are shared and may be declared once); each
 * tier file must declare exactly one.
 */
export function assertOneServerBlockPerTier(): void {
  const shared = serverBlockCount(sharedSource());
  if (shared !== 0) {
    throw new Error(
      `http-shared.conf declares ${shared} server block(s) — it must declare none. ` +
        'It is http context: maps and limit_req_zones live there because they may be ' +
        'declared once and both tiers need them.',
    );
  }
  for (const tier of ['console', 'play'] as const) {
    const count = serverBlockCount(tierSource(tier));
    if (count !== 1) {
      throw new Error(
        `${tier}.conf declares ${count} server blocks — it must declare exactly one. ` +
          'tests/helpers/nginxConf.ts does not track which server encloses a location, ' +
          'so a second block merges the tiers into one model and leaves every routing ' +
          'assertion green while describing a config nginx never serves.',
      );
    }
  }
}

export function assertModelHolds(all: Location[]): void {
  const regex = all.filter((l) => l.kind === 'regex');
  if (regex.length > 0) {
    throw new Error(
      `nginx.conf grew regex location(s) ${regex.map((l) => l.path).join(', ')} — ` +
        'they outrank every prefix match, so tests/helpers/nginxConf.ts no longer ' +
        'models this file. Teach resolve() the rule before trusting it again.',
    );
  }
}
