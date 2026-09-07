/**
 * Unit tests for the extracted contrast math (WP-06, X1: "delete the two
 * failing color values — verify mechanism"). check-contrast.mjs is the CLI
 * gate; this file exercises the same functions it imports from contrast.mjs
 * directly, so the ratios below are asserted independently of that script's
 * console-formatting/exit-code plumbing.
 *
 * Per plan §6's "Corrections to proposed negative controls": `--text-muted`
 * (`#5C6470`-class) legitimately PASSES ordinary text contrast on white — a
 * contrast test must not be written to expect it to fail. These assertions
 * are all "must pass 4.5:1", not a hidden expectation that muted ink fails.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hslToRgb, relativeLuminance, contrastRatio, parseTokens } from '../contrast.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '..', '..', 'tokens.css'), 'utf8');
const { light, dark, resolve } = parseTokens(css);

const LIGHT_SURFACES = ['--surface-sunken', '--surface-base', '--surface-raised', '--surface-overlay'];
const TEXT_TOKENS = ['--text-primary', '--text-secondary', '--text-muted'];

describe('hslToRgb / relativeLuminance', () => {
  it('parses white and black to their known luminance', () => {
    expect(relativeLuminance(hslToRgb('0 0% 100%'))).toBeCloseTo(1, 5);
    expect(relativeLuminance(hslToRgb('0 0% 0%'))).toBeCloseTo(0, 5);
  });

  it('rejects a non-HSL-triplet string', () => {
    expect(() => hslToRgb('#111827')).toThrow(/not an HSL triplet/);
  });
});

describe('contrastRatio', () => {
  it('is 21:1 for pure black on pure white', () => {
    expect(contrastRatio('0 0% 0%', '0 0% 100%')).toBeCloseTo(21, 1);
  });

  it('is symmetric (argument order does not matter)', () => {
    const a = contrastRatio('221 39% 11%', '0 0% 100%');
    const b = contrastRatio('0 0% 100%', '221 39% 11%');
    expect(a).toBeCloseTo(b, 10);
  });
});

describe('parseTokens', () => {
  it('resolves a `var(--x)` indirection to its underlying primitive', () => {
    // --text-secondary in the light block is `var(--gray-8)` — resolve()
    // must follow that reference rather than returning the raw string.
    const resolved = resolve(light, '--text-secondary');
    expect(resolved).toMatch(/^[\d.]+\s+[\d.]+%\s+[\d.]+%$/);
  });

  it('throws on an undefined token', () => {
    expect(() => resolve(light, '--does-not-exist')).toThrow(/undefined token/);
  });
});

describe('token contrast — text ramp on every surface (light)', () => {
  for (const t of TEXT_TOKENS) {
    for (const s of LIGHT_SURFACES) {
      it(`${t} on ${s} clears 4.5:1`, () => {
        const ratio = contrastRatio(resolve(light, t), resolve(light, s));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe('token contrast — text ramp on every surface (dark)', () => {
  for (const t of TEXT_TOKENS) {
    for (const s of LIGHT_SURFACES) {
      it(`${t} on ${s} clears 4.5:1`, () => {
        const ratio = contrastRatio(resolve(dark, t), resolve(dark, s));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe('token contrast — text-on-accent on action-primary', () => {
  it('light theme clears 4.5:1', () => {
    const ratio = contrastRatio(resolve(light, '--text-on-accent'), resolve(light, '--action-primary'));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('dark theme clears 4.5:1', () => {
    const ratio = contrastRatio(resolve(dark, '--text-on-accent'), resolve(dark, '--action-primary'));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

describe('negative control: the gate itself can fail', () => {
  it('a pale blue accent on white does NOT clear 4.5:1 (the check-contrast.mjs control)', () => {
    expect(contrastRatio('213 94% 74%', '0 0% 100%')).toBeLessThan(4.5);
  });

  it('--text-muted passes on white — a correct fixture, not a forced failure (plan §6)', () => {
    // #5C6470-class muted ink is expected to PASS; the plan explicitly warns
    // against writing a test that requires this to fail.
    const ratio = contrastRatio(resolve(light, '--text-muted'), '0 0% 100%');
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
