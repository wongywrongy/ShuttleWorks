import type { ReactNode } from 'react';
import { Eyebrow } from './Eyebrow';

/** A hairline-bordered section with a mono `[ EYEBROW ]` heading and an
 *  optional `right` slot (e.g. a health badge or a "N enabled · M available"
 *  count). Used to group inspector / settings sections. */
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
