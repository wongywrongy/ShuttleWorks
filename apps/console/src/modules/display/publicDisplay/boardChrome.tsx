/**
 * Shared venue-board chrome — the pieces both boards (meet and bracket) put
 * around their court content, so branding and the clock cannot drift into two
 * implementations.
 *
 * All three are governed by match-card contract §4.4 as rewritten by the P0
 * operator-visual-fixes pass:
 *
 *  - the board shows the tournament name and a **secondary** clock in the
 *    **tournament's own timezone**, with **no zone abbreviation** — a venue
 *    reader is standing in the venue;
 *  - if no timezone is available the clock is **omitted** entirely rather
 *    than falling back to UTC, which is what both boards used to hardcode;
 *  - branding (logo, banner, title) is operator-set and public by
 *    construction: it is what gets projected on the wall.
 */
import { formatDateTime } from '../../../lib/formatDateTime';

/** The default board accent, used when the operator has set none. */
export const DEFAULT_BOARD_ACCENT = '#10b981';

/** Normalise a stored `#RRGGBB`, falling back to the board default. Mirrors
 *  the API's own `HexColor` validation — a client-side control over a
 *  server-stored value can never be the only one (ASVS 2.2.2). */
export function resolveBoardAccent(accent: string | null | undefined): string {
  if (!accent) return DEFAULT_BOARD_ACCENT;
  const bare = accent.replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(bare)) return DEFAULT_BOARD_ACCENT;
  return accent.startsWith('#') ? accent : `#${accent}`;
}

/**
 * Time-of-day in the tournament's zone, or `null` when there is no usable
 * zone — an unknown or malformed IANA name makes `Intl` throw, and a board
 * that guesses is worse than a board with no clock (the operator sees the
 * setup problem in Setup · Details, where the zone is set).
 */
export function boardClock(now: Date, timeZone: string | null | undefined): string | null {
  if (!timeZone) return null;
  try {
    // `clock`, not `clock_with_zone`: no abbreviation on venue signage.
    return formatDateTime(now.toISOString(), 'clock', timeZone);
  } catch {
    return null;
  }
}

/** The board's identity: the operator's logo when set, then the board title
 *  (falling back to the tournament's own name). */
export function BoardMark({
  logoUrl,
  title,
  className = '',
}: {
  logoUrl: string | null;
  title: string | null;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${className}`}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          data-testid="board-logo"
          // Decoration beside the name it repeats — `alt=""` keeps a screen
          // reader from hearing the tournament twice. `no-referrer` so a
          // remote logo cannot be used to fingerprint who is watching.
          referrerPolicy="no-referrer"
          className="h-12 w-auto max-w-[12rem] shrink-0 object-contain"
        />
      ) : null}
      {title ? (
        <div
          data-testid="board-title"
          className="min-w-0 break-words text-3xl font-bold tracking-tight"
        >
          {title}
        </div>
      ) : null}
    </div>
  );
}

/** The optional full-width banner strip above the board content. */
export function BoardBanner({ bannerUrl }: { bannerUrl: string | null }) {
  if (!bannerUrl) return null;
  return (
    <img
      src={bannerUrl}
      alt=""
      data-testid="board-banner"
      referrerPolicy="no-referrer"
      className="h-20 w-full object-cover"
    />
  );
}

/** The secondary signage clock. Renders nothing without a usable timezone. */
export function BoardClock({
  now,
  timeZone,
}: {
  now: Date;
  timeZone: string | null | undefined;
}) {
  const label = boardClock(now, timeZone);
  if (!label) return null;
  return (
    <time
      data-testid="board-clock"
      dateTime={now.toISOString()}
      // Secondary to the courts: muted, and a step below the court numbers.
      className="tabular-nums text-3xl text-muted-foreground"
    >
      {label}
    </time>
  );
}
