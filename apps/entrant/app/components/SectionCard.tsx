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
        <h3 className="text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {title}
        </h3>
        <div className="mt-3 grid gap-2 text-sm text-foreground">{children}</div>
      </section>
    );
  }
  return (
    <section className={`${LIST_CARD} pb-1`} aria-labelledby={labelledBy}>
      <h2 id={labelledBy} className="px-4 pb-3 pt-4 text-base font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      {children}
    </section>
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
