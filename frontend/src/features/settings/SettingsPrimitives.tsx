/**
 * Layout primitives for setting panes.
 *
 * Every pane renders a single ``<Surface>`` and stacks ``<Section>``s
 * inside it. Sections are separated by hairline ``divide-y`` borders;
 * there are no per-section bordered containers. Within a section,
 * label-on-left / control-on-right rows use ``<Field>``, while dense
 * grids of inputs (e.g. Schedule & Venue's date/time/slot/courts row)
 * sit directly under the section as plain markup.
 */
import type { ReactNode } from 'react';

interface SurfaceProps {
  children: ReactNode;
  /** Apply when the surface needs to participate in form submission. */
  className?: string;
}

export function Surface({ children, className }: SurfaceProps) {
  return (
    <div className={['divide-y divide-border/60', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}

interface SectionProps {
  title: string;
  description?: string;
  /** Right-aligned slot in the section header (e.g. count badge, toggle). */
  trailing?: ReactNode;
  children: ReactNode;
}

export function Section({ title, description, trailing, children }: SectionProps) {
  return (
    <section className="py-5 first:pt-0 last:pb-0">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground/80">{description}</p>
          )}
        </div>
        {trailing && <div className="flex-shrink-0">{trailing}</div>}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  htmlFor?: string;
  disabled?: boolean;
  children: ReactNode;
}

/**
 * Single label-and-control row. Label + optional hint sit on the left
 * (capped at ~max-w-md so long hints wrap cleanly); the control is on
 * the right and shrinks to fit. ``flex-wrap`` lets a wide control drop
 * under the label rather than overflowing into a neighbour.
 */
export function Field({ label, hint, htmlFor, disabled, children }: FieldProps) {
  return (
    <div
      className={[
        'flex w-full flex-wrap items-start justify-between gap-x-6 gap-y-2',
        disabled ? 'opacity-50' : '',
      ].join(' ')}
    >
      <div className="min-w-0 max-w-md flex-1">
        <label
          htmlFor={htmlFor}
          className="block text-sm font-medium text-foreground"
        >
          {label}
        </label>
        {hint && (
          <p className="mt-0.5 text-xs text-muted-foreground/80">{hint}</p>
        )}
      </div>
      <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1.5">
        {children}
      </div>
    </div>
  );
}
