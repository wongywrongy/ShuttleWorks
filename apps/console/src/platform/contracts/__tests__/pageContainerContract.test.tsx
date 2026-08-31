/**
 * Page container contract (SP-CONSOLE-5 LAY-1) — one anchor, one gutter.
 *
 * The 2026-08-19 surface report measured what looked like two settings
 * anchors, 443px and 467px. They were the same box: `/setup` and `/ws-venue`
 * both centred a `max-w-3xl` column in the same area, but one paid its gutter
 * outside the scroll region (`px-4`) and the other inside the column (`p-6`),
 * so their text started 24px apart. Counting `/overview` (1180px) and
 * `TabSkeleton` (1400px), the console had four content widths and three
 * gutters, none of them written down anywhere.
 *
 * Two halves, because the failure has two shapes:
 *
 *   1. The DOM half — `PageBody` actually renders the bound it declares. A
 *      map that nothing reads is not a contract.
 *   2. The source half — no surface hand-rolls `mx-auto` + `max-w-*` on one
 *      element. This is the half that catches the REGRESSION: the drift did
 *      not arrive as a wrong `PageBody` variant, it arrived as eight separate
 *      files each centring their own column. A behavioural test cannot see
 *      that; only a file-level scan can. Same technique, and the same
 *      comment-stripping precaution, as `emDashContract.test.ts`.
 *
 * The allowlist below only shortens. Every entry names why the surface is not
 * a `PageBody` surface — not "we did not get to it".
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PageBody, PAGE_BODY_WIDTH } from '../../../components/control-plane';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../..');
const REPO = path.resolve(HERE, '../../../../../..');
const rel = (file: string) => path.relative(REPO, file).split(path.sep).join('/');

/**
 * Surfaces allowed to centre their own column, each for a stated reason.
 * Paths are repo-relative. Shrink this list; never grow it without a ruling.
 */
const ALLOWED: Record<string, string> = {
  // BracketEmptyState left this list in ADR 0020: it became a thin wrapper
  // and its centred block moved into the design-system EmptyState, which
  // this scan does not walk (the DS is not a console page surface).
  'apps/console/src/modules/hub/NewWorkspacePage.tsx':
    'stands outside the workspace shell — no sidebar, no ActionsBar, so it owns its own page geometry',
  'apps/console/src/modules/workspace/WorkspaceOverview.tsx':
    'a dashboard of panels, not a form; keeps its wider column pending the LAY-4 proportion audit',
  'apps/console/src/modules/display/publicDisplay/ScheduleView.tsx':
    'public projection surface (TV/board), not console chrome',
  'apps/console/src/modules/display/publicDisplay/StandingsView.tsx':
    'public projection surface (TV/board), not console chrome',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
      continue;
    }
    if (/\.test\.[jt]sx?$/.test(entry.name)) continue;
    if (/\.tsx$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Comments stripped: a docblock that explains the rule is not a breach of it. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Every `className` value in the file, quoted or templated. */
function classNameValues(src: string): string[] {
  const out: string[] = [];
  const re = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m[1] ?? m[2] ?? m[3] ?? '');
  return out;
}

describe('LAY-1 — PageBody renders the bound it declares', () => {
  it.each(['data', 'form', 'prose'] as const)('%s carries its width class', (variant) => {
    const { container } = render(<PageBody variant={variant}>x</PageBody>);
    const el = container.querySelector(`[data-page-body="${variant}"]`);
    expect(el).not.toBeNull();
    for (const cls of PAGE_BODY_WIDTH[variant].split(' ')) {
      expect(el!.className).toContain(cls);
    }
  });

  it('form is one centred column and prose is bounded in characters', () => {
    // `ch`, not px: the readable band (45-75 characters, WCAG 1.4.8 caps at
    // 80) is a property of the text. A px bound leaves that band silently the
    // moment the type scale moves.
    expect(PAGE_BODY_WIDTH.form).toContain('mx-auto');
    expect(PAGE_BODY_WIDTH.prose).toMatch(/max-w-\[\d+ch\]/);
    expect(PAGE_BODY_WIDTH.data).not.toContain('max-w-');
  });
});

describe('LAY-1 — no surface hand-rolls its own anchor', () => {
  it('every allowlist entry still exists and still centres a column', () => {
    // An allowlist that outlives its files stops being a ratchet and starts
    // being decoration.
    for (const [file, why] of Object.entries(ALLOWED)) {
      const src = code(readFileSync(path.join(REPO, file), 'utf8'));
      const centres = classNameValues(src).some(
        (v) => v.includes('mx-auto') && v.includes('max-w-'),
      );
      expect(centres, `${file} no longer centres a column — drop it from ALLOWED (${why})`).toBe(
        true,
      );
    }
  });

  it('nothing outside the allowlist centres its own column', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const key = rel(file);
      if (key in ALLOWED) continue;
      for (const value of classNameValues(code(readFileSync(file, 'utf8')))) {
        if (value.includes('mx-auto') && value.includes('max-w-')) {
          offenders.push(`${key}: ${value.trim().slice(0, 80)}`);
        }
      }
    }
    expect(
      offenders,
      'use <PageBody variant="form"> instead of centring a column by hand',
    ).toEqual([]);
  });
});
