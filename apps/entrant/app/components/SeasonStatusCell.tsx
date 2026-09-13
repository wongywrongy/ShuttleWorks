/**
 * P5: the one right-hand ACTION slot on a calendar row. Every row has exactly
 * one, in the same place, in one of four shapes; the choice arrives decided
 * (`actionCell`, `lib/phase.ts`) and there is no judgement here.
 *
 * Never a dead link, by construction rather than by care: `ActionCell` is a
 * closed sum type whose "nothing published" arm carries no `href` field at
 * all, so a row with nothing to show has nowhere to link and no way to grow a
 * link by accident (§7 trap 3).
 *
 * The link arms are `relative z-10`: every calendar row is one stretched link
 * over the tournament page, and a real link inside it has to sit above that
 * overlay or the row swallows the click.
 *
 * The entry action names the closing DAY in the tournament's own zone
 * ("Enter · closes 15 Aug"), not a countdown: "closes in 5d" is not a date a
 * reader can act on, and it is wrong the moment the page is screenshotted.
 * The instant is CONVERTED into that zone (contract §7.1) — the tier never
 * trims a suffix off a UTC rendering, because that states the wrong day for
 * an evening deadline.
 *
 * Status is plain text or a text link. SP-P9 reserves containers for neither
 * routine state nor live state on public discovery.
 */
import { formatDayMonthInZone } from '../lib/format';
import type { ActionCell } from '../lib/phase';
import { ACTION_LINK_BASE } from '../lib/ui';

/** The shared link register (`ACTION_LINK`), plus the stretched-row escape.
 * The tone is composed at the call site; the trailing arrows these actions
 * used to carry are gone (P7) — an underlined accent link already says it
 * leads somewhere, and the glyph only survived on two of the four arms, so
 * it read as a difference between them that does not exist. */
const LINK = `relative z-10 ${ACTION_LINK_BASE}`;

/** Deadline text rendered below the Enter button. Null means no deadline. */
function deadlineText(cell: Extract<ActionCell, { kind: 'enter' }>): string | null {
  return cell.closesAt === null ? null : `closes ${formatDayMonthInZone(cell.closesAt, cell.timeZone)}`;
}

export function SeasonStatusCell({ cell }: { cell: ActionCell }) {
  if (cell.kind === 'enter') {
    const deadline = deadlineText(cell);
    return (
      <div className="grid gap-0.5 text-right">
        <a href={cell.href} className={`${LINK} text-accent`}>
          Enter
        </a>
        {deadline ? (
          <span className="text-xs text-muted-foreground">{deadline}</span>
        ) : null}
      </div>
    );
  }

  if (cell.kind === 'live') {
    return (
      <a href={cell.href} className={`${LINK} text-status-live`}>
        {cell.label}
      </a>
    );
  }

  if (cell.kind === 'results') {
    return (
      <a href={cell.href} className={`${LINK} text-accent`}>
        Results
      </a>
    );
  }

  return <span className="text-sm text-muted-foreground">{cell.label}</span>;
}
