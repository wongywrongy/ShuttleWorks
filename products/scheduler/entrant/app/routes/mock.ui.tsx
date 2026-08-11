/**
 * SP-P6-2 Phase B — shared presentational pieces for the three mock pages.
 *
 * **Mockup module. Deleted at Phase C**, when the approved layouts decompose
 * into the real component inventory under `app/components/` (brief Phase C —
 * that is also the commit that teaches `sourceGuards.sourceNames` the new
 * directory). Living in `app/routes/` keeps every line under the existing
 * structural guards in the meantime, the same argument as `entry.form.tsx`.
 *
 * Everything here is props → markup: no hooks, no handlers, no client JS.
 * The consumer register is deliberate — sentence case, pill chips, roomier
 * rhythm — while every colour, radius and type step is the design system's.
 */
import type { ReactNode } from 'react';
import { Button } from '@scheduler/design-system/components';

import { chipLabel, parseIsoDate, parseMoment, type ChipState } from '../lib/phase';

const MONTHS = Object.freeze([
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]);
const MONTHS_LONG = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]);
const WEEKDAYS = Object.freeze([
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]);

/** `2026-09-19` → `Saturday 19 September 2026`; unparseable → `''`. */
export function formatDateLong(iso: string | null): string {
  const date = parseIsoDate(iso);
  if (date === null) return '';
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS_LONG[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** `2026-08-14 23:59 UTC` → `14 Aug 2026, 23:59 UTC`; unparseable → verbatim. */
export function formatMoment(wire: string): string {
  const moment = parseMoment(wire);
  if (moment === null) return wire;
  const hh = String(moment.getUTCHours()).padStart(2, '0');
  const mm = String(moment.getUTCMinutes()).padStart(2, '0');
  return `${moment.getUTCDate()} ${MONTHS[moment.getUTCMonth()]} ${moment.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

/**
 * The two-state status chip (owner ruling on STOP-4): `Entries open
 * [— closes in Nd]` on the live ramp, `Entries closed` on the done ramp.
 * Sentence case and a full pill — the consumer register of `StatusPill`'s
 * token mapping, not the operator's uppercase micro-label. The dot is
 * decoration and hidden from AT; the text carries the whole meaning.
 */
export function StatusChip({ state }: { state: ChipState }) {
  const open = state.kind === 'entriesOpen';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${
        open
          ? 'border-status-live/40 bg-status-live-bg text-status-live'
          : 'border-status-done/40 bg-status-done-bg text-status-done'
      }`}
    >
      {open ? (
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-status-live" />
      ) : null}
      {chipLabel(state)}
    </span>
  );
}

/**
 * The card's month/day block. Parses the ISO date convention only; a null or
 * unparseable date renders the same box saying "TBC" — a tournament that has
 * not set a date has not set one, and the box must not invent it.
 */
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
            {MONTHS[parsed.getUTCMonth()]}
          </span>
          <span className="text-lg font-semibold tabular-nums text-foreground">
            {parsed.getUTCDate()}
          </span>
        </span>
      )}
    </span>
  );
}

/** One Overview card: a heading and its content on the raised surface. */
export function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-rule-soft bg-surface-raised p-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {title}
      </h3>
      <div className="mt-3 grid gap-2 text-sm text-foreground">{children}</div>
    </section>
  );
}

const DISCOVERY_HREF = '/e/mock.discovery';

/**
 * The public shell: wordmark · search · sign-in over the page, small print
 * under it. The search box is the brief's header search (Z3) — a plain GET
 * form landing on discovery's results, functional at every width: it takes
 * the full row on phones (`order-last w-full`) and sits inline from `sm:` up.
 */
export function PlayShell({ q = '', children }: { q?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-rule-soft bg-surface-base">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
          <a
            href={DISCOVERY_HREF}
            className="font-display text-lg font-semibold tracking-tight text-foreground"
          >
            ShuttleWorks
            <span className="ml-2 text-sm font-normal text-muted-foreground">Tournaments</span>
          </a>
          <form
            role="search"
            method="get"
            action={`${DISCOVERY_HREF}#results`}
            className="order-last flex w-full min-w-0 items-center gap-2 sm:order-none sm:ml-auto sm:w-72"
          >
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search tournaments or venues"
              aria-label="Search tournaments or venues"
              className="h-9 w-full min-w-0 rounded border border-rule-control bg-bg-elev px-3 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <Button type="submit" variant="outline" size="sm">
              Search
            </Button>
          </form>
          <a
            href="/e/login"
            className="ml-auto text-sm font-medium text-accent underline-offset-4 hover:underline sm:ml-0"
          >
            Sign in
          </a>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-rule-soft">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-baseline justify-between gap-2 px-4 py-6 text-xs text-muted-foreground">
          <p>ShuttleWorks · tournament entries</p>
          <p>Phase B mockup — seeded sample data, nothing live.</p>
        </div>
      </footer>
    </div>
  );
}
