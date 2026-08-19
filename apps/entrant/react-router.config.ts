import type { Config } from '@react-router/dev/config';

/**
 * The entrant tier is served under one public hostname at the `/e/` prefix
 * (spec §2, ruling R8-A). nginx does longest-prefix routing, so `/e/api/` and
 * `/e/account/` reach FastAPI and everything else under `/e/` falls through to
 * this node process. Declaring the basename here means every URL this app
 * generates already carries the prefix — links do not have to remember it.
 *
 * The split is by prefix and cannot be by method: nginx will not hand GET of a
 * path to node and POST of the same path to FastAPI. So no route in
 * `app/routes.ts` may sit inside `/e/api/` or `/e/account/`, however tempting
 * a shared URL looks — `tests/routeConfig.test.ts` enforces it, because the
 * failure mode (405 in production, fine in dev) is otherwise invisible here.
 */
export default {
  ssr: true,
  appDirectory: 'app',
  basename: '/e/',
} satisfies Config;
