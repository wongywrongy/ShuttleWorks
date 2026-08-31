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
import { PlayShell } from '../components/PlayShell';
import { hasEntrantSession } from '../lib/session.server';
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
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          My entries
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every tournament you have entered, newest first. The organizer
          confirms each entry.
        </p>
        {signedIn ? (
          <>
            <div id="my-entries-root" className="mt-6 grid gap-6">
              <p className="text-muted-foreground">Loading your entries.</p>
            </div>
            <noscript>
              <p className="mt-2 text-sm text-muted-foreground">
                This page needs JavaScript to show your entries.
              </p>
            </noscript>
            <script type="module" src="/e/assets/my-entries.js" />
          </>
        ) : (
          <section className="mt-6 grid gap-3 rounded-lg border border-rule-soft bg-surface-raised p-5">
            <h2 className="font-display text-base font-bold tracking-tight text-foreground">
              Sign in to see your entries
            </h2>
            <p className="text-sm text-muted-foreground">
              Your tournament entries and their current status are available
              after you sign in.
            </p>
            <a
              className="inline-flex min-h-10 items-center justify-center justify-self-start rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent/90"
              href="/e/login?next=/e/me/entries"
            >
              Sign in
            </a>
          </section>
        )}
      </main>
    </PlayShell>
  );
}
