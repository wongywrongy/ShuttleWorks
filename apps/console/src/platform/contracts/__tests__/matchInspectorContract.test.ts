/**
 * Match inspector universality contract (SP-UNI-1, F-UNI-11..18).
 *
 * Behavioural rendering tests protect the shared component itself. These
 * source assertions protect the architectural property: every module enters
 * that component, no module keeps a private single-match inspector, and the
 * shared layer cannot reach back into module state or perform its own read.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../..');
const MODULES = path.join(SRC, 'modules');
const INSPECTOR = path.join(SRC, 'components/control-plane/MatchInspector.tsx');

const ENTRY_POINTS = [
  'modules/operations/OperationsProduct.tsx',
  'modules/operations/run/RunSurface.tsx',
  'modules/meet/matches/MatchesSpreadsheet.tsx',
  'modules/bracket/BracketMatchesTab.tsx',
] as const;

const rel = (file: string) => path.relative(SRC, file).split(path.sep).join('/');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
      continue;
    }
    if (/\.[jt]sx?$/.test(entry.name) && !/\.test\.[jt]sx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Strip comments while retaining production declarations and imports. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, (comment) => comment.replace(/[^\n]/g, ' '));
}

interface ImportDeclaration {
  bindings: string;
  source: string;
}

function importsOf(source: string): ImportDeclaration[] {
  const imports: ImportDeclaration[] = [];
  const declaration = /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]\s*;?/g;
  let match: RegExpExecArray | null;
  while ((match = declaration.exec(source)) !== null) {
    imports.push({ bindings: match[1], source: match[2] });
  }
  return imports;
}

describe('F-UNI-11/F-UNI-13 — every match entry point uses the shared inspector', () => {
  for (const entryPoint of ENTRY_POINTS) {
    it(`${entryPoint} imports and renders MatchInspector`, () => {
      const source = code(readFileSync(path.join(SRC, entryPoint), 'utf8'));
      const matchInspectorImport = importsOf(source).find(
        (declaration) => /\bMatchInspector\b/.test(declaration.bindings),
      );

      expect(
        matchInspectorImport,
        `${entryPoint} must import the one shared MatchInspector`,
      ).toBeDefined();
      expect(
        matchInspectorImport?.source ?? '',
        `${entryPoint} must import MatchInspector from the shared control-plane layer`,
      ).toMatch(/components\/control-plane(?:\/MatchInspector)?$/);
      expect(
        source,
        `${entryPoint} must render the imported shared MatchInspector`,
      ).toMatch(/<MatchInspector(?:\s|>)/);
    });
  }
});

describe('F-UNI-16/F-UNI-17/F-UNI-18 — inspector ownership boundaries', () => {
  it('the shared inspector imports no module, API client, or store', () => {
    const imports = importsOf(code(readFileSync(INSPECTOR, 'utf8')));
    const forbidden = imports
      .filter(({ source }) => /(?:^|\/)(?:modules|api|store)(?:\/|$)/.test(source))
      .map(({ source }) => source);

    expect(
      forbidden,
      'MatchInspector receives one already-batched model and module-owned slots via props',
    ).toEqual([]);
  });

  it('Meet Matches reads live state only through the shared read-only seam', () => {
    const meetEntry = code(
      readFileSync(path.join(SRC, 'modules/meet/matches/MatchesSpreadsheet.tsx'), 'utf8'),
    );
    const imports = importsOf(meetEntry);

    expect(imports.some(({ source }) => /store\/matchStateStore$/.test(source))).toBe(false);
    expect(
      imports.some(({ source }) => /hooks\/useMatchStateSnapshot$|\.\.\/\.\.\/\.\.\/hooks\/useMatchStateSnapshot$/.test(source)),
      'Meet receives a shared read-only snapshot; Operations retains mutation ownership',
    ).toBe(true);
  });

  it('the shared match-state seam exposes no mutation API', () => {
    const source = code(
      readFileSync(path.join(SRC, 'hooks/useMatchStateSnapshot.ts'), 'utf8'),
    );

    expect(source).toMatch(/useMatchStateStore\(\(state\)\s*=>\s*state\.matchStates\)/);
    expect(source).not.toMatch(/setMatchState|setMatchStates|applyOptimisticStatus|recordConflict/);
  });

  it('no module defines another MatchInspector or MatchDetailPanel component', () => {
    const offenders: string[] = [];
    const declarations = [
      /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\b/g,
      /\b(?:export\s+)?class\s+([A-Za-z_$][\w$]*)\b/g,
      /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g,
    ];

    for (const file of walk(MODULES)) {
      const source = code(readFileSync(file, 'utf8'));
      for (const declaration of declarations) {
        let match: RegExpExecArray | null;
        while ((match = declaration.exec(source)) !== null) {
          if (!/(?:MatchInspector|MatchDetailPanel)$/.test(match[1])) continue;
          const line = source.slice(0, match.index).split('\n').length;
          offenders.push(`${rel(file)}:${line} ${match[1]}`);
        }
        declaration.lastIndex = 0;
      }
    }

    expect(
      offenders,
      'delete module-private single-match components after migrating their callers',
    ).toEqual([]);
  });
});
