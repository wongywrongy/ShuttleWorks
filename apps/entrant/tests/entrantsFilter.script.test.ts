// @vitest-environment jsdom
/**
 * The entrants filter script (SP-P7 §3.2) — the shipped module itself
 * (`public/assets/entrants-filter.js`), same posture as
 * `myEntries.script.test.ts`: the file the browser runs is the file under
 * test, DOM claims asserted in jsdom.
 */
import { describe, expect, it } from 'vitest';

import { apply, filterNoun, findLabel, matches } from '../public/assets/entrants-filter.js';

describe('matches', () => {
  it('is a case-blind substring over name and club, empty query keeps all', () => {
    expect(matches('', 'tom barker', 'riverside bc')).toBe(true);
    expect(matches('  ', 'tom barker', '')).toBe(true);
    expect(matches('BARK', 'tom barker', '')).toBe(true); // query is lowercased
    expect(matches('bark', 'tom barker', '')).toBe(true);
    expect(matches('riverside', 'tom barker', 'riverside bc')).toBe(true);
    expect(matches('ghost', 'tom barker', 'riverside bc')).toBe(false);
  });
});

describe('findLabel (V3-PE05.2)', () => {
  it('is the persistent visible label — never disappears once a query is typed', () => {
    expect(findLabel('player')).toBe('Find a player');
    expect(findLabel('entrant')).toBe('Find an entrant');
  });
});

describe('apply', () => {
  it('preserves the player noun for the accessible filter count', () => {
    const root = document.createElement('div');
    root.setAttribute('data-filter-noun', 'player');
    expect(filterNoun(root)).toBe('player');
    expect(filterNoun(document.createElement('div'))).toBe('entrant');
  });
  function fixture() {
    document.body.innerHTML = `
      <section data-letter-group>
        <li data-entrant data-name="priya radhakrishnan" data-club=""></li>
      </section>
      <section data-letter-group>
        <li data-entrant data-name="tessa ngo" data-club="northside sc"></li>
        <li data-entrant data-name="tom barker" data-club="riverside bc"></li>
      </section>
      <div id="entrants-filter-root" data-filter-noun="player"></div>
      <p data-search-count></p>
      <p data-no-matches hidden></p>
    `;
    return document;
  }

  it('hides non-matching rows and letter groups that emptied', () => {
    const doc = fixture();
    expect(apply(doc, 'priya')).toBe(1);

    const groups = [...doc.querySelectorAll('[data-letter-group]')] as HTMLElement[];
    expect(groups[0].hidden).toBe(false);
    expect(groups[1].hidden).toBe(true);
  });

  it('matches on club too, and clears back to everything', () => {
    const doc = fixture();
    expect(apply(doc, 'northside')).toBe(1);
    expect(apply(doc, '')).toBe(3);
    expect(doc.querySelector('[data-search-count]')?.textContent).toBe('3 players');
    const rows = [...doc.querySelectorAll('[data-entrant]')] as HTMLElement[];
    expect(rows.every((row) => !row.hidden)).toBe(true);
  });

  it('reveals the no-matches line only when the whole list is gone', () => {
    const doc = fixture();
    const empty = doc.querySelector('[data-no-matches]') as HTMLElement;
    apply(doc, 'nobody at all');
    expect(empty.hidden).toBe(false);
    apply(doc, 'tom');
    expect(empty.hidden).toBe(true);
  });
});
