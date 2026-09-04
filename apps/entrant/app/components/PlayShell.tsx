/**
 * The public shell: wordmark · sign-in over the page, small print under it.
 * Promoted from the Phase B mockups (SP-P6-2) into the component inventory;
 * every colour, radius and type step is the design system's, in the consumer
 * register (sentence case, roomier rhythm).
 *
 * **No header search (SP-P8 §4).** The Z3 header search lived here — a GET
 * form landing on `/e/#results` — which put a search box on all ~16 pages of
 * the tier to serve exactly one of them. The season calendar now carries its
 * own search (`SeasonControls`), and that one keeps the rest of the filter
 * state with it, which the header form silently dropped. Two boxes over the
 * same list, one of them lossy, was the defect; the `#results` anchor went
 * with the form (the calendar's anchor is `#calendar`).
 *
 * **Session states (SP-P7 §3.8).** The header renders exactly two shapes:
 * signed out it offers `Sign in`, signed in it offers `My entries`. Never
 * both. Before this it showed both to everyone — a nav item pointing at an
 * authed page is a state leak, and for a stranger it just bounced to sign-in,
 * which reads as broken.
 *
 * The flag arrives through `EntrantSessionContext`, which root publishes, so
 * there is one read site (root) and one render site (here); the ~16 route
 * files that render this shell pass nothing and know nothing about sessions.
 * It is a boolean derived from cookie PRESENCE, never an identity —
 * `lib/session.server.ts` argues why that is not the credential relay R8-D
 * forbids, and why the name and initials avatar the mockup shows are deferred
 * rather than guessed.
 *
 * With no provider above it the context yields `false`, so an unmatched URL
 * (root's `ErrorBoundary` renders instead of `Root`) and a bare unit render
 * both get the signed-out shape. That default is argued in `sessionContext.ts`:
 * offering a stranger a way in beats offering them a link that 401s.
 *
 * `useContext` is not a hydration dependency: it resolves during the server
 * render. This tier still ships no `<Scripts/>` and nothing here needs a
 * browser.
 *
 * `signInLabel` is the older, narrower exception: a ROUTE (not a session read)
 * may know its own outcome — see `login.tsx`'s `/signed-in` variant — and hand
 * this shell different label text for it.
 */
import { useContext, type ReactNode } from 'react';
import { BRAND } from '@scheduler/brand';

import { EntrantSessionContext } from '../lib/sessionContext';

const DISCOVERY_HREF = '/e/';

export function PlayShell({
  signInLabel = 'Sign in',
  children,
}: {
  signInLabel?: string;
  children: ReactNode;
}) {
  const signedIn = useContext(EntrantSessionContext);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-20 focus:rounded focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-foreground focus:shadow-md">
        Skip to content
      </a>
      {/* Console banner (2026-08-13): the public tier leads with the solid
          accent bar and the skewed white wordmark chip from the mock. Text on
          the bar is full white (AA against the accent, verified by the token
          contrast gate's text-on-accent pair). */}
      <header className="bg-accent">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:py-2.5">
          <a href={DISCOVERY_HREF} className="inline-flex min-h-8 items-center gap-3" aria-label={`${BRAND.publicProductName} home`}>
            <span className="inline-block -skew-x-12 bg-card px-3 py-1.5 shadow-md">
              <span className="inline-block skew-x-12 font-display text-[15px] font-extrabold tracking-tight text-accent">
                {BRAND.productName}
              </span>
            </span>
            <span className="text-xs font-bold uppercase tracking-[0.06em] text-accent-ink">
              Tournaments
            </span>
          </a>
          {/* Exactly one of these renders (§3.8). `ml-auto` sits on whichever
              one it is, so the single link right-aligns in both states the way
              the pair used to. `min-h-6` (24px) is the tap-target floor
              (WCAG 2.5.8) — text-sm's own line-height is 20px, under it with
              no padding of its own. */}
          <a
            href={signedIn ? '/e/me/entries' : '/e/login'}
            className="ml-auto inline-flex min-h-8 items-center rounded px-2 text-sm font-semibold text-accent-ink underline-offset-4 hover:bg-accent-ink/10 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            {signedIn ? 'My entries' : signInLabel}
          </a>
        </div>
      </header>
      <div id="main-content" className="flex-1">{children}</div>
      <footer className="border-t border-rule-soft">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-baseline justify-between gap-2 px-4 py-6 text-xs text-muted-foreground">
          <p>{BRAND.productName} · tournament entries · {BRAND.endorsement}</p>
          <p>Tournament information is published by the organizer.</p>
        </div>
      </footer>
    </div>
  );
}
