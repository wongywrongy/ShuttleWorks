import { useId, type ReactNode } from 'react';

/** One surface and inset for tournament property editors and summaries. */
export function PropertyPanel({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={title ? headingId : undefined} className="min-w-0 rounded border border-border bg-card p-6" data-property-panel>
      {title ? (
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 id={headingId} className="text-section font-semibold text-foreground">{title}</h2>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : action ? <div className="mb-4 flex justify-end">{action}</div> : null}
      {children}
    </section>
  );
}
