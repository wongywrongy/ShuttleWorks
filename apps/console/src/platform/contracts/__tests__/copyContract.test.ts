/**
 * Copy contract (SP-CONSOLE-5 COPY-5) — phrases that must never reach an
 * operator, held by a scan instead of by memory.
 *
 * Each rule below is a mistake this product actually shipped, found in a
 * surface report rather than in review, and each one is the kind that survives
 * review indefinitely: a nav destination that was renamed two months ago reads
 * perfectly well as a sentence. The only thing that catches it is a machine
 * that knows the nav.
 *
 * **Comments are stripped first, and that is the whole design of this file.**
 * A naive repo-wide grep for these phrases fails on day one: `coming soon`
 * appears twice in doc comments explaining that the state is never rendered,
 * `Live tab` appears four times in comments (two of them naming a file B4
 * deleted), and `tap` matches mid-word inside `bracketCommandQueue.ts`. A
 * guard that fires on its own documentation gets an ignore-comment within a
 * week and then guards nothing. Same `code()` precaution as
 * `emDashContract.test.ts`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildWorkspaceNav } from '../../product-shell/workspaceNav';
import type { ModuleId } from '../../product-shell/types';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../..');
const REPO = path.resolve(HERE, '../../../../../..');
const rel = (file: string) => path.relative(REPO, file).split(path.sep).join('/');

interface Rule {
  id: string;
  pattern: RegExp;
  why: string;
}

const RULES: Rule[] = [
  {
    id: 'stale-nav-operations',
    // The 2026-08-19 report's `/matches` empty state: "then schedule in
    // Operations → Courts". Courts has never been a destination in this nav.
    pattern: /Operations\s*→\s*(?!Plan\b|Live day\b)\w+/g,
    why: 'Operations has exactly two destinations: Plan and Live day (buildWorkspaceNav)',
  },
  {
    id: 'stale-nav-bracket',
    // `/bracket-matches` said "the Events and Draw tabs". Events folded into
    // Draws on 2026-06-26.
    pattern: /Events and Draw tabs?|\bEvents tab\b|\bCourts tab\b/g,
    why: 'Bracket has Roster / Draws / Matches / Configuration — Events folded into Draws',
  },
  {
    id: 'tabs-are-gone',
    // The horizontal TabBar was deleted 2026-08-17; the left sidebar is the
    // nav. Copy that says "tab" is describing an IA the product dropped.
    pattern: /\b(Live|Schedule|Matches|Draw|Roster|Setup) tabs?\b/g,
    why: 'the sidebar is the nav — say the section name, not "tab" (TabBar removed 2026-08-17)',
  },
  {
    id: 'touch-verb',
    // Documented desktop-only (SP-CONSOLE-2). "Tap" names a gesture the
    // operator does not have.
    pattern: /\bTap\b|\btap (?:the|a|it|here)\b/gi,
    why: 'the console is desktop-only — the verb is Click',
  },
  {
    id: 'coming-soon',
    // Every module is built. A "coming soon" would be a lie, and a nav entry
    // that leads to a placeholder teaches the operator to stop reading the nav.
    pattern: /coming soon/gi,
    why: 'nothing in this product is unbuilt — say what it does or remove it',
  },
  {
    id: 'retired-state-words',
    // `lib/stateWords.ts` is the one vocabulary (SP-CONSOLE-2 X1). These are
    // the spellings it replaced, each of which had drifted across surfaces.
    pattern: /\bIn progress\b|>\s*PEND\b|'PEND'|"PEND"/g,
    why: 'use STATE_WORD from lib/stateWords.ts (Live / Pending / …), never a second spelling',
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
      continue;
    }
    if (/\.test\.[jt]sx?$/.test(entry.name)) continue;
    if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Comments stripped — see the module docblock; this is load-bearing. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('COPY-5 — banned phrases never reach a surface', () => {
  const files = walk(SRC).map((f) => ({ file: f, src: code(readFileSync(f, 'utf8')) }));

  it.each(RULES)('$id: $why', (rule) => {
    const hits: string[] = [];
    for (const { file, src } of files) {
      const found = src.match(new RegExp(rule.pattern.source, rule.pattern.flags));
      if (found) hits.push(`${rel(file)}: ${[...new Set(found)].join(', ')}`);
    }
    expect(hits).toEqual([]);
  });

  it('the Operations rule allows exactly the destinations the nav declares', () => {
    // Ties the rule to the nav model rather than to a memory of it: rename a
    // destination and this fails, instead of the guard quietly allowing a name
    // that no longer exists.
    const nav = buildWorkspaceNav('meet', new Set<ModuleId>(['meet']));
    const ops = nav.sections.find((s) => s.id === 'operations');
    expect(ops?.items.map((i) => i.label)).toEqual(['Plan', 'Live day']);
  });
});
