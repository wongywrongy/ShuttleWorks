/**
 * `/e/me/entries` — the signed-in entrant's home (SP-P7 §3.1).
 *
 * The first authenticated page on this tier, and the server's half is
 * deliberately empty: node cannot know who is reading (R8-D), so the
 * document is an anonymous shell and the browser does the credentialed
 * read via the page's one external script (`/e/assets/my-entries.js` —
 * `script-src 'self'` permits it; the root's no-inline-JS posture is
 * untouched). A signed-out reader is redirected to sign-in with a
 * return-to by that script, because only the browser can know.
 *
 * No loader at all: there is nothing server-side to load, and a route
 * without a loader cannot relay anything (the structural guards still
 * enumerate this file — it just has nothing for them to find).
 */
import { PlayShell } from '../components/PlayShell';
import type { Route } from './+types/myEntries';

export const meta: Route.MetaFunction = () => [{ title: 'My entries' }];

export default function MyEntries() {
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
        <div id="my-entries-root" className="mt-6 grid gap-6">
          <p className="text-muted-foreground">Loading your entries.</p>
        </div>
        <noscript>
          <p className="mt-2 text-sm text-muted-foreground">
            This page needs JavaScript to show your entries.
          </p>
        </noscript>
        <script type="module" src="/e/assets/my-entries.js" />
      </main>
    </PlayShell>
  );
}
