/**
 * The tier's one search field (public-visual-fixes P7).
 *
 * Compact by construction: a magnifier, the field, and a submit control that
 * is present for assistive technology and for a keyboard reader but takes no
 * space (`sr-only`). The visible "Find" / "Apply" buttons this replaces were
 * a full control's worth of furniture next to a box whose own Enter key
 * already did the same thing — and on Schedule they sat under three selects,
 * which is how one filter row became two stacked cards.
 *
 * It renders INSIDE a caller's `<form method="get">`; the caller carries the
 * other active filters as hidden inputs, so submitting a search keeps the day,
 * the organisation, the season or the tab the reader was already under. The
 * form is native, so Enter submits with no script anywhere.
 *
 * The label is real and associated by `for`/`id`; it is `sr-only` because the
 * compact treatment (icon + placeholder + the surrounding controls) already
 * says what the field is to a sighted reader, and a visible "Find a player"
 * above a box that says "Name or club" is the redundancy the critique named.
 */
import { SEARCH_INPUT, SEARCH_SHELL } from '../lib/ui';

export function SearchField({
  id,
  name,
  label,
  placeholder,
  defaultValue = '',
  submitLabel = 'Search',
  className = '',
}: {
  /** Unique in the document — the label's `for` target. */
  id: string;
  name: string;
  /** The accessible name. Always rendered, never only a placeholder. */
  label: string;
  placeholder: string;
  defaultValue?: string;
  /** The accessible name of the invisible submit. */
  submitLabel?: string;
  className?: string;
}) {
  return (
    <div className={className === '' ? SEARCH_SHELL : `${SEARCH_SHELL} ${className}`}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <span className="flex items-center ps-3" aria-hidden>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className="shrink-0 text-muted-foreground"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5 14 14" />
        </svg>
      </span>
      <input
        id={id}
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={SEARCH_INPUT}
      />
      {/* The submit exists so the form is operable by a reader who never
          presses Enter in the field, and so the control has a name in the
          accessibility tree. It is deliberately invisible: the visible
          button it replaces was the thing being removed. */}
      <button type="submit" className="sr-only">
        {submitLabel}
      </button>
    </div>
  );
}
