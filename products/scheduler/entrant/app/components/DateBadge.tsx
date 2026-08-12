/**
 * The card's month/day block. Parses the ISO `tournament_date` convention
 * only; a null or unparseable date renders the same box saying "TBC" — a
 * tournament that has not set a date has not set one, and the box must not
 * invent it. `aria-hidden`: purely decorative — the date for assistive tech
 * is `TournamentCard`'s own `sr-only` text (`formatDateLong`), not this box.
 *
 * (2026-08-11 design audit, T1/finding #2: this comment used to claim "the
 * card's text carries the date for AT". Nothing on the card did — no date
 * appeared anywhere outside this `aria-hidden` badge, so a screen reader got
 * none. The false comment is what let that ship: it told the next reader
 * there was nothing to verify. Fixed alongside the card.)
 */
import { monthShort } from '../lib/format';
import { parseIsoDate } from '../lib/phase';

export function DateBadge({ date }: { date: string | null }) {
  const parsed = parseIsoDate(date);
  return (
    <span
      aria-hidden
      className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-rule-soft bg-surface-sunken text-center leading-none"
    >
      {parsed === null ? (
        <span className="text-xs font-medium text-muted-foreground">TBC</span>
      ) : (
        <span className="grid gap-1">
          <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {monthShort(parsed.getUTCMonth())}
          </span>
          <span className="text-lg font-semibold tabular-nums text-foreground">
            {parsed.getUTCDate()}
          </span>
        </span>
      )}
    </span>
  );
}
