/**
 * A whole page that says one thing — the not-found and the failed-render
 * states every route boundary needs, inside the shell every other page wears
 * (E1).
 *
 * Before this each boundary rendered a bare `<main><h1>`: default browser
 * typography at the top-left of an empty document, with no header, no footer
 * and no way back to the listing. That is the page a mistyped poster URL
 * lands on, and it read as broken rather than as informative. Four copies of
 * the same six lines became one component rather than four page chromes.
 *
 * **Fixed copy in, nothing else.** Everything this renders comes from its two
 * props and from `PlayShell`, which takes no route state either. That is what
 * keeps the uniform-404 intact: an unknown slug and a closed page hand it the
 * same two strings, so they render the same bytes — the property
 * `tournament.render.test.ts` compares document to document.
 */
import { Button } from '@scheduler/design-system/components';

import { PlayShell } from './PlayShell';
import { CARD } from '../lib/ui';

export function MessagePage({ heading, body }: { heading: string; body: string }) {
  return (
    <PlayShell>
      <main className="mx-auto grid w-full max-w-md gap-4 px-4 py-16 md:py-24">
        <div className={`grid justify-items-start gap-3 ${CARD}`}>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {heading}
          </h1>
          <p className="text-sm text-muted-foreground">{body}</p>
          {/* One action, and it is the listing: the whole complaint about
              this page was that it was a dead end. Same outline link-button
              the discovery empty state uses. */}
          <Button asChild variant="outline" size="sm">
            <a href="/e/">Browse tournaments</a>
          </Button>
        </div>
      </main>
    </PlayShell>
  );
}
