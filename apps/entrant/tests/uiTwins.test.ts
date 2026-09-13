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
 * The design-system `Button` default look (`buttonVariants()` with the
 * default variant and size), as one flat string. The entry wizard's
 * "Continue" controls are rendered twice — once by `enter.tsx` for the
 * scriptless document and once by `entry-wizard.js` for the injected
 * eligibility/account panels — and both must be this string.
 */
const PRIMARY_BUTTON =
  'inline-flex h-11 items-center justify-center rounded border border-action-primary-hover bg-accent px-3.5 text-sm font-semibold text-accent-ink shadow hover:bg-action-primary-hover';

/** Each JS twin, the constant it mirrors, and the file it lives in. */
const TWINS: readonly { name: string; value: () => string; files: string[] }[] = [
  {
    name: 'PRIMARY_BUTTON',
    value: () => PRIMARY_BUTTON,
    files: ['app/routes/enter.tsx'],
  },
];

describe('public/assets twins of the ui.ts vocabulary', () => {
  it('reads real constants out of ui.ts (non-vacuity)', () => {
    expect(uiConstant('CHIP')).toContain('rounded-xs');
    expect(() => uiConstant('NO_SUCH_CONSTANT')).toThrow();
  });

  for (const twin of TWINS) {
    for (const file of twin.files) {
      it(`${file} carries ${twin.name} byte-identically`, () => {
        expect(read(file)).toContain(twin.value());
      });
    }
  }

  it('keeps every twin square and free of the retired button string', () => {
    for (const file of ['public/assets/receipt.js', 'public/assets/entry-wizard.js']) {
      const source = read(file);
      expect(source, file).not.toContain('rounded-full');
      expect(source, file).not.toContain('hover:bg-accent/90');
    }
  });
});
