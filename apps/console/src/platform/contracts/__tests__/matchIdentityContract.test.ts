/**
 * Match identity contract (SP-UNI-1, F-UNI-22/F-UNI-23).
 *
 * Match identity is a domain value, not a display string.  This source guard
 * keeps the strangler seam honest while consumers migrate: outside the one
 * canonical formatter, production code may not parse Meet event/rank codes,
 * mint M{matchNumber} labels, or assemble human-facing Bracket play-unit
 * labels from round/match indexes.
 *
 * This intentionally scans source rather than rendered output.  A second
 * formatter can produce perfectly plausible UI and still leave filters,
 * exports, and public payloads dependent on a private string convention.
 * Machine keys (including `${source}:${id}`) are not identity labels and are
 * therefore outside this guard.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Resolve from this file, not process.cwd(), so `vitest` works from either
// apps/console or the repository root.
const SRC = path.resolve(HERE, '../../..');
const CANONICAL = path.resolve(SRC, 'platform/domain/matchIdentity.ts');

const rel = (file: string) => path.relative(SRC, file).split(path.sep).join('/');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
      continue;
    }
    if (full === CANONICAL) continue;
    if (/\.test\.[jt]sx?$/.test(entry.name)) continue;
    if (/\.[jt]sx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Remove comments without changing line numbers in the reported evidence. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, (comment) => comment.replace(/[^\n]/g, ' '));
}

interface Violation {
  file: string;
  line: number;
  kind: string;
  excerpt: string;
}

interface Rule {
  kind: string;
  pattern: RegExp;
  /** Optional narrowing for syntax shared with non-match domain values. */
  context?: (file: string, line: string) => boolean;
}

/**
 * These are deliberately narrow, human-identity patterns.  In particular,
 * the rules do not mention `matchKey`, colon-delimited opaque keys, or generic
 * backend/client id constructors.
 */
const RULES: Rule[] = [
  {
    kind: 'Meet eventRank prefix parsing',
    // Both direct forms (`eventRank.match`) and the common alias form
    // (`code = eventRank; code.match`) are caught by the canonical prefix
    // regex.  It is specific enough not to catch ordinary word matching.
    pattern: /\/\^\[A-Z\]\+\//,
    context: (file, line) =>
      /(?:match|operations)/i.test(rel(file)) ||
      /\b(?:match|m)\s*\.\s*eventRank\b/i.test(line),
  },
  {
    kind: 'Meet event/rank suffix parsing',
    pattern: /\.replace\(\s*\/\\d\+\$\/\s*,\s*['"]['"]\s*\)/,
    // `replace(/\d+$/, '')` is also used for ordinary event/discipline
    // helpers (player entry and doubles classification).  Only a match
    // surface is an identity consumer for this guard.
    context: (file) => /match/i.test(rel(file)),
  },
  {
    kind: 'Match identity fallback truncation',
    // A truncated match id used as a visible fallback is still a second
    // identity formatter.  Generic ids elsewhere are not matched.
    pattern: /\b(?:match|matchId|match_id)\b[^\n]{0,100}\.(?:id\.)?slice\(\s*0\s*,\s*\d+\s*\)/i,
  },
  {
    kind: 'M{matchNumber} label construction',
    pattern: /`[^`\n]*M\$\{[^}\n]*\bmatchNumber\b[^}\n]*\}[^`\n]*`|["']M["']\s*\+\s*[A-Za-z_$][\w$]*(?:\.[\w$]+)*\bmatchNumber\b/i,
  },
  {
    kind: 'Bracket play-unit display construction',
    // Human-facing bracket labels mention a stage/round/match number.  The
    // machine data-cell key `r${round}m${match}` has no such display marker
    // and is intentionally not matched.  This rule requires a match index;
    // a standalone `Round ${roundIndex}` heading is not a match identity.
    pattern: /`[^`\n]*(?:\b(?:Final|Semifinal|Quarterfinal|QF|SF|stage|head|discipline)\b|\bR\$\{)[^`\n]*\$\{[^}\n]*\b(?:matchIndex|match_index)\b[^}\n]*\}[^`\n]*`/,
  },
  {
    kind: 'Bracket match-number display construction',
    pattern: /`[^`\n]*\bMatch\s+\$\{[^}\n]*\b(?:matchIndex|match_index)\b[^}\n]*\}[^`\n]*`/i,
  },
];

function violationsFor(rule: Rule): Violation[] {
  const violations: Violation[] = [];
  for (const file of walk(SRC)) {
    const lines = code(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      if (rule.context && !rule.context(file, line)) {
        rule.pattern.lastIndex = 0;
        return;
      }
      if (rule.pattern.test(line)) {
        violations.push({
          file: rel(file),
          line: index + 1,
          kind: rule.kind,
          excerpt: line.trim().slice(0, 180),
        });
      }
      rule.pattern.lastIndex = 0;
    });
  }
  return violations;
}

function report(violations: Violation[]): string[] {
  return violations.map(
    ({ file, line, kind, excerpt }) => `${file}:${line} [${kind}] ${excerpt}`,
  );
}

describe('F-UNI-22/F-UNI-23 — one match identity seam', () => {
  it('carries decomposed identity, not a cached label, on the shared Match contract', () => {
    const contract = readFileSync(path.resolve(SRC, 'platform/domain/match.ts'), 'utf8');
    expect(contract).toMatch(/identity:\s*MatchIdentity\s*;/);
    expect(contract).not.toMatch(/\blabel:\s*string\s*;/);
  });

  it('has no independent Meet identity parsing or fallback formatter', () => {
    const hits = [
      ...violationsFor(RULES[0]),
      ...violationsFor(RULES[1]),
      ...violationsFor(RULES[2]),
    ];
    expect(report(hits)).toEqual([]);
  });

  it('has no independent M{matchNumber} label constructor', () => {
    expect(report(violationsFor(RULES[3]))).toEqual([]);
  });

  it('has no independent Bracket play-unit display formatter', () => {
    const hits = [
      ...violationsFor(RULES[4]),
      ...violationsFor(RULES[5]),
    ];
    expect(report(hits)).toEqual([]);
  });
});
