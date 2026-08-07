import type { Config } from '@react-router/dev/config';

/**
 * The entrant tier is served under one public hostname at the `/e/` prefix
 * (spec §2, ruling R8-A). nginx does longest-prefix routing, so `/e/api/` and
 * `/e/account/` reach FastAPI and everything else under `/e/` falls through to
 * this node process. Declaring the basename here means every URL this app
 * generates already carries the prefix — links do not have to remember it.
 */
export default {
  ssr: true,
  appDirectory: 'app',
  basename: '/e/',
} satisfies Config;
