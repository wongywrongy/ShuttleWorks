/**
 * Structural guards over entrant-tier source text.
 *
 * Both scans here answer questions that no behavioural test can: a
 * module-scoped mutable binding only *observably* crosses requests once it
 * already has, and a loader that forwards a Cookie is indistinguishable from
 * one that does not until the day a real session cookie is in flight. So they
 * are asserted against the source, at the shape level, before either can
 * happen.
 *
 * Shared by `apiFetch.server.test.ts` (the fetch tier) and
 * `entry.loader.test.ts` (the loader tier) — the property is the same one at
 * two altitudes: node renders, and never relays credentials.
 */
import { readdirSync, readFileSync } from 'node:fs';

/** Read a file under `app/`, relative to this helper. */
export function readAppSource(relative: string): string {
  return readFileSync(new URL(`../../app/${relative}`, import.meta.url), 'utf8');
}

/**
 * Every route module under `app/routes/`, as `readAppSource`-relative paths.
 *
 * Enumerated from disk rather than hardcoded, so a new route file is covered
 * by the relay guards the moment it lands — no line to remember to add.
 */
export function routeFiles(): string[] {
  return sourceNames('routes');
}

/**
 * Every module under `app/lib/`, same enumeration, same reason.
 *
 * The module-state property is about the *process*, not about the route tier:
 * `app/lib/` runs in the same node process serving the same concurrent
 * entrants, and it is where shared helpers accumulate. Enumerating only
 * `routes/` left the half of the tier most likely to hold a cache uncovered.
 */
export function libFiles(): string[] {
  return sourceNames('lib');
}

function sourceNames(dir: string): string[] {
  return readdirSync(new URL(`../../app/${dir}/`, import.meta.url))
    .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
    .map((name) => `${dir}/${name}`);
}

/**
 * Lines that declare mutable state at module scope.
 *
 * In a node process serving many entrants concurrently, a module-scoped
 * `let`/`var` is shared by every in-flight request — the exact defect that
 * rules out `frontend/src/api/client.ts` (`stateEtags` Map at :265, toast
 * singleton at :6, instance at :1682).
 *
 * Also catches the more common real-world form: a top-level `const` bound to a
 * mutable container (`new Map`/`Set`/`WeakMap`/`WeakSet`, an array literal, an
 * object literal). A `const` binding does not rebind, but the container it
 * points at is still shared, mutable, cross-request state — exactly
 * `client.ts:265`. `Object.freeze(...)` is exempt: the rhs starts with
 * `Object`, not with `new Map(`/`[`/`{`, and frozen is the safe-to-share form.
 */
export function moduleScopedMutableBindings(source: string): string[] {
  return source.split('\n').filter((line) => {
    if (/^(export\s+)?(let|var)\s/.test(line)) return true;

    const constMatch = line.match(/^(export\s+)?const\s+\w+[^=]*=\s*(.+)$/);
    if (!constMatch) return false;

    // The type-argument list is optional in the pattern because it is
    // optional in the language, and TypeScript source writes it more often
    // than not: `new Map<string, number>()` is the same shared mutable
    // container as `new Map()`, and requiring the parenthesis to follow the
    // name immediately let the annotated spelling straight through. Found in
    // Task 17 by mutating a route file — the bare fixture went red and the
    // annotated one beside it did not.
    return /^(new\s+(Map|Set|WeakMap|WeakSet)\s*(<[^(]*>)?\s*\(|\[|\{)/.test(
      constMatch[2].trim(),
    );
  });
}

/** Strip `//` and block comments so prose about cookies is not a finding. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Lines that would make this module a credential relay.
 *
 * `apiFetch.server.ts` refuses to *send* a credential, but nothing in it stops
 * a caller one tier up from reading `request.headers.get('cookie')` and
 * handing it over, or from copying an upstream `Set-Cookie` onto its own
 * `Response`. This is that missing half: a loader may read `request` for its
 * URL and its method, and for nothing that carries identity.
 *
 * `fetch(` is included because the whole guard is void if a loader bypasses
 * `apiGet` and calls the network directly.
 *
 * **Known blind spot:** this is a one-file, one-hop *lexical* scan — it reads
 * the given source text only, not anything it imports. A relay delegated one
 * module away (`const jar = readSession(request)`, with `readSession` living
 * in, say, `app/lib/session.ts`) matches none of the five patterns above and
 * passes clean, even though the module it calls does the actual credential
 * read. Nothing today does this, but as the primary route-tier control, a
 * new helper that wraps `request.headers.get('cookie')` needs its own
 * coverage (or this scan needs to grow), not an assumption that this file
 * would catch it.
 */
export function credentialRelayLines(source: string): string[] {
  const patterns: RegExp[] = [
    /\bcookie\b/i, // reading one, or writing one
    /headers\s*\.\s*get\s*\(/, // any inbound header read
    /headers\s*:/, // any header map on an outgoing Response/fetch
    /\bcredentials\b/,
    /(^|[^.\w])fetch\s*\(/, // must go through apiGet, which owns the allowlist
  ];

  return stripComments(source)
    .split('\n')
    .filter((line) => patterns.some((p) => p.test(line)))
    .map((line) => line.trim());
}
