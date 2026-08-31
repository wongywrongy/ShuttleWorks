/**
 * One Overview card: an eyebrow heading and its content on the raised
 * surface. The card grid's shared skin — Timeline, Fees, Payment,
 * Regulations and Venue all sit on it.
 */
import type { ReactNode } from 'react';
import { CARD } from '../lib/ui';

export function SectionCard({ title, children }: { title: string; children: ReactNode }) {
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
