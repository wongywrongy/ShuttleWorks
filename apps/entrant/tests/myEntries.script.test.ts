// @vitest-environment jsdom
/**
 * The My Entries page script (SP-P7 §3.1) — pure decisions and the DOM
 * render, tested by importing the shipped module itself
 * (`public/assets/my-entries.js`): the file the browser runs is the file
 * under test, no build step between them.
 *
 * jsdom for this file only: the tier's tests are node-environment by spec
 * §8, but this module's whole job is DOM construction, and its safety
 * claim — entrant-authored strings can never become markup — is a DOM
 * claim (`textContent` all the way down), asserted here with a hostile
 * name.
 */
import { describe, expect, it } from 'vitest';

import type { MyEntryLine, MyTournamentCard } from '../public/assets/my-entries.js';
import {
  cardChip,
  formatCents,
  formatDate,
  lineChip,
  priceLine,
  render,
  resultsHref,
  withdrawAffordance,
  yearGroups,
} from '../public/assets/my-entries.js';

function line(over: Partial<MyEntryLine> = {}): MyEntryLine {
  return {
    eventCode: 'MS',
    discipline: "Men's Singles",
    player: {
      identity: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        name: 'Ada Chen',
      },
      resolution: 'resolved',
      label: null,
    },
    state: 'entered',
    entryId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    canWithdraw: true,
    resultBadge: null,
    partner: null,
    ...over,
  };
}

function card(over: Partial<MyTournamentCard> = {}): MyTournamentCard {
  return {
    slug: 'spring-open',
    tournamentName: 'Spring Open',
    orgName: 'Kingsway BC',
    entrantsPublished: true,
    resultsPublished: true,
    date: '2026-09-12',
    venueName: 'Kingsway Centre',
    status: 'entered',
    feeTotalCents: 5500,
    submittedAt: '2026-08-01T10:00:00+00:00',
    events: [line()],
    ...over,
  };
}

describe('the pure decisions', () => {
  it('groups by year, newest first, dateless last as Undated', () => {
    const groups = yearGroups([
      card({ date: '2025-03-01', tournamentName: 'Old' }),
      card({ date: null, tournamentName: 'Dateless' }),
      card({ date: '2026-09-12', tournamentName: 'New' }),
    ]);
    expect(groups.map((g: { year: string }) => g.year)).toEqual([
      '2026',
      '2025',
      'Undated',
    ]);
  });

  it('speaks the §3.1 lifecycle, exactly', () => {
    expect(cardChip('awaiting').label).toBe('Awaiting confirmation');
    expect(cardChip('entered')).toEqual({ label: 'Entered', tone: 'live' });
    expect(cardChip('played')).toEqual({ label: 'Played', tone: 'done' });
    expect(cardChip('withdrawn').tone).toBe('plain');
  });

  it('quotes while awaiting, totals after, and prices no withdrawn card', () => {
    expect(priceLine(card({ status: 'awaiting' }))).toBe(
      'Quoted 55.00 · pay at the desk',
    );
    expect(priceLine(card({ status: 'entered' }))).toBe('Total 55.00');
    expect(priceLine(card({ status: 'played' }))).toBe('Total 55.00');
    expect(priceLine(card({ status: 'withdrawn' }))).toBeNull();
    expect(priceLine(card({ feeTotalCents: null }))).toBeNull();
    expect(formatCents(null)).toBe('');
  });

  it('gives a line its own chip only when it disagrees with the card', () => {
    expect(lineChip('awaiting', 'awaiting')).toBeNull();
    expect(lineChip('entered', 'entered')).toBeNull();
    expect(lineChip('awaiting', 'entered')).toBe('Entered');
    expect(lineChip('entered', 'awaiting')).toBe('Awaiting confirmation');
    expect(lineChip('entered', 'withdrawn')).toBe('Withdrawn');
    expect(lineChip('played', 'rejected')).toBe('Not accepted');
  });

  it('links to results only where the player page answers (§4)', () => {
    expect(resultsHref(card({ status: 'played' }), line())).toBe(
      '/e/spring-open/players/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    expect(resultsHref(card({ status: 'entered' }), line())).toBeNull();
    expect(
      resultsHref(card({ status: 'played', entrantsPublished: false }), line()),
    ).toBeNull();
    expect(resultsHref(card({ status: 'played' }), line({
      player: { identity: { id: null, name: 'Ada Chen' }, resolution: 'dead', label: null },
    }))).toBeNull();
  });

  it('renders a date without inventing one', () => {
    expect(formatDate('2026-09-12')).toBe('12 September 2026');
    expect(formatDate('sometime')).toBe('');
    expect(formatDate(null)).toBe('');
  });
});

describe('the DOM render', () => {
  function mount() {
    const root = document.createElement('div');
    document.body.appendChild(root);
    return root;
  }

  it('renders year heading, card anatomy, line, badge and results link', () => {
    const root = mount();
    render(root, {
      tournaments: [
        card({
          status: 'played',
          events: [line({ resultBadge: 'Winner' })],
        }),
      ],
    });

    expect(root.querySelector('h2')?.textContent).toBe('2026');
    const link = root.querySelector('article a') as HTMLAnchorElement;
    expect(link.textContent).toBe('Spring Open');
    expect(link.getAttribute('href')).toBe('/e/spring-open');
    expect(root.textContent).toContain('Kingsway BC · Kingsway Centre · 12 September 2026');
    expect(root.textContent).toContain('Played');
    expect(root.textContent).toContain("MS · Men's Singles · Ada Chen");
    expect(root.textContent).toContain('Winner');
    expect(root.textContent).toContain('Total 55.00');
    const view = [...root.querySelectorAll('a')].find(
      (a) => a.textContent === 'View results',
    );
    expect(view?.getAttribute('href')).toContain('/players/');
  });

  it('names an accepted doubles partner on the line, and only then (§3.1)', () => {
    const root = mount();
    render(root, {
      tournaments: [
        card({
          events: [
            line({
              eventCode: 'XD',
              partner: {
                identity: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Sam Ali' },
                resolution: 'resolved',
                label: null,
              },
            }),
            line({ partner: null }),
          ],
        }),
      ],
    });
    expect(root.textContent).toContain("XD · Men's Singles · Ada Chen with Sam Ali");
    expect(root.textContent).toContain("MS · Men's Singles · Ada Chen");
    // The un-partnered line carries no stray "with".
    expect(root.textContent).not.toContain('Ada Chen with Sam Ali with');
  });

  it('renders the calm empty state', () => {
    const root = mount();
    render(root, { tournaments: [] });
    expect(root.textContent).toBe(
      'No entries yet. When you enter a tournament, it appears here.',
    );
  });

  it('NEGATIVE CONTROL: a hostile name is text, never markup', () => {
    const root = mount();
    render(root, {
      tournaments: [
        card({
          tournamentName: '<img src=x onerror=alert(1)>',
          events: [line({
            player: {
              identity: { id: null, name: '<script>alert(2)</script>' },
              resolution: 'dead',
              label: null,
            },
          })],
        }),
      ],
    });
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('script')).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(root.textContent).toContain('<script>alert(2)</script>');
  });
});

describe('withdrawAffordance (E2)', () => {
  function mount() {
    const root = document.createElement('div');
    document.body.appendChild(root);
    return root;
  }

  it('offers both actions on a withdrawable line', () => {
    expect(withdrawAffordance(line(), true)).toEqual({
      kind: 'actions',
      entryId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
  });

  it('gives a reason instead of a button when the account is unverified', () => {
    // The route 403s an unverified account, so a button here would be a
    // control that always fails — which teaches the reader to distrust the
    // ones that work.
    expect(withdrawAffordance(line(), false)).toEqual({
      kind: 'reason',
      text: 'Confirm your email to change entries',
    });
  });

  it('offers nothing once the server says the line is closed', () => {
    // `canWithdraw` is the backend's own `assert_withdrawable`, so this
    // covers already-withdrawn, decided, AND past the withdrawal deadline
    // without this file holding a second copy of any of those rules.
    expect(withdrawAffordance(line({ canWithdraw: false }), true)).toBeNull();
  });

  it('offers nothing for a line with no id', () => {
    expect(withdrawAffordance(line({ entryId: '' }), true)).toBeNull();
  });

  it('renders the controls only for a verified account', () => {
    const withControls = mount();
    render(withControls, { tournaments: [card()], emailVerified: true });
    const labels = [...withControls.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels).toContain('Withdraw');
    expect(labels).toContain('Withdraw and erase');

    const withReason = mount();
    render(withReason, { tournaments: [card()], emailVerified: false });
    expect(withReason.querySelectorAll('button')).toHaveLength(0);
    expect(withReason.textContent).toContain('Confirm your email to change entries');
  });

  it('arms before it acts, and Keep it backs out', () => {
    // window.confirm is banned product-wide (2026-07-11 interaction audit):
    // it blocks the event loop and deadlocks an automated browser. The
    // two-click arm is its replacement everywhere, so the arm must actually
    // be there — a single-press destructive control is the defect.
    const root = mount();
    render(root, { tournaments: [card()], emailVerified: true });
    const first = [...root.querySelectorAll('button')].find(
      (b) => b.textContent === 'Withdraw',
    );
    first?.click();

    expect(root.textContent).toContain('Withdraw this entry?');
    const keep = [...root.querySelectorAll('button')].find(
      (b) => b.textContent === 'Keep it',
    );
    expect(keep).toBeTruthy();
    keep?.click();
    expect(root.textContent).not.toContain('Withdraw this entry?');
  });
});

describe('the account panel (E5)', () => {
  function mount() {
    const root = document.createElement('div');
    document.body.appendChild(root);
    return root;
  }

  it('appears only for a verified account', () => {
    // Both rights are irreversible or disclosing, and E2's reasoning
    // applies: an unverified account has not shown it controls the address
    // it claims, and the routes 403 it anyway.
    const verified = mount();
    render(verified, { tournaments: [card()], emailVerified: true });
    expect(verified.textContent).toContain('Your account');

    const unverified = mount();
    render(unverified, { tournaments: [card()], emailVerified: false });
    expect(unverified.textContent).not.toContain('Your account');
  });

  it('arms erasure and says what actually happens', () => {
    // Ruling D7 is a product promise as much as a schema decision: the
    // details go, the entries stay as the organizers' records. Copy that
    // said "your data will be deleted" would describe a different product.
    const root = mount();
    render(root, { tournaments: [card()], emailVerified: true });

    const start = [...root.querySelectorAll('button')].find(
      (b) => b.textContent === 'Erase my details',
    );
    start?.click();

    expect(root.textContent).toContain('stay as the organizers');
    expect(
      [...root.querySelectorAll('button')].some((b) => b.textContent === 'Keep them'),
    ).toBe(true);
  });

  it('offers the export as a plain read', () => {
    const root = mount();
    render(root, { tournaments: [card()], emailVerified: true });
    expect(
      [...root.querySelectorAll('button')].some(
        (b) => b.textContent === 'Download my data',
      ),
    ).toBe(true);
  });
});
