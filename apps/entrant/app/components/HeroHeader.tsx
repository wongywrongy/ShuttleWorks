/**
 * The tournament page's hero band: organizer · name · date/venue line ·
 * plain status line · ONE phase-dependent CTA (Z8) — a real link when entries are
 * open, plain status text when closed, never a disabled control pretending
 * to be actionable. `children` is the tab bar, rendered inside the band so
 * the active-tab underline sits on the band's bottom rule.
 */
import type { ReactNode } from 'react';
import { Button } from '@scheduler/design-system/components';

import type { ChipState, CtaState, TournamentPhase } from '../lib/phase';
import { chipLabel, phaseLabel } from '../lib/phase';

export function HeroHeader({
  orgName,
  title,
  metaLine,
  chip,
  cta,
  phase,
  phaseAction,
  freshness,
  children,
}: {
  orgName: string | null;
  title: string;
  metaLine: string;
  chip: ChipState;
  cta: CtaState;
  /** Optional newer lifecycle presentation; old page payloads keep the
   * original two-state hero unchanged. */
  phase?: TournamentPhase;
  phaseAction?: { label: string; href: string } | null;
  freshness?: string | null;
  children?: ReactNode;
}) {
  return (
    <section className="border-b border-rule-soft bg-surface-raised" aria-labelledby="tournament-title">
      <div className="mx-auto w-full max-w-6xl px-4 pt-8 md:pt-10">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-6 pb-6">
          {/* `flex-1` keeps the CTA on the SAME row, right-aligned, even
              under a long tournament name — without it the title block takes
              the full width and the CTA wraps to a left-aligned second row,
              which reads as a stretched phone layout at 1280px. */}
          <div className="min-w-0 flex-1 basis-96">
            {orgName ? <p className="text-sm text-muted-foreground">{orgName}</p> : null}
            <h1 id="tournament-title" className="mt-1 max-w-3xl text-balance font-display text-2xl font-semibold tracking-tight text-foreground md:text-[1.75rem]">
              {title}
            </h1>
            {metaLine ? (
              <p className="mt-1.5 text-sm text-muted-foreground">{metaLine}</p>
            ) : null}
            <p className="mt-3 text-sm font-semibold text-foreground">{chipLabel(chip)}</p>
            {phase ? <p className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{phaseLabel(phase)}</p> : null}
            {freshness ? <p className="mt-1 text-xs text-muted-foreground">{freshness}</p> : null}
          </div>
          {/* When entries are closed the plain status line already answers;
              the action slot stays empty rather than repeating it or
              presenting a disabled control. */}
          {phaseAction ? (
            <Button asChild variant="brand" size="lg">
              <a href={phaseAction.href}>{phaseAction.label}</a>
            </Button>
          ) : cta.kind === 'enter' ? (
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
