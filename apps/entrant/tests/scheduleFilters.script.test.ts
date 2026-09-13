// @vitest-environment jsdom
/**
 * The schedule filter row's change-submit enhancement (public-visual-fixes
 * P7) — the shipped module itself (`public/assets/schedule-filters.js`),
 * same posture as the other page-scoped script suites: the file the browser
 * runs is the file under test.
 *
 * What matters here is the FALLBACK, not the enhancement: the row is a
 * native GET form with an `sr-only` submit, so every assertion below is
 * about the script adding a step rather than owning one.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  activeFilterCount,
  bootScheduleFilters,
  filterSummaryLabel,
  syncFilterDisclosure,
} from '../public/assets/schedule-filters.js';

function form(): HTMLFormElement {
  document.body.innerHTML = `
    <form data-schedule-filters method="get" action="/e/spring-open/schedule">
      <input type="hidden" name="organization" value="time" />
      <input type="search" name="player" />
      <details data-schedule-more open>
        <summary><span data-schedule-more-label>Filters</span></summary>
        <select name="event"><option value="">All events</option><option value="MS">MS</option></select>
        <select name="court"><option value="">All courts</option><option value="1">Court 1</option></select>
        <button type="submit" class="sr-only">Apply filters</button>
      </details>
    </form>
  `;
  return document.querySelector('[data-schedule-filters]') as HTMLFormElement;
}

describe('bootScheduleFilters', () => {
  it('applies a changed select immediately', () => {
    const element = form();
    const submit = vi.fn();
    element.requestSubmit = submit;
    bootScheduleFilters(element);

    const select = element.querySelector('select') as HTMLSelectElement;
    select.value = 'MS';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('leaves the search field alone — that one submits on Enter', () => {
    const element = form();
    const submit = vi.fn();
    element.requestSubmit = submit;
    bootScheduleFilters(element);

    const search = element.querySelector('input[type="search"]') as HTMLInputElement;
    search.value = 'lovelace';
    search.dispatchEvent(new Event('change', { bubbles: true }));
    expect(submit).not.toHaveBeenCalled();
  });

  it('does nothing at all where requestSubmit is missing, or where the row is not on the page', () => {
    const element = form();
    // @ts-expect-error — modelling an engine without requestSubmit.
    element.requestSubmit = undefined;
    expect(() => bootScheduleFilters(element)).not.toThrow();
    expect(() => bootScheduleFilters(null)).not.toThrow();
  });
});

describe('the phone-width filter disclosure (refinement 2026-09-12)', () => {
  it('counts the active secondary filters and spells the summary from them', () => {
    const element = form();
    expect(activeFilterCount(element)).toBe(0);
    expect(filterSummaryLabel(0)).toBe('Filters');
    (element.querySelector('select[name="event"]') as HTMLSelectElement).value = 'MS';
    expect(activeFilterCount(element)).toBe(1);
    expect(filterSummaryLabel(1)).toBe('Filters · 1');
  });

  it('closes the disclosure on a phone only when nothing in it is active, and never on a wide screen', () => {
    const narrowIdle = form();
    syncFilterDisclosure(narrowIdle, true);
    expect((narrowIdle.querySelector('[data-schedule-more]') as HTMLDetailsElement).open).toBe(false);
    expect(narrowIdle.querySelector('[data-schedule-more-label]')?.textContent).toBe('Filters');

    const narrowActive = form();
    (narrowActive.querySelector('select[name="event"]') as HTMLSelectElement).value = 'MS';
    syncFilterDisclosure(narrowActive, true);
    expect((narrowActive.querySelector('[data-schedule-more]') as HTMLDetailsElement).open).toBe(true);
    expect(narrowActive.querySelector('[data-schedule-more-label]')?.textContent).toBe('Filters · 1');

    const wide = form();
    syncFilterDisclosure(wide, false);
    expect((wide.querySelector('[data-schedule-more]') as HTMLDetailsElement).open).toBe(true);
  });

  it('boots the disclosure from the width the page reports, and the fallback stays open without it', () => {
    const element = form();
    element.requestSubmit = vi.fn();
    bootScheduleFilters(element, () => ({ matches: true }));
    expect((element.querySelector('[data-schedule-more]') as HTMLDetailsElement).open).toBe(false);

    const noMedia = form();
    noMedia.requestSubmit = vi.fn();
    bootScheduleFilters(noMedia);
    expect((noMedia.querySelector('[data-schedule-more]') as HTMLDetailsElement).open).toBe(true);
  });
});
