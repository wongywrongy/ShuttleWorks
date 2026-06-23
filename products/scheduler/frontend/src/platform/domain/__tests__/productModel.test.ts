import { describe, it, expect } from 'vitest';
import {
  productForTab,
  defaultTabForProduct,
  productsForWorkspace,
} from '../productModel';

describe('productForTab', () => {
  it('maps meet operator tabs to meet', () => {
    for (const t of ['setup', 'roster', 'matches', 'schedule', 'live']) {
      expect(productForTab(t, 'meet')).toBe('meet');
    }
  });
  it('maps tv to display', () => {
    expect(productForTab('tv', 'meet')).toBe('display');
  });
  it('maps bracket-* tabs to bracket', () => {
    for (const t of ['bracket-setup', 'bracket-draw', 'bracket-live']) {
      expect(productForTab(t, 'bracket')).toBe('bracket');
    }
  });
  it('falls back by kind for unknown tabs and never throws on null kind', () => {
    expect(productForTab('weird', 'bracket')).toBe('bracket');
    expect(productForTab('weird', 'meet')).toBe('meet');
    expect(productForTab('weird', null)).toBe('meet');
  });
});

describe('defaultTabForProduct', () => {
  it('routes meet-workspace products to existing meet routes', () => {
    expect(defaultTabForProduct('meet', 'meet')).toBe('setup');
    expect(defaultTabForProduct('display', 'meet')).toBe('tv');
    // bracket is disabled on a meet workspace → defensive home
    expect(defaultTabForProduct('bracket', 'meet')).toBe('setup');
  });
  it('routes everything to bracket home on a bracket workspace', () => {
    expect(defaultTabForProduct('bracket', 'bracket')).toBe('bracket-setup');
    expect(defaultTabForProduct('display', 'bracket')).toBe('bracket-setup');
    expect(defaultTabForProduct('meet', 'bracket')).toBe('bracket-setup');
  });
});

describe('productsForWorkspace', () => {
  it('meet workspace: Meet+Display live, Bracket disabled with reason', () => {
    const p = productsForWorkspace('meet');
    expect(p.map((x) => x.id)).toEqual(['meet', 'bracket', 'display']);
    expect(p.find((x) => x.id === 'meet')!.available).toBe(true);
    expect(p.find((x) => x.id === 'display')!.available).toBe(true);
    const bracket = p.find((x) => x.id === 'bracket')!;
    expect(bracket.available).toBe(false);
    expect(bracket.disabledReason).toBe(
      "Bracket isn't enabled for this workspace yet.",
    );
  });
  it('bracket workspace: Bracket live, Meet+Display disabled with reasons', () => {
    const p = productsForWorkspace('bracket');
    expect(p.find((x) => x.id === 'bracket')!.available).toBe(true);
    expect(p.find((x) => x.id === 'meet')!.disabledReason).toBe(
      "Meet isn't enabled for this workspace yet.",
    );
    expect(p.find((x) => x.id === 'display')!.disabledReason).toBe(
      "Display isn't available for brackets yet.",
    );
  });
});
