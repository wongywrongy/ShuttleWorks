/**
 * Carries root's one session bit down to the header (SP-P7 §3.8).
 *
 * `PlayShell` is rendered by ~16 route modules, none of which has anything to
 * say about sessions, so threading a prop through all of them would spread a
 * concern across the tier to serve one link. Root reads the bit once (see
 * `lib/session.server.ts`) and publishes it here; the shell consumes it.
 *
 * A context rather than `useRouteLoaderData('root')`, which was the first
 * shape and is the reason this file exists: that hook throws outright when no
 * data router is above it (`invariant` in `useDataRouterState`), so it made
 * `PlayShell` impossible to render in isolation and took `components.test.ts`
 * down with it. `useContext` cannot throw — absent a provider it yields the
 * default below.
 *
 * The default is therefore load-bearing, not filler. `false` means "signed
 * out", which is the honest answer whenever the bit is unknown:
 *
 * - root's `ErrorBoundary` renders INSTEAD of `Root`, so an unmatched URL has
 *   no provider at all;
 * - a unit test rendering the shell on its own has none either.
 *
 * Both cases render `Sign in`, which offers a stranger a way in and shows a
 * signed-in visitor one redundant link. The opposite default would show
 * strangers a `My entries` link that 401s — the §3.8 state leak this whole
 * slice removes.
 */
import { createContext } from 'react';

/** True when the request carried an entrant session cookie. */
export const EntrantSessionContext = createContext(false);
