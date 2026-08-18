/**
 * Public-URL contract (SP-CONSOLE-2 DC-4 / WSS-3).
 *
 * Two surfaces hand a director a link to give the venue: Display
 * configuration and Sharing. Both build it as `origin + dto.url`, where the
 * server owns the path shape and the browser owns the origin — so a workspace
 * reached through a Cloudflare tunnel copies the tunnel hostname, and one on
 * a laptop copies the laptop's, without either surface knowing which it is.
 *
 * The failure this guards is the obvious one: someone hardcodes a host to
 * make a demo work and it ships. A pasted `http://localhost:5173/display/...`
 * fails silently for the person who receives it — they are not on that
 * machine — and it fails at the venue, in front of an audience, which is
 * exactly when nobody can fix it.
 *
 * Enumerated from disk so a new surface is covered without touching this
 * file, the same shape `emDashContract` and `truncationContract` use.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      walk(full, out);
      continue;
    }
    if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** An absolute http(s) origin written into source. */
const ABSOLUTE_ORIGIN = /(["'`])https?:\/\/[^"'`\s]+\1/g;

/** Comments are prose, not links. `api/client.ts` documents the hardcoded
 *  `http://localhost:8000` fallback it REMOVED, and a scanner that cannot
 *  tell that from a live literal punishes a file for explaining itself. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Hosts that are legitimately absolute in source: documentation links, schema
 * ids, and the OpenAPI/JSON-schema URLs in generated types. None of them is a
 * link the product hands to a venue.
 */
const ALLOWED = [
  'https://shuttleworks',
  'https://docs.',
  'https://www.w3.org',
  'http://www.w3.org',
  'https://json-schema.org',
  'https://unpkg.com',
  'https://github.com',
  'https://developer.mozilla.org',
  'https://bwf',
];

describe('no hardcoded origin can reach a link the product hands out', () => {
  it('every public URL is built from the running origin plus a server-owned path', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      // The generated DTO file is regenerated from backend docstrings and is
      // exempt from copy rules everywhere else in this repo for that reason.
      if (file.endsWith('dto.generated.ts')) continue;
      const text = stripComments(readFileSync(file, 'utf8'));
      for (const match of text.matchAll(ABSOLUTE_ORIGIN)) {
        const url = match[0].slice(1, -1);
        if (ALLOWED.some((prefix) => url.startsWith(prefix))) continue;
        offenders.push(`${path.relative(SRC, file)}: ${url}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('NEGATIVE CONTROL: a pasted localhost link would be caught', () => {
    // If the matcher stopped matching, the test above would pass over a real
    // hardcoded host and prove nothing.
    const sample = `const url = "http://localhost:5173/display/abc";`;
    const hits = [...sample.matchAll(ABSOLUTE_ORIGIN)].map((m) => m[0].slice(1, -1));
    expect(hits).toEqual(['http://localhost:5173/display/abc']);
    expect(hits.some((u) => ALLOWED.some((p) => u.startsWith(p)))).toBe(false);
  });
});
