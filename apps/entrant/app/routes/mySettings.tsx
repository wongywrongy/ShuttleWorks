/**
 * `/e/me/settings` — the signed-in entrant's account settings (public
 * refinement 2026-09-12).
 *
 * The account's two rights — download my data, erase my details — used to
 * sit under a `#settings` anchor at the foot of My entries. They are a
 * different task from managing entries, so they have their own destination
 * now; the header's "Settings" link points here, and nothing about the
 * controls themselves changed: `my-entries.js` renders the same panel into
 * `#my-account-root`, behind the same verification gate and the same
 * two-step arm, against the same two endpoints.
 *
 * Same session posture as `myEntries.tsx`: the server observes only the
 * PRESENCE of the entrant cookie (`hasEntrantSession`) and never relays or
 * validates it. A signed-out reader gets the sign-in gate; only a request
 * carrying the cookie receives the module that performs the browser-side
 * credentialed read.
 */
import { Button } from '@scheduler/design-system/components';

import { PlayShell } from '../components/PlayShell';
import { hasEntrantSession } from '../lib/session.server';
import { ACTION_LINK, CARD, PAGE_TITLE } from '../lib/ui';
import type { Route } from './+types/mySettings';

export const meta: Route.MetaFunction = () => [{ title: 'Account settings' }];

export function loader({ request }: Route.LoaderArgs) {
  return { signedIn: hasEntrantSession(request) };
}

export default function MySettings({ loaderData }: Route.ComponentProps) {
  const signedIn = loaderData.signedIn;
  return (
    <PlayShell>
      <main className="mx-auto w-full max-w-3xl px-4 py-6 md:py-8">
        <h1 className={PAGE_TITLE}>Account settings</h1>
        {signedIn ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Your account and privacy controls. Erasing your details is not
              the same as withdrawing an entry, which you do from{' '}
              <a href="/e/me/entries" className={ACTION_LINK}>
                My entries
              </a>
              .
            </p>
            <div id="my-account-root" className="mt-6">
              <p className="text-muted-foreground">Loading your account details.</p>
            </div>
            <noscript>
              <p className="mt-2 text-sm text-muted-foreground">
                This page needs JavaScript to show your account controls.
              </p>
            </noscript>
            <script type="module" src="/e/assets/my-entries.js" />
          </>
        ) : (
          <section className={`mt-6 grid gap-3 ${CARD}`}>
            <p className="text-sm text-muted-foreground">
              Sign in to manage your account and privacy settings.
            </p>
            <Button asChild className="justify-self-start">
              <a href="/e/login?next=/e/me/settings">Sign in</a>
            </Button>
          </section>
        )}
      </main>
    </PlayShell>
  );
}
