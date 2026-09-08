/**
 * Nav/page-title casing contract (v3 consolidated plan, package 28, ruling
 * 3) — sentence case for every page title, nav item and section heading;
 * product nouns stay capitalised (Meet, Bracket, Operations, Display,
 * Setup — the plan's own list — plus this product's other proper module/
 * workspace nouns already established by `MODULE_LABELS`).
 *
 * Covers the console workspace sidebar (`workspaceNav.ts`,
 * `buildWorkflowNavigation` / `buildWorkspaceNav`) and the entrant tab bar
 * (`TabBar.tsx`'s `TAB_LABELS`) — the two navigation label sources named in
 * package 28's brief.
 */
import { describe, expect, it } from 'vitest';
import {
  buildWorkflowNavigation,
  buildWorkspaceNav,
} from '../../product-shell/workspaceNav';
import type { ModuleId } from '../../product-shell/types';

/**
 * Words allowed to start with a capital letter anywhere in a label —
 * product/module proper nouns (plan §4's own carve-out) plus this
 * product's workspace/day proper nouns already shipped in the nav.
 */
const PROPER_NOUNS = new Set([
  'Meet',
  'Bracket',
  'Operations',
  'Display',
  'Setup',
  'Entries',
  'Workspace',
  'Live',
]);

/** True if `label` is sentence case: only its first word (or an allowed
 * proper noun anywhere in it) may start with a capital letter. */
function isSentenceCase(label: string): boolean {
  const words = label.split(/\s+/);
  return words.every((word, i) => {
    if (i === 0) return true;
    const bare = word.replace(/[^\p{L}]/gu, '');
    if (!bare) return true;
    if (PROPER_NOUNS.has(bare)) return true;
    const first = bare[0];
    return first === first.toLowerCase();
  });
}

function allLabels(nav: {
  overview: { label: string };
  sections: { label: string; items: { label: string }[] }[];
  admin: { label: string; items: { label: string }[] };
}): string[] {
  return [
    nav.overview.label,
    ...nav.sections.flatMap((s) => [s.label, ...s.items.map((i) => i.label)]),
    nav.admin.label,
    ...nav.admin.items.map((i) => i.label),
  ];
}

describe('nav casing contract has something to scan', () => {
  it('the workflow nav yields a non-trivial label set', () => {
    const nav = buildWorkflowNavigation(
      'bracket',
      new Set<ModuleId>(['entries', 'bracket', 'display']),
    );
    expect(allLabels(nav).length).toBeGreaterThan(10);
  });
});

describe('console workspace nav labels are sentence case', () => {
  it('buildWorkflowNavigation: every label is sentence case (product nouns excepted)', () => {
    const nav = buildWorkflowNavigation(
      'bracket',
      new Set<ModuleId>(['entries', 'meet', 'bracket', 'display']),
    );
    const offenders = allLabels(nav).filter((label) => !isSentenceCase(label));
    expect(offenders).toEqual([]);
  });

  it('buildWorkspaceNav (meet kind): every label is sentence case', () => {
    const nav = buildWorkspaceNav('meet', new Set<ModuleId>(['meet', 'display']));
    const offenders = allLabels(nav).filter((label) => !isSentenceCase(label));
    expect(offenders).toEqual([]);
  });

  it('buildWorkspaceNav (bracket kind): every label is sentence case', () => {
    const nav = buildWorkspaceNav('bracket', new Set<ModuleId>(['bracket', 'entries', 'display']));
    const offenders = allLabels(nav).filter((label) => !isSentenceCase(label));
    expect(offenders).toEqual([]);
  });
});

describe('entrant tournament-frame section labels are sentence case', () => {
  it('SECTION_LABELS are sentence case', async () => {
    // The labels are module-private; assert on the source constant the same
    // way emDashContract.test.ts reads source, since importing a React Router
    // route module here would pull in server-only deps this contract file
    // must not depend on. Public P1 moved the tab bar's labels out of
    // TabBar.tsx — which now receives an already-built bar — and into
    // `lib/tournamentFrame.ts`, the single authority for section URLs and
    // labels; this contract follows them there.
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = await import('node:path');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const repo = path.resolve(here, '../../../../../..');
    const src = readFileSync(
      path.join(repo, 'apps/entrant/app/lib/tournamentFrame.ts'),
      'utf8',
    );
    const block = /SECTION_LABELS[^{]*\{([^}]*)\}/.exec(src)?.[1] ?? '';
    const labelMatches = [...block.matchAll(/:\s*['"]([^'"]+)['"]/g)]
      .map((m) => m[1])
      .filter((v) => /^[A-Z]/.test(v));
    expect(labelMatches.length).toBeGreaterThan(0);
    const offenders = labelMatches.filter((label) => !isSentenceCase(label));
    expect(offenders).toEqual([]);
  });
});
