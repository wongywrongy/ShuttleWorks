/**
 * The schedule filter row's enhancement (public-visual-fixes P7, refined
 * 2026-09-12) — a small script, and one the page does not need.
 *
 * The row is a native GET form: the day and organisation are links or a
 * `<select>`, the search submits on Enter, and an `sr-only` submit applies a
 * changed select for a reader with no JavaScript. This adds two things:
 *
 * 1. **Change-submit.** Choosing a day, an event, a court or a state applies
 *    it immediately, instead of choosing and then submitting.
 *    `requestSubmit()` rather than `submit()`: it runs the form's own
 *    validation and fires `submit`, so the form behaves exactly as it does
 *    when the reader presses Enter. Where it is missing (old Safari) the
 *    listener does nothing and the `sr-only` control is still there.
 * 2. **The phone-width disclosure.** The secondary filters (event, court,
 *    status) render OPEN in the server document, so a reader without script
 *    sees them at every width, and at `md:` and up they are simply part of
 *    the row (the summary is hidden by CSS). Below `md:` this closes the
 *    disclosure on load when none of those filters is active, and labels its
 *    summary with the active count (`Filters · 2`) so a closed disclosure
 *    never hides a filter the list is under.
 */
export function activeFilterCount(form) {
  let count = 0;
  for (const select of form.querySelectorAll('[data-schedule-more] select')) {
    if (select.value !== '') count += 1;
  }
  return count;
}

export function filterSummaryLabel(count) {
  return count > 0 ? `Filters · ${count}` : 'Filters';
}

/** Close the disclosure below `md:` when nothing in it is active; label it
 *  either way. `matches` is injectable so the suite can model each width. */
export function syncFilterDisclosure(form, narrow) {
  const details = form.querySelector('[data-schedule-more]');
  if (!details) return;
  const count = activeFilterCount(form);
  const label = details.querySelector('[data-schedule-more-label]');
  if (label) label.textContent = filterSummaryLabel(count);
  if (narrow && count === 0) details.open = false;
}

export function bootScheduleFilters(form, matchMedia) {
  if (!form || typeof form.requestSubmit !== 'function') return;
  form.addEventListener('change', (event) => {
    const target = event.target;
    if (target && target.tagName === 'SELECT') form.requestSubmit();
  });
  const query = typeof matchMedia === 'function' ? matchMedia('(max-width: 767px)') : null;
  syncFilterDisclosure(form, Boolean(query?.matches));
}

if (typeof document !== 'undefined') {
  bootScheduleFilters(
    document.querySelector('[data-schedule-filters]'),
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia.bind(window)
      : undefined,
  );
}
