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
  receiptHref,
  render,
  resultsHref,
  withdrawAffordance,
  yearGroups,
  nextStep,
  pendingReasonText,
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
    partnerInviteMailFailed: false,
    shortReference: 'H4KJ29QW',
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
    submissionId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    shortReference: 'H4KJ29QW',
    withdrawsUntil: null,
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
      'Quoted 55.00 (currency not stated), payable to the organizer',
    );
    expect(priceLine(card({ status: 'entered' }))).toBe('Total 55.00 (currency not stated)');
    expect(priceLine(card({ status: 'played' }))).toBe('Total 55.00 (currency not stated)');
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

  it('appends the withdrawal deadline to the price line only when one exists (E2)', () => {
    expect(priceLine(card({ withdrawsUntil: '2026-09-05T18:00:00Z' }))).toContain(
      'Total 55.00 (currency not stated)',
    );
    expect(priceLine(card({ withdrawsUntil: null }))).toBe('Total 55.00 (currency not stated)');
    expect(
      priceLine(card({ status: 'awaiting', withdrawsUntil: null })),
    ).toBe('Quoted 55.00 (currency not stated), payable to the organizer');
  });

  it('links to the receipt whenever the card names a slug and a reference', () => {
    // V3-24-1: the link is built from the SHORT REFERENCE. The receipt route
    // accepts only that shape, so a link built from the UUID would 404 — and
    // the address bar the entrant lands on is then the same eight characters
    // the page tells them to quote.
    expect(receiptHref(card())).toBe('/e/spring-open/receipt/H4KJ29QW');
    expect(receiptHref(card({ slug: null }))).toBeNull();
    expect(receiptHref(card({ shortReference: '' }))).toBeNull();
  });
});

describe('nextStep (refinement 2026-09-12: status is not the next action)', () => {
  it('leads with what the entrant can do now: an outstanding payment points at the receipt', () => {
    const step = nextStep(card({ events: [line({ pendingReasons: ['awaiting_payment', 'awaiting_partner'] })] }), true);
    expect(step?.text).toContain('Payment outstanding');
    expect(step?.action).toEqual({ label: 'View receipt', href: '/e/spring-open/receipt/H4KJ29QW' });
  });

  it('speaks the process in the entrant\'s words, never the desk\'s queue vocabulary', () => {
    expect(nextStep(card({ events: [line({ pendingReasons: ['needs_review_person'] })] }), true)?.text).toBe(
      "The organizer is checking this player's details.",
    );
    expect(nextStep(card({ events: [line({ pendingReasons: ['pair_conflict'] })] }), true)?.text).toBe(
      'The organizer is checking this pairing.',
    );
    expect(nextStep(card({ events: [line({ pendingReasons: ['awaiting_partner'] })] }), true)?.text).toBe(
      'Waiting for your partner to accept the invitation.',
    );
    expect(pendingReasonText('needs_review_person')).not.toMatch(/identity review/i);
  });

  it('offers the email confirmation only while it blocks a change the entrant could make', () => {
    const step = nextStep(card({ events: [line({ canWithdraw: true, pendingReasons: [] })] }), false);
    expect(step?.action).toEqual({ label: 'Confirm your email', href: '/e/verify' });
    expect(nextStep(card({ status: 'awaiting', events: [line({ canWithdraw: false, pendingReasons: [] })] }), false)?.text).toBe(
      'Waiting for the organizer to confirm.',
    );
  });

  it('is null for a settled or past card', () => {
    expect(nextStep(card({ status: 'entered', events: [line({ state: 'entered', canWithdraw: true, pendingReasons: [] })] }), true)).toBeNull();
    expect(nextStep(card({ status: 'played', events: [line({ pendingReasons: ['awaiting_payment'] })] }), true)).toBeNull();
    expect(nextStep(card({ events: [line({ state: 'withdrawn', pendingReasons: ['awaiting_payment'] })] }), true)).toBeNull();
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

    expect(root.querySelector('h2')?.textContent).toBe('Past');
    const link = root.querySelector('article a') as HTMLAnchorElement;
    expect(link.textContent).toBe('Spring Open');
    expect(link.getAttribute('href')).toBe('/e/spring-open');
    for (const text of ['Kingsway BC', 'Kingsway Centre', '12 September 2026']) expect(root.textContent).toContain(text);
    expect(root.textContent).toContain('Played');
    for (const text of ["MS", "Men's Singles", "Ada Chen"]) expect(root.textContent).toContain(text);
    expect(root.textContent).toContain('Winner');
    expect(root.textContent).toContain('Total 55.00 (currency not stated)');
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
    for (const text of ["XD", "Men's Singles", "Ada Chen", "Sam Ali"]) expect(root.textContent).toContain(text);
    for (const text of ["MS", "Men's Singles", "Ada Chen"]) expect(root.textContent).toContain(text);
    // The un-partnered line carries no stray "with".
    expect(root.textContent).not.toContain('Ada Chen with Sam Ali with');
  });

  it('reports a failed partner invite honestly, with no fake resend action (V3-PE37.1)', () => {
    const root = mount();
    render(root, {
      tournaments: [
        card({ events: [line({ eventCode: 'XD', partnerInviteMailFailed: true })] }),
      ],
    });
    expect(root.textContent).toContain(
      'The invitation email to your partner could not be sent. Let them know directly.',
    );
    // No invented "resend" or "share this link" affordance: the token is
    // only ever stored hashed (I5), so there is no link left to offer.
    expect(root.textContent).not.toMatch(/resend/i);
    expect(root.textContent).not.toMatch(/share.*link/i);
  });

  it('says nothing when the invite mail outcome is unknown or fine', () => {
    const root = mount();
    render(root, {
      tournaments: [card({ events: [line({ partnerInviteMailFailed: false })] })],
    });
    expect(root.textContent).not.toContain('could not be sent');
  });

  it('footer carries a receipt link and the withdrawal deadline when present (E2)', () => {
    const root = mount();
    render(root, {
      tournaments: [card({ withdrawsUntil: '2026-09-05T18:00:00Z' })],
    });
    const receipt = [...root.querySelectorAll('a')].find(
      (a) => a.textContent === 'View receipt',
    );
    expect(receipt?.getAttribute('href')).toBe('/e/spring-open/receipt/H4KJ29QW');
    expect(root.textContent).toContain('You can withdraw yourself until');
    // V3-24-1: the entrant's handle on this entry, on the surface they reach
    // for before the receipt — the same string the receipt page prints.
    expect(root.textContent).toContain('H4KJ29QW');
  });

  it('names a line\'s own act only when it is not the card\'s (V3-24-1)', () => {
    const root = mount();
    render(root, {
      tournaments: [
        card({
          shortReference: 'H4KJ29QW',
          events: [line(), line({ shortReference: 'PQRS2345', eventCode: 'WS' })],
        }),
      ],
    });
    // The older act's line says which reference answers for it; the line
    // that belongs to the card's own act does not repeat the footer.
    expect(root.textContent).toContain('Earlier entries');
    expect(root.textContent).toContain('PQRS2345');
    expect(root.textContent?.match(/H4KJ29QW/g)).toHaveLength(1);
  });

  it('omits the withdrawal deadline text when there is no open deadline', () => {
    const root = mount();
    render(root, { tournaments: [card({ withdrawsUntil: null })] });
    expect(root.textContent).not.toContain('You can withdraw yourself until');
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
    expect(labels).toContain('Withdraw entry');
    expect(labels).not.toContain('Withdraw and erase');

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
      (b) => b.textContent === 'Withdraw entry',
    );
    first?.click();

    expect(root.textContent).toContain('Withdraw Ada Chen from');
    const keep = [...root.querySelectorAll('button')].find(
      (b) => b.textContent === 'Keep it',
    );
    expect(keep).toBeTruthy();
    keep?.click();
    expect(root.textContent).not.toContain('Withdraw Ada Chen from');
  });
});

describe('the account panel (E5)', () => {
  /** The settings page's mount (`routes/mySettings.tsx`): since 2026-09-12
   *  the panel renders THERE and nowhere else, so each case builds the slot
   *  the page ships and renders with no entries list at all. */
  function mount() {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    root.id = 'my-account-root';
    document.body.appendChild(root);
    return root;
  }

  it('appears only for a verified account', () => {
    // Both rights are irreversible or disclosing, and E2's reasoning
    // applies: an unverified account has not shown it controls the address
    // it claims, and the routes 403 it anyway.
    const verified = mount();
    render(null, { tournaments: [card()], emailVerified: true });
    expect(verified.textContent).toContain('Your account');

    const unverified = mount();
    render(null, { tournaments: [card()], emailVerified: false });
    expect(unverified.textContent).not.toContain('Your account');
    // The unverified reader is told what unlocks the controls, with a way to do it.
    expect(unverified.textContent).toContain('Confirm your email');
    expect(unverified.querySelector('a')?.getAttribute('href')).toBe('/e/verify');
  });

  it('never renders on the entries list itself (the list is a different task)', () => {
    document.body.innerHTML = '';
    const list = document.createElement('div');
    list.id = 'my-entries-root';
    document.body.appendChild(list);
    render(list, { tournaments: [card()], emailVerified: true });
    expect(list.textContent).not.toContain('Your account');
    expect(list.textContent).not.toContain('Download my data');
  });

  it('arms erasure and says what actually happens', () => {
    // Ruling D7 is a product promise as much as a schema decision: the
    // details go, the entries stay as the organizers' records. Copy that
    // said "your data will be deleted" would describe a different product.
    const root = mount();
    render(null, { tournaments: [card()], emailVerified: true });

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
    render(null, { tournaments: [card()], emailVerified: true });
    expect(
      [...root.querySelectorAll('button')].some(
        (b) => b.textContent === 'Download my data',
      ),
    ).toBe(true);
  });
});
