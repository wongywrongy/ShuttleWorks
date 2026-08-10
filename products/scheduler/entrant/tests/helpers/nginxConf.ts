/**
 * A small model of `products/scheduler/frontend/nginx.conf` — enough of one
 * to ASK IT QUESTIONS rather than to grep it.
 *
 * The reason for the parser is the failure it is meant to catch. `nginx -t`
 * proves a config is well-formed and nothing else: the config that shipped
 * before Task 22 was perfectly valid and sent every node-owned route to
 * FastAPI, and a test asserting `nginx.conf` contained the string
 * `location /e/` would have been green throughout. What matters is where a
 * given URL LANDS, which is a function of nginx's matching rules, so those
 * rules are what this module implements.
 *
 * It is deliberately not a general nginx parser. It handles the two forms
 * this file uses — `map` blocks in http context and `location` blocks in
 * server context — and `assertModelHolds()` fails loudly if the file grows a
 * construct the model does not cover (a regex location above all), because a
 * model that silently stops describing its subject is worse than none.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const NGINX_CONF = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'frontend',
  'nginx.conf',
);

export function nginxSource(): string {
  return readFileSync(NGINX_CONF, 'utf8');
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

export interface Location {
  /** `exact` = `location = /x`, `prefix` = `location /x`, `named` = `@x`. */
  kind: 'exact' | 'prefix' | 'named' | 'regex';
  path: string;
  body: string;
}

export function locations(source = nginxSource()): Location[] {
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
export function resolve(path: string, all = locations()): Location {
  const exact = all.find((l) => l.kind === 'exact' && l.path === path);
  if (exact) return exact;

  const prefixes = all
    .filter((l) => l.kind === 'prefix' && path.startsWith(l.path))
    .sort((a, b) => b.path.length - a.path.length);
  if (prefixes.length === 0) throw new Error(`no location matches ${path}`);
  return prefixes[0];
}

/** Where a URL ends up: the upstream authority, or `'static'` for disk. */
export function upstreamFor(path: string, all = locations()): string {
  const target = proxyPass(resolve(path, all));
  return target === null ? 'static' : new URL(target).host;
}

/**
 * The FastAPI prefixes under `/e/`, DERIVED from the config rather than
 * listed. This is ruling R8-A's one machine-readable form; `routeConfig.
 * test.ts` reads it so the node route table and the ingress cannot drift.
 */
export function backendPrefixes(all = locations()): string[] {
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
export function cookieMaps(source = nginxSource()): CookieMap[] {
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
 * The Cookie header nginx forwards to the entrant upstream for a given
 * inbound Cookie header — composed from the `proxy_set_header Cookie`
 * directive IN THE CONFIG, so replacing the allowlist with `$http_cookie`
 * makes this return the operator's session and the tests go red.
 *
 * `null` means no Cookie header is sent at all: nginx omits a header whose
 * value evaluates to the empty string.
 */
export function forwardedCookie(cookieHeader: string, path = '/e/health'): string | null {
  const all = locations();
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
export function assertModelHolds(all = locations()): void {
  const regex = all.filter((l) => l.kind === 'regex');
  if (regex.length > 0) {
    throw new Error(
      `nginx.conf grew regex location(s) ${regex.map((l) => l.path).join(', ')} — ` +
        'they outrank every prefix match, so tests/helpers/nginxConf.ts no longer ' +
        'models this file. Teach resolve() the rule before trusting it again.',
    );
  }
}
