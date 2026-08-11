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
 */
import type { ReactNode } from 'react';
import { Button } from '@scheduler/design-system/components';

const DISCOVERY_HREF = '/e/';

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
          <p>Every entry is confirmed by the organiser.</p>
        </div>
      </footer>
    </div>
  );
}
