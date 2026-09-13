/**
 * `/e/me/entries` — the signed-in entrant's home (SP-P7 §3.1).
 *
 * The first authenticated page on this tier. The server observes only the
 * presence of the entrant session cookie — it never relays or validates the
 * credential — and uses that boolean to avoid making a private API request
 * for a signed-out visitor. A signed-out reader gets a normal sign-in link;
 * only a request carrying the entrant cookie receives the external module
 * that performs the browser-side credentialed read.
 *
 * The loader returns only the cookie-presence boolean. It cannot relay a
 * credential because `hasEntrantSession` returns a boolean and does not read
 * the cookie value. The private data remains browser → nginx → FastAPI.
 */
import { Button } from '@scheduler/design-system/components';

import { PlayShell } from '../components/PlayShell';
import { hasEntrantSession } from '../lib/session.server';
import { CARD, PAGE_TITLE } from '../lib/ui';
import type { Route } from './+types/myEntries';

export const meta: Route.MetaFunction = () => [{ title: 'My entries' }];

export function loader({ request }: Route.LoaderArgs) {
  return { signedIn: hasEntrantSession(request) };
}

export default function MyEntries({ loaderData }: Route.ComponentProps) {
  const signedIn = loaderData.signedIn;
  return (
    <PlayShell>
      <main className="mx-auto w-full max-w-3xl px-4 py-6 md:py-8">
        <h1 className={PAGE_TITLE}>
          My entries
        </h1>
        {signedIn ? (
          <>
            {/* V3-PE38.1: the sorting/organizer-confirmation explanation
                belongs beside the actual list, not repeated ahead of a gate
                that might not even show one. */}
            <p className="mt-1 text-sm text-muted-foreground">
              Every tournament you have entered, grouped into active and past.
              The organizer confirms each entry.
            </p>
            <div id="my-entries-root" className="mt-6 grid gap-6">
              <p className="text-muted-foreground">Loading your entries.</p>
            </div>
            <noscript>
              <p className="mt-2 text-sm text-muted-foreground">
                This page needs JavaScript to show your entries.
              </p>
            </noscript>
            {/* Refinement 2026-09-12: the account's privacy controls moved to
                their own page. One quiet link here keeps them one click away
                for a reader who came looking for them at the old anchor. */}
            <p className="mt-8 border-t border-rule-soft pt-4 text-sm text-muted-foreground">
              Account and privacy controls are in{' '}
              <a href="/e/me/settings" className="font-medium text-accent underline-offset-4 hover:underline">
                Account settings
              </a>
              .
            </p>
            <script type="module" src="/e/assets/my-entries.js" />
          </>
        ) : (
          // V3-PE38.1: the gate states the requirement once and shows one
          // primary action — no repeated "available after sign in" and no
          // separate card heading duplicating the page title.
          <section className={`mt-6 grid gap-3 ${CARD}`}>
            <p className="text-sm text-muted-foreground">
              Sign in to view and manage your tournament entries.
            </p>
            <Button asChild className="justify-self-start">
              <a href="/e/login?next=/e/me/entries">Sign in</a>
            </Button>
          </section>
        )}
      </main>
    </PlayShell>
  );
}
