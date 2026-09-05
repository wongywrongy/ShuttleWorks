import { useId, type ReactNode } from 'react';

/** One surface and inset for tournament property editors and summaries. */
export function PropertyPanel({ title, children }: { title?: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={title ? headingId : undefined} className="min-w-0 rounded border border-border bg-card p-6" data-property-panel>
      {title && <h2 id={headingId} className="mb-6 text-section font-semibold text-foreground">{title}</h2>}
      {children}
    </section>
  );
}
