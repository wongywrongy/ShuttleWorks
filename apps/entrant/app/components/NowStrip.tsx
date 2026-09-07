/**
 * §2.1: the conditional current-tournament band.
 *
 * The date arithmetic and the draws-publication flag that decide whether
 * anything is "happening now" are the SERVER's (`now` on the listing
 * payload) — this component renders unconditionally, so absence is the page
 * not rendering it at all, never an empty band with a placeholder in it.
 *
 * Player count: omitted. There is no public person-count projection to read
 * (the SP-P7 deferral), and a band that says "0 players" or invents one is
 * worse than a band that says what it knows. The upgrade is projection-side
 * only; it is recorded in the ledger.
 *
 * ADR 0028: the band is the raised surface with the live signal carried by
 * TEXT (the "Live today" eyebrow in the live tone) and a 1px light sweeping
 * along the bottom rule — no tinted status ground, no dot, nothing round.
 *
 * Copy note: the mockup's "Follow live — draws & results" carries an em dash,
 * which `tests/noEmDash.test.ts` bans tier-wide. Middot instead, which is the
 * separator the rest of this tier's consumer copy already uses.
 */
import { formatDateLong } from '../lib/format';
import type { SeasonRow } from '../lib/phase';
import { ACTION_LINK, ACTION_LINK_MUTED } from '../lib/ui';

export function NowStrip({ row, moreCount }: { row: SeasonRow; moreCount: number }) {
  const parts = [
    row.venueName,
    formatDateLong(row.date),
    `${row.eventCount} ${row.eventCount === 1 ? 'event' : 'events'}`,
  ].filter((part): part is string => part !== null && part !== '');

  return (
    <section aria-label="Now playing" className="relative border-y border-rule-soft bg-surface-raised">
      {/* The sweep track sits ON the bottom rule; `clip-path` bounds the
          travelling light to the track without `overflow-hidden`, which this
          tier bans. */}
      <div aria-hidden className="absolute inset-x-0 -bottom-px h-px [clip-path:inset(0)]">
        <div className="sw-sweep h-full w-1/5 bg-gradient-to-r from-transparent via-status-live to-transparent" />
      </div>
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-4 px-4 py-5">
        <div className="grid min-w-0 flex-1 basis-80 gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-status-live">
            Live today
          </span>
          <span className="type-display text-2xl leading-[1.1] tracking-[-0.02em] text-foreground">
            {row.name ?? row.slug}
          </span>
          <span className="text-sm text-muted-foreground">{parts.join(' · ')}</span>
        </div>
        <a
          href={`/e/${encodeURIComponent(row.slug)}?tab=draws`}
          className={`shrink-0 ${ACTION_LINK}`}
        >
          Draws &amp; results
        </a>
        {moreCount > 0 ? (
          // The calendar's own anchor, not a second listing: "more" means
          // "keep reading down this page".
          <a
            href="#calendar"
            className={ACTION_LINK_MUTED}
          >
            +{moreCount} more
          </a>
        ) : null}
      </div>
    </section>
  );
}
