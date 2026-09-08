/**
 * The tournament frame's hero band: breadcrumbs · organizer · name ·
 * date/venue line · plain status line · the venue-time note · ONE
 * phase-dependent CTA (Z8) — a real link when entries are open, plain status
 * text when closed, never a disabled control pretending to be actionable.
 * `children` is the tab bar, rendered inside the band.
 *
 * ADR 0028: the title takes the display role, the status line carries the
 * live tone while entries are open, and the phase eyebrow is gone — the
 * status line and the CTA already say what phase the tournament is in.
 *
 * Contract §11.1 (public P1): this band is now the ONE hero of every
 * tournament-scoped public route, composed by `TournamentFrame`. Two
 * consequences are visible in the props:
 *
 *  - `breadcrumbs` renders above everything else in the band. The trail is
 *    the route back at every depth, replacing the floating `← Tournament`
 *    links the nested routes used to carry.
 *  - `freshness` is GONE. A route may not add its own freshness line to the
 *    hero (§11.1); Schedule's "Schedule updated …" now sits as one muted
 *    line below its list, where the thing it describes actually is.
 *
 * The band is also deliberately compact: at 320-390px the hero must not push
 * the page's primary content below the fold (§11.1), so the vertical rhythm
 * and the title step both start small and grow at `md:`.
 */
import type { ReactNode } from 'react';
import { Button } from '@scheduler/design-system/components';

import type { ChipState, CtaState } from '../lib/phase';
import { chipLabel } from '../lib/phase';

export function HeroHeader({
  orgName,
  title,
  metaLine,
  chip,
  cta,
  phaseAction,
  statusOverride,
  timeNote,
  breadcrumbs,
  children,
}: {
  orgName: string | null;
  title: string;
  metaLine: string;
  chip: ChipState;
  cta: CtaState;
  /** Optional newer lifecycle action; old page payloads keep the original
   * two-state hero unchanged. */
  phaseAction?: { label: string; href: string } | null;
  /**
   * V3-PE03.3: when the server ships an explicit lifecycle phase, the
   * subtitle leads with the tournament's REAL state (e.g. "Live now")
   * instead of the binary entries chip — a live tournament's header used to
   * say "Entries closed" while its own CTA said "Follow live matches".
   * Entry closure stays reachable in the Key dates section; it just stops
   * being the FIRST thing a spectator reads. Absent on older payloads,
   * which keep the original two-state chip unchanged.
   */
  statusOverride?: { label: string; live: boolean } | null;
  /**
   * Contract §7.1: "All times local to the venue", stated ONCE per
   * tournament frame. Having said it here, public prose prints bare
   * venue-local dates and times with no IANA identifier, offset or zone
   * abbreviation.
   */
  timeNote?: string | null;
  /** The frame's breadcrumb trail, rendered above the hero content. */
  breadcrumbs?: ReactNode;
  children?: ReactNode;
}) {
  const statusLabel = statusOverride ? statusOverride.label : chipLabel(chip);
  const statusIsLive = statusOverride ? statusOverride.live : chip.kind === 'entriesOpen';
  return (
    <section className="border-b border-rule-soft bg-surface-raised" aria-labelledby="tournament-title">
      <div className="mx-auto w-full max-w-6xl px-4 pt-3 md:pt-5">
        {breadcrumbs ? <div className="pb-3 md:pb-4">{breadcrumbs}</div> : null}
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 pb-4 md:pb-6">
          {/* `flex-1` keeps the CTA on the SAME row, right-aligned, even
              under a long tournament name — without it the title block takes
              the full width and the CTA wraps to a left-aligned second row,
              which reads as a stretched phone layout at 1280px. */}
          <div className="grid min-w-0 flex-1 basis-96 gap-1.5">
            {/* Migration-created bootstrap workspaces are an internal
                ownership placeholder, not a tournament organizer identity. */}
            {orgName && orgName !== 'Local Workspace' ? <p className="text-sm text-muted-foreground">{orgName}</p> : null}
            <h1 id="tournament-title" className="type-display max-w-3xl text-balance text-2xl leading-tight tracking-[-0.025em] text-foreground md:text-[1.875rem]">
              {title}
            </h1>
            {metaLine ? (
              <p className="text-sm text-muted-foreground">{metaLine}</p>
            ) : null}
            <p className={`mt-1 text-sm font-medium ${statusIsLive ? 'text-status-live' : 'text-muted-foreground'}`}>
              {statusLabel}
            </p>
            {timeNote ? <p className="text-xs text-muted-foreground">{timeNote}</p> : null}
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
        {children ? <div className="pb-3 md:pb-4">{children}</div> : null}
      </div>
    </section>
  );
}
