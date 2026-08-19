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

import {
  cardChip,
  formatCents,
  formatDate,
  lineChip,
  priceLine,
  render,
  resultsHref,
  yearGroups,
} from '../public/assets/my-entries.js';

function line(over: Record<string, unknown> = {}) {
  return {
    eventCode: 'MS',
    discipline: "Men's Singles",
    playerName: 'Ada Chen',
    personKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    state: 'entered',
    resultBadge: null,
    ...over,
  };
}

function card(over: Record<string, unknown> = {}) {
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
    expect(resultsHref(card({ status: 'played' }), line({ personKey: '' }))).toBeNull();
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
          events: [line({ playerName: '<script>alert(2)</script>' })],
        }),
      ],
    });
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('script')).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(root.textContent).toContain('<script>alert(2)</script>');
  });
});
