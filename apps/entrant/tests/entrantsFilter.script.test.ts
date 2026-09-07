// @vitest-environment jsdom
/**
 * The entrants filter script (SP-P7 §3.2) — the shipped module itself
 * (`public/assets/entrants-filter.js`), same posture as
 * `myEntries.script.test.ts`: the file the browser runs is the file under
 * test, DOM claims asserted in jsdom.
 */
import { describe, expect, it } from 'vitest';

import {
  apply,
  filterNoun,
  findLabel,
  matchField,
  matches,
  searchKey,
} from '../public/assets/entrants-filter.js';

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

describe('searchKey (P2 — accuracy over a real roster)', () => {
  it('folds case, accents and the letters Unicode will not decompose', () => {
    expect(searchKey('Rasmus Kjær')).toBe('rasmus kjaer');
    expect(searchKey('Neslihan Arın')).toBe('neslihan arin');
    expect(searchKey('Nguyễn Thùy Linh')).toBe('nguyen thuy linh');
    expect(searchKey('Nørrebro  BK ')).toBe('norrebro bk');
    expect(searchKey(null)).toBe('');
  });

  it('is the same normalisation the query goes through, so ASCII finds both', () => {
    expect(matches('kjaer', searchKey('Rasmus Kjær'), '')).toBe(true);
    expect(matches('ARIN', searchKey('Neslihan Arın'), '')).toBe(true);
    expect(matches('nguyen', searchKey('Nguyễn Thùy Linh'), '')).toBe(true);
  });
});

describe('matchField', () => {
  it('says WHICH field matched, so a club-only hit can explain itself', () => {
    expect(matchField('tom', 'tom barker', 'riverside bc')).toBe('name');
    expect(matchField('riverside', 'tom barker', 'riverside bc')).toBe('club');
    expect(matchField('r', 'tom barker', 'riverside bc')).toBe('both');
    expect(matchField('', 'tom barker', 'riverside bc')).toBe('both');
    expect(matchField('ghost', 'tom barker', 'riverside bc')).toBe('');
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
      <nav>
        <a data-letter-jump="dir-P" href="#dir-P">P</a>
        <a data-letter-jump="dir-T" href="#dir-T">T</a>
      </nav>
      <section id="dir-P" data-letter-group>
        <li data-entrant data-name="priya radhakrishnan" data-club=""></li>
      </section>
      <section id="dir-T" data-letter-group>
        <li data-entrant data-name="tessa ngo" data-club="northside sc">
          <p data-club-context class="text-xs text-muted-foreground">Northside SC</p>
        </li>
        <li data-entrant data-name="tom barker" data-club="riverside bc">
          <p data-club-context class="text-xs text-muted-foreground">Riverside BC</p>
        </li>
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

  it('promotes the club line when the club is why the row survived (P2)', () => {
    const doc = fixture();
    apply(doc, 'northside');
    const tessa = doc.querySelector('[data-name="tessa ngo"]') as HTMLElement;
    expect(tessa.hasAttribute('data-club-match')).toBe(true);
    expect(tessa.querySelector('[data-club-context]')?.className).toContain('text-foreground');

    // A NAME match leaves the club in its muted resting register — the
    // promotion is an explanation, not decoration.
    apply(doc, 'tessa');
    expect(tessa.hasAttribute('data-club-match')).toBe(false);
    expect(tessa.querySelector('[data-club-context]')?.className).toContain('text-muted-foreground');
  });

  it('hides an A-Z jump whose letter the query emptied, and restores it', () => {
    const doc = fixture();
    const jumps = () =>
      [...doc.querySelectorAll('[data-letter-jump]')].map((a) => (a as HTMLElement).hidden);
    apply(doc, 'priya');
    expect(jumps()).toEqual([false, true]);
    apply(doc, '');
    expect(jumps()).toEqual([false, false]);
  });

  it('keeps a diacritic name reachable by its plain-ASCII spelling', () => {
    const doc = fixture();
    const row = doc.querySelector('[data-name="tom barker"]') as HTMLElement;
    row.setAttribute('data-name', searchKey('Rasmus Kjær'));
    expect(apply(doc, 'kjaer')).toBe(1);
    expect(row.hidden).toBe(false);
  });
});
