/**
 * The page-scoped scripts under `public/assets/` are plain browser ES modules:
 * they cannot import `app/lib/ui.ts`, so the class strings they share with the
 * SSR routes are inlined there as twins. Nothing at build time relates the two
 * copies, so a token rename that lands in `ui.ts` would leave the script's
 * copy rendering the old skin — and no DOM assertion would notice, because
 * both still render. This scan reads both sides as text and pins each twin
 * byte-identical to its source of truth.
 *
 * Same shape as `noRawColor.test.ts`: a text scan over files on disk, with a
 * negative control so a mis-rooted read cannot pass vacuously.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(relative: string): string {
  return readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
}

/** Pull the literal value of `export const NAME = '...'` out of `ui.ts`. */
function uiConstant(name: string): string {
  const source = read('app/lib/ui.ts');
  const match = source.match(new RegExp(`export const ${name} =\\s*'([^']+)';`));
  if (!match) throw new Error(`ui.ts does not export a literal ${name}`);
  return match[1];
}

/**
 * Each twin, the `ui.ts` constant it mirrors, and the files it lives in.
 *
 * The expected strings are READ OUT OF `ui.ts`, never retyped here (A-13).
 * A literal in this file is a second source of truth: when the primary
 * button's string was spelled here, `ui.ts` did not own it at all and the
 * two copies inlined in `enter.tsx` were the only definition — so the test
 * pinned a copy to a copy and the design system's own construction was not
 * in the loop.
 */
const TWINS: readonly { name: string; files: string[] }[] = [
  // The retry the Turnstile module injects beside a failed human check. It
  // is the last hand-copied button in the tier: a browser ES module cannot
  // import `ui.ts`, so this copy is pinned instead.
  { name: 'BUTTON_SECONDARY', files: ['public/assets/turnstile.js'] },
  // The withdraw confirmation, which My Entries builds in the browser.
  { name: 'BUTTON_DESTRUCTIVE', files: ['public/assets/my-entries.js'] },
];

/**
 * The files that reach the button constants by IMPORT rather than by copy.
 *
 * The other half of A-13's fix, and the half that keeps the twin list from
 * growing: `enter.tsx` inlined the primary button's whole class string twice
 * and `regulations.tsx` reached `ACTION_SECONDARY` by name. A route that
 * re-typed the string instead would be invisible to the twin scan above,
 * which only reads the files it is told about.
 */
const IMPORTERS: readonly { file: string; names: string[] }[] = [
  { file: 'app/routes/enter.tsx', names: ['BUTTON_PRIMARY', 'BUTTON_SECONDARY'] },
  { file: 'app/routes/regulations.tsx', names: ['ACTION_SECONDARY'] },
];

describe('public/assets twins of the ui.ts vocabulary', () => {
  it('reads real constants out of ui.ts (non-vacuity)', () => {
    expect(uiConstant('CHIP')).toContain('rounded-xs');
    expect(() => uiConstant('NO_SUCH_CONSTANT')).toThrow();
  });

  for (const twin of TWINS) {
    for (const file of twin.files) {
      it(`${file} carries ${twin.name} byte-identically`, () => {
        expect(read(file)).toContain(uiConstant(twin.name));
      });
    }
  }

  for (const importer of IMPORTERS) {
    it(`${importer.file} imports its buttons instead of retyping them`, () => {
      const source = read(importer.file);
      for (const name of importer.names) {
        expect(source, `${importer.file} does not import ${name}`).toMatch(
          new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'\\.\\./lib/ui'`, 's'),
        );
      }
      // …and carries no hand-rolled twin of them.
      expect(source).not.toContain('bg-accent px-3.5');
    });
  }

  it('gives every button construction the radius its height calls for (A-9)', () => {
    // ADR 0027 / `tokens.css`: `rounded-md` (9px) is the 44px `lg` control's
    // radius alone. A 40px control wearing it is a copied corner, not a
    // chosen one — which is what `BUTTON_SECONDARY` and its turnstile twin
    // both did.
    for (const name of ['BUTTON_PRIMARY', 'BUTTON_SECONDARY', 'BUTTON_DESTRUCTIVE']) {
      const value = uiConstant(name);
      expect(value, name).toContain(' rounded ');
      expect(value, name).not.toContain('rounded-md');
    }
    expect(read('public/assets/turnstile.js')).not.toContain('rounded-md');
  });

  it('gives both button constants the shared Button chrome (A-13)', () => {
    // `packages/design-system/components/Button.tsx`'s base: press is
    // colour, never movement, and a keyboard user gets a ring. Before this
    // the hand-rolled strings carried a hover rule and nothing else.
    for (const name of ['BUTTON_PRIMARY', 'BUTTON_SECONDARY', 'BUTTON_DESTRUCTIVE']) {
      const value = uiConstant(name);
      expect(value, name).toContain('transition-colors duration-fast ease-out-quick');
      expect(value, name).toContain('focus-visible:ring-2 focus-visible:ring-focus');
      expect(value, name).toContain('disabled:pointer-events-none');
      // The construction `Button` refuses: "No routine elevation or moving
      // hit targets" (its own comment). Neither tier grows one unilaterally.
      expect(value, name).not.toContain('active:translate-y');
    }
  });

  it('keeps every twin square and free of the retired button string', () => {
    for (const file of ['public/assets/receipt.js', 'public/assets/entry-wizard.js']) {
      const source = read(file);
      expect(source, file).not.toContain('rounded-full');
      expect(source, file).not.toContain('hover:bg-accent/90');
    }
  });
});
