/**
 * The public shell: wordmark · search · sign-in over the page, small print
 * under it. Promoted from the Phase B mockups (SP-P6-2) into the component
 * inventory; every colour, radius and type step is the design system's, in
 * the consumer register (sentence case, roomier rhythm).
 *
 * The search box is the brief's header search (Z3) — a plain GET form landing
 * on discovery's results, functional at every width: it takes the full row on
 * phones (`order-last w-full`) and sits inline from `sm:` up. The `#results`
 * fragment on the action lands the post-submit scroll at the results heading.
 *
 * The sign-in link is static: no server-rendered page on this tier can know
 * who is reading it (R8-D), so the header states an affordance, never an
 * identity — the owner's STOP-1 ruling defers every signed-in state to E2.
 * `signInLabel` is the one deliberate exception: a ROUTE (not a session
 * read) may still know its own outcome — see `login.tsx`'s `/signed-in`
 * variant — and hand this shell different label text for it.
 */
import type { ReactNode } from 'react';
import { Button } from '@scheduler/design-system/components';

const DISCOVERY_HREF = '/e/';

export function PlayShell({
  q = '',
  signInLabel = 'Sign in',
  children,
}: {
  q?: string;
  signInLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Console banner (2026-08-13): the public tier leads with the solid
          accent bar and the skewed white wordmark chip from the mock. Every
          functional element (search form, sign-in) is unchanged — only the
          ground moved. Text on the bar is full white (AA against the accent,
          verified by the token contrast gate's text-on-accent pair). */}
      <header className="bg-accent">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-2.5">
          <a href={DISCOVERY_HREF} className="inline-flex items-center gap-3">
            <span className="inline-block -skew-x-12 bg-card px-3 py-1.5 shadow-md">
              <span className="inline-block skew-x-12 font-display text-[15px] font-extrabold tracking-tight text-accent">
                ShuttleWorks
              </span>
            </span>
            <span className="text-xs font-bold uppercase tracking-[0.06em] text-accent-ink">
              Tournaments
            </span>
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
              // 2026-08-11 design audit, finding #5: the box is ~184px
              // usable after the "Search" button and its padding — the old
              // placeholder needed ~230px and clipped. The full sentence
              // stays on `aria-label`, which never visually renders.
              placeholder="Search tournaments"
              aria-label="Search tournaments or venues"
              className="h-9 w-full min-w-0 rounded border border-transparent bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <Button type="submit" variant="secondary" size="sm">
              Search
            </Button>
          </form>
          <a
            href="/e/login"
            // `min-h-6` (24px): the tap target floor (WCAG 2.5.8) — text-sm's
            // own line-height is 20px, under it with no padding of its own.
            className="ml-auto inline-flex min-h-6 items-center text-sm font-semibold text-accent-ink underline-offset-4 hover:underline sm:ml-0"
          >
            {signInLabel}
          </a>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-rule-soft">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-baseline justify-between gap-2 px-4 py-6 text-xs text-muted-foreground">
          <p>ShuttleWorks · tournament entries</p>
          <p>Every entry is confirmed by the organiser.</p>
        </div>
      </footer>
    </div>
  );
}
