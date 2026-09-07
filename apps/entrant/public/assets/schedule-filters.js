/**
 * The schedule filter row's change-submit enhancement (public-visual-fixes
 * P7) — the smallest possible script, and one the page does not need.
 *
 * The row is a native GET form: the day and organisation are links or a
 * `<select>`, the search submits on Enter, and an `sr-only` submit applies a
 * changed select for a reader with no JavaScript. All this adds is the step
 * a mouse user expects — choosing a day, an event, a court or a state
 * applies it immediately, instead of choosing and then submitting.
 *
 * `requestSubmit()` rather than `submit()`: it runs the form's own
 * validation and fires `submit`, so the form behaves exactly as it does when
 * the reader presses Enter. Where it is missing (old Safari), the listener
 * does nothing and the `sr-only` control is still there — the page stays
 * usable rather than half-enhanced.
 */
export function bootScheduleFilters(form) {
  if (!form || typeof form.requestSubmit !== 'function') return;
  form.addEventListener('change', (event) => {
    const target = event.target;
    if (target && target.tagName === 'SELECT') form.requestSubmit();
  });
}

if (typeof document !== 'undefined') {
  bootScheduleFilters(document.querySelector('[data-schedule-filters]'));
}
