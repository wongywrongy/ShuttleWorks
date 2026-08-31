import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = join(process.cwd(), 'src');

const MIGRATED_SELECTION_OWNERS = [
  'app/AppSidebar.tsx',
  'components/InlineSearch.tsx',
  'components/control-plane/MatchInspector.tsx',
  'components/control-plane/MatchStatusFilter.tsx',
  'modules/bracket/BracketMatchControls.tsx',
  'modules/display/MeetDisplayPage.tsx',
  'modules/display/bracketDisplay/BracketDisplayPage.tsx',
  'modules/hub/HubPage.tsx',
  'modules/meet/roster/PlayerDetailPanel.tsx',
  'modules/meet/roster/RosterTab.tsx',
  'modules/operations/UnifiedOpsBoard.tsx',
  'modules/operations/plan/MoveMatchDialog.tsx',
  'modules/settings/GlobalSettingsPage.tsx',
  'modules/workspace/VenueScheduleTab.tsx',
  'platform/engine-config/SettingsControls.tsx',
  'platform/product-shell/WorkspaceShell.tsx',
  'platform/product-shell/WorkspaceSidebar.tsx',
] as const;

const BANNED_SELECTION_PATTERNS = [
  /shadow-\[inset_2px_0_0_hsl\(var\(--accent\)\)\]/,
  /shadow-\[inset_0_-2px_0_hsl\(var\(--accent\)\)\]/,
  /border-b-2/,
];

function bannedPatternsIn(source: string): string[] {
  return BANNED_SELECTION_PATTERNS.filter((pattern) => pattern.test(source)).map(String);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
}

describe('selected-state contrast contract', () => {
  it('never pairs a tinted selected background with solid-accent ink', () => {
    const violations = sourceFiles(sourceRoot).flatMap((path) => {
      const text = readFileSync(path, 'utf8');
      const unsafe = [
        /bg-accent-bg[^'"\n]*text-accent-ink/g,
        /bg-accent\/(?:10|15)[^'"\n]*text-accent(?:-ink)?/g,
      ];
      return unsafe.flatMap((pattern) =>
        [...text.matchAll(pattern)].map((match) => `${path.slice(sourceRoot.length + 1)}: ${match[0]}`),
      );
    });

    expect(violations).toEqual([]);
  });

  it('routes every migrated selection surface through the one primitive', () => {
    const violations = MIGRATED_SELECTION_OWNERS.flatMap((relative) => {
      const source = readFileSync(join(sourceRoot, relative), 'utf8');
      const failures = bannedPatternsIn(source);
      if (!source.includes('<ActiveChoice')) failures.push('missing <ActiveChoice');
      return failures.map((failure) => `${relative}: ${failure}`);
    });
    expect(violations).toEqual([]);

    const solidPairOwners = sourceFiles(sourceRoot).filter((path) => {
      if (path.includes('/__tests__/')) return false;
      const source = readFileSync(path, 'utf8');
      return source.includes('bg-action-primary text-text-on-accent');
    });
    expect(solidPairOwners.map((path) => path.slice(sourceRoot.length + 1))).toEqual([
      'components/ActiveChoice.tsx',
    ]);
  });

  it('negative control rejects a seeded sliver or underline', () => {
    expect(bannedPatternsIn('shadow-[inset_2px_0_0_hsl(var(--accent))]')).not.toEqual([]);
    expect(bannedPatternsIn('border-b-2 border-b-accent')).not.toEqual([]);
  });
});
