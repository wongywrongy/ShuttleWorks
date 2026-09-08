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

import { bootScheduleFilters } from '../public/assets/schedule-filters.js';

function form(): HTMLFormElement {
  document.body.innerHTML = `
    <form data-schedule-filters method="get" action="/e/spring-open/schedule">
      <input type="hidden" name="organization" value="time" />
      <select name="event"><option value="">All events</option><option value="MS">MS</option></select>
      <input type="search" name="player" />
      <button type="submit" class="sr-only">Apply filters</button>
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
