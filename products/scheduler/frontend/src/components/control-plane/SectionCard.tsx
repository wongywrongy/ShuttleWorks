import type { ReactNode } from 'react';
import { Eyebrow } from './Eyebrow';

/** A hairline-bordered section with an `EYEBROW` heading and an optional
 *  `right` slot (e.g. a health badge or a "N enabled · M available" count).
 *
 *  This is the grouping primitive for detail panels and settings sections
 *  alike, and it is the ONLY sanctioned way to label a panel section: it
 *  renders `Eyebrow`, which is `EYEBROW_CLASS` plus a tone. Reach for it as
 *  `DetailPanel.Section` inside a pane (same component, named where a panel
 *  author looks for it) and as `SectionCard` anywhere else. */
export function SectionCard({
  eyebrow,
  children,
  right,
  testId,
}: {
  eyebrow: string;
  children: ReactNode;
  right?: ReactNode;
  testId?: string;
}) {
  return (
    <section data-testid={testId} className="border-b border-border p-4">
      <div className="mb-2 flex items-center justify-between">
        <Eyebrow framed>{eyebrow}</Eyebrow>
        {right}
      </div>
      {children}
    </section>
  );
}
