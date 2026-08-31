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
 * Copy note: the mockup's "Follow live — draws & results" carries an em dash,
 * which `tests/noEmDash.test.ts` bans tier-wide. Middot instead, which is the
 * separator the rest of this tier's consumer copy already uses.
 */
import { formatDateLong } from '../lib/format';
import type { SeasonRow } from '../lib/phase';

export function NowStrip({ row, moreCount }: { row: SeasonRow; moreCount: number }) {
  const parts = [
    row.venueName,
    formatDateLong(row.date),
    `${row.eventCount} ${row.eventCount === 1 ? 'event' : 'events'}`,
  ].filter((part): part is string => part !== null && part !== '');

  return (
    <section aria-label="Now playing" className="border-y border-rule-soft">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 border-s-2 border-s-status-live px-4 py-3">
        <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Now playing
        </span>
        <span className="text-sm font-semibold text-foreground">
          {row.name ?? row.slug}
        </span>
        <span className="text-sm text-muted-foreground">{parts.join(' · ')}</span>
        <a
          href={`/e/${encodeURIComponent(row.slug)}?tab=draws`}
          className="ml-auto text-sm font-semibold text-accent underline-offset-4 hover:underline"
        >
          Follow live · draws &amp; results →
        </a>
        {moreCount > 0 ? (
          // The calendar's own anchor, not a second listing: "more" means
          // "keep reading down this page".
          <a
            href="#calendar"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            +{moreCount} more
          </a>
        ) : null}
      </div>
    </section>
  );
}
