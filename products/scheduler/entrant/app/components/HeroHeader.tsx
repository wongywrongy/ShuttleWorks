/**
 * The tournament page's hero band: organizer · name · date/venue line ·
 * status chip · ONE phase-dependent CTA (Z8) — a real link when entries are
 * open, plain status text when closed, never a disabled control pretending
 * to be actionable. `children` is the tab bar, rendered inside the band so
 * the active-tab underline sits on the band's bottom rule.
 */
import type { ReactNode } from 'react';
import { Button } from '@scheduler/design-system/components';

import type { ChipState, CtaState } from '../lib/phase';
import { StatusChip } from './StatusChip';

export function HeroHeader({
  orgName,
  title,
  metaLine,
  chip,
  cta,
  children,
}: {
  orgName: string | null;
  title: string;
  metaLine: string;
  chip: ChipState;
  cta: CtaState;
  children?: ReactNode;
}) {
  return (
    <section className="border-b border-rule-soft bg-surface-raised">
      <div className="mx-auto w-full max-w-6xl px-4 pt-8 md:pt-10">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 pb-6">
          <div className="min-w-0">
            {orgName ? <p className="text-sm text-muted-foreground">{orgName}</p> : null}
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground md:text-[1.75rem]">
              {title}
            </h1>
            {metaLine ? (
              <p className="mt-1.5 text-sm text-muted-foreground">{metaLine}</p>
            ) : null}
            <div className="mt-3">
              <StatusChip state={chip} />
            </div>
          </div>
          {cta.kind === 'enter' ? (
            <Button asChild variant="brand" size="lg">
              <a href={cta.href}>Enter this tournament</a>
            </Button>
          ) : (
            <p className="text-sm font-medium text-muted-foreground">Entries closed</p>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}
