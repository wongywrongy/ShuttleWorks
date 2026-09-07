/**
 * The entrant tier's titled card, in two anatomies.
 *
 * `titled` (default since ADR 0028, the Overview grid): a `LIST_CARD` with a
 * sentence-case `h2` band and label/value rows (`SectionCard.Row`) separated
 * by their own top rules — Key dates, Venue, Fees & payment, Documents.
 *
 * `eyebrow`: the earlier padded card with an uppercase `h3` eyebrow and a
 * free-form body, which the receipt's three cards keep.
 */
import type { ReactNode } from 'react';
import { CARD, LIST_CARD, LIST_CARD_ROW } from '../lib/ui';

export function SectionCard({
  title,
  variant = 'titled',
  children,
  labelledBy,
}: {
  title: string;
  variant?: 'titled' | 'eyebrow';
  children: ReactNode;
  /** Optional id for the heading so the section can be `aria-labelledby` it. */
  labelledBy?: string;
}) {
  if (variant === 'eyebrow') {
    // p-6 / mt-3 / gap-2: 24-12-8, all steps on the design system's spacing
    // scale — the public pages are "setup" surfaces, which breathe.
    return (
      <section className={CARD}>
        {/* v3-consolidated work package 26b: `h2`, matching the `titled`
            variant below — `eyebrow` is used only by `receipt.tsx`,
            directly under the page's one `<h1>`, so an `h3` here skipped a
            level (plan §6 "Accessibility"). The uppercase eyebrow STYLE is
            unchanged; only the semantic level moved. */}
        <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {title}
        </h2>
        <div className="mt-3 grid gap-2 text-sm text-foreground">{children}</div>
      </section>
    );
  }
  return (
    // v3-consolidated work package 26b: `min-w-0`. The Overview grid
    // (`tournament.tsx`) lays these cards out as CSS Grid items with no
    // explicit column width below `md:` — an implicit grid item defaults
    // to `min-width: auto`, so a long value (an address line, an
    // unbroken document-version string) inside ONE card was measurably
    // forcing the whole shared row wider than the viewport (plan §6
    // "Responsive/signage"; same mechanism as the Discovery calendar
    // card and the intro/key-dates grids above it in this same package —
    // see `SeasonCalendar.tsx`'s comment for the full mechanism).
    <section className={`min-w-0 ${LIST_CARD} pb-1`} aria-labelledby={labelledBy}>
      <h2 id={labelledBy} className="px-4 pb-3 pt-4 text-base font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * A `titled` SectionCard's prose body — the Overview's About card
 * (public-visual-fixes P6).
 *
 * The card's own padding stops at its heading band, because its usual
 * children are `SectionRow`s that carry their own. A paragraph is not a row,
 * so it brings the padding with it; `max-w-prose` keeps the measure readable
 * when the card spans a full column.
 */
export function SectionProse({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-prose text-pretty px-4 pb-4 text-base leading-7 text-foreground">
      {children}
    </p>
  );
}

/** One label/value row of a `titled` SectionCard. */
export function SectionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={LIST_CARD_ROW}>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums text-foreground">{children}</span>
    </div>
  );
}
