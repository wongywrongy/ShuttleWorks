import { type RouteConfig, route } from '@react-router/dev/routes';

/**
 * Explicit route config, not file-system conventions. The entrant surface is
 * small and its URL shapes are load-bearing (spec §5: /{slug},
 * /{slug}/receipt/{submissionId}, /account/{signup,login,logout}) — they read
 * better declared in one place than encoded in filenames.
 */
export default [
  route('health', 'routes/health.tsx'),
  // The signup PAGE. Deliberately NOT at `/e/account/signup`, which is the
  // FastAPI-owned POST: ruling R8-A gives all of `/e/account/` to the backend
  // by prefix, and nginx does not split one path by method. A node GET there
  // would be a 405 in any real deployment. So the page lives on a node-owned
  // path and its form posts to the backend's URL, unchanged. The overlap is
  // enforced, not just documented — `tests/routeConfig.test.ts`.
  // Static, so it ranks above the `:slug` route below and a workspace can
  // never be called "signup".
  route('signup', 'routes/signup.tsx'),
  // The login PAGE, node-owned for exactly the reason above: `/e/account/login`
  // is FastAPI's POST and a node GET there is a 405 in production and fine in
  // dev, which is the worst pair. Static, so it ranks above `:slug`.
  route('login', 'routes/login.tsx'),
  // The 303 target of POST /e/api/submit/{slug}: a GET, so a reload of the
  // success page re-reads instead of re-posting the entry.
  route(':slug/receipt/:submissionId', 'routes/receipt.tsx'),
  // Last, and dynamic: React Router ranks the static segment above it, so
  // /e/health stays the health route rather than a workspace called "health".
  route(':slug', 'routes/entry.tsx'),
] satisfies RouteConfig;
