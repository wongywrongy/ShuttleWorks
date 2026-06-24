import type { ReactNode } from 'react';

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
        <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </span>
        {right}
      </div>
      {children}
    </section>
  );
}
