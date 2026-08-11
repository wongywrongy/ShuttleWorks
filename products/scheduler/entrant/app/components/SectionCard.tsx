/**
 * One Overview card: an eyebrow heading and its content on the raised
 * surface. The card grid's shared skin — Timeline, Fees, Payment,
 * Regulations and Venue all sit on it.
 */
import type { ReactNode } from 'react';

export function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-rule-soft bg-surface-raised p-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {title}
      </h3>
      <div className="mt-3 grid gap-2 text-sm text-foreground">{children}</div>
    </section>
  );
}
