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
 * **Two anatomies since the 2026-09-12 public refinement.** The `full`
 * band (Overview) keeps the organizer, the display-size title and the long
 * dates. The `compact` band (Schedule, Draws, Players, Documents) says the
 * same things at a smaller step on two lines — title with its status word,
 * then the concise dates and venue with the venue-time note — because on
 * those pages the reader came for the section's content, and the old band
 * pushed it a whole screen down on a phone. Nothing is dropped that a
 * reader acts on: the status, the dates, the venue, the action and the
 * tabs are all still there.
 */
import type { ReactNode } from 'react';
import { Button } from '@scheduler/design-system/components';

import type { ChipState, CtaState } from '../lib/phase';
import { chipLabel } from '../lib/phase';
import type { FrameVariant } from '../lib/tournamentFrame';
import { INLINE_METADATA_SEPARATOR } from '../lib/ui';

export function HeroHeader({
  orgName,
  title,
  metaLine,
  compactMetaLine,
  variant = 'full',
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
  /** The concise dates-and-venue line the compact band prints. Falls back
   * to `metaLine` when a caller has no short form. */
  compactMetaLine?: string;
  variant?: FrameVariant;
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
  const statusClass = statusIsLive ? 'text-status-live' : 'text-muted-foreground';
  // When entries are closed the plain status line already answers; the
  // action slot stays empty rather than repeating it or presenting a
  // disabled control.
  const action = phaseAction
    ? phaseAction
    : cta.kind === 'enter'
      ? { label: 'Enter this tournament', href: cta.href }
      : null;

  if (variant === 'compact') {
    const meta = compactMetaLine || metaLine;
    return (
      <section className="border-b border-rule-soft bg-surface-raised" aria-labelledby="tournament-title">
        <div className="mx-auto w-full max-w-6xl px-4 pt-2.5">
          {breadcrumbs ? <div className="pb-1.5">{breadcrumbs}</div> : null}
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pb-2.5">
            <div className="grid min-w-0 flex-1 basis-80 gap-0.5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <h1 id="tournament-title" className="type-display text-xl leading-tight tracking-[-0.02em] text-foreground">
                  {title}
                </h1>
                <span className={`text-sm font-medium ${statusClass}`}>{statusLabel}</span>
              </div>
              {meta || timeNote ? (
                <p className="text-sm text-muted-foreground">
                  {meta}
                  {meta && timeNote ? INLINE_METADATA_SEPARATOR : ''}
                  {timeNote ? <span className="text-xs">{timeNote}</span> : null}
                </p>
              ) : null}
            </div>
            {action ? (
              <Button asChild variant="brand" size="sm">
                <a href={action.href}>{action.label}</a>
              </Button>
            ) : null}
          </div>
          {children ? <div className="pb-1">{children}</div> : null}
        </div>
      </section>
    );
  }

  return (
    <section className="border-b border-rule-soft bg-surface-raised" aria-labelledby="tournament-title">
      <div className="mx-auto w-full max-w-6xl px-4 pt-3 md:pt-4">
        {breadcrumbs ? <div className="pb-2">{breadcrumbs}</div> : null}
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3 pb-3 md:pb-4">
          {/* `flex-1` keeps the CTA on the SAME row, right-aligned, even
              under a long tournament name — without it the title block takes
              the full width and the CTA wraps to a left-aligned second row,
              which reads as a stretched phone layout at 1280px. */}
          <div className="grid min-w-0 flex-1 basis-96 gap-1">
            {/* Migration-created bootstrap workspaces are an internal
                ownership placeholder, not a tournament organizer identity. */}
            {orgName && orgName !== 'Local Workspace' ? <p className="text-sm text-muted-foreground">{orgName}</p> : null}
            <h1 id="tournament-title" className="type-display max-w-3xl text-balance text-2xl leading-tight tracking-[-0.025em] text-foreground md:text-[1.875rem]">
              {title}
            </h1>
            {metaLine ? (
              <p className="text-sm text-muted-foreground">{metaLine}</p>
            ) : null}
            {/* The status and the venue-time rule share one line: two facts
                a reader takes in together, and one fewer row before the
                tabs. */}
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
              <span className={`font-medium ${statusClass}`}>{statusLabel}</span>
              {timeNote ? <span className="text-xs text-muted-foreground">{timeNote}</span> : null}
            </p>
          </div>
          {action ? (
            <Button asChild variant="brand" size="lg">
              <a href={action.href}>{action.label}</a>
            </Button>
          ) : null}
        </div>
        {children ? <div className="pb-1 md:pb-2">{children}</div> : null}
      </div>
    </section>
  );
}
