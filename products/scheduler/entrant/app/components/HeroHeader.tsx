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
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-6 pb-6">
          {/* `flex-1` keeps the CTA on the SAME row, right-aligned, even
              under a long tournament name — without it the title block takes
              the full width and the CTA wraps to a left-aligned second row,
              which reads as a stretched phone layout at 1280px. */}
          <div className="min-w-0 flex-1 basis-96">
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
          {/* E5: when entries are closed there is NOTHING here, because the
              chip six lines up already says "Entries closed" — the two
              rendered side by side on one line of the hero, the same two
              words twice. The chip is the one that stays: it is the
              semantic token, it is what the discovery cards wear, and it is
              in the same place on every state of this page. Still never a
              disabled control (Z8) — that was always the rule, and an empty
              slot keeps it more literally than status text did. */}
          {cta.kind === 'enter' ? (
            <Button asChild variant="brand" size="lg">
              <a href={cta.href}>Enter this tournament</a>
            </Button>
          ) : null}
        </div>
        {children}
      </div>
    </section>
  );
}
