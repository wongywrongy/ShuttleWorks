/**
 * The tier's ONE chevron (operator/public remediation P2).
 *
 * The entrant tier renders complete native HTML with no hydration, so its
 * icon system is inline SVG in `currentColor` — the shape `SearchField.tsx`
 * established: a 16px box, `stroke="currentColor"`, `stroke-width="1.6"`, no
 * fill. Three surfaces had been spelling a chevron as a TEXT GLYPH instead
 * (`›` in the breadcrumb trail, `→` between entry-wizard steps, `⌄` on the
 * schedule's "More filters" disclosure). A glyph is not an icon: it is
 * announced by a screen reader unless suppressed, it inherits the font's own
 * weight rather than a stroke, and the three of them agreed on no size.
 *
 * Always decorative: every call site already names its destination or state
 * in real text, so the chevron carries `aria-hidden` and never a label.
 */
export function Chevron({
  direction = 'right',
  className = '',
}: {
  direction?: 'right' | 'down';
  className?: string;
}) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {direction === 'right' ? <path d="m6 3.5 5 4.5-5 4.5" /> : <path d="m3.5 6 4.5 5 4.5-5" />}
    </svg>
  );
}
