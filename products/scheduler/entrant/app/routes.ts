import { type RouteConfig, route } from '@react-router/dev/routes';

/**
 * Explicit route config, not file-system conventions. The entrant surface is
 * small and its URL shapes are load-bearing (spec §5: /{slug},
 * /{slug}/receipt/{submissionId}, /account/{signup,login,logout}) — they read
 * better declared in one place than encoded in filenames.
 */
export default [
  route('health', 'routes/health.tsx'),
  // The GET half of `/e/account/signup`. FastAPI owns the POST at the same
  // URL — that is the native-form pattern, and it is what F-E1-2-E1 was
  // missing: the route existed, the page did not. Static, so it ranks above
  // the `:slug` route below and a workspace can never be called "account".
  route('account/signup', 'routes/account.signup.tsx'),
  // The 303 target of POST /e/api/submit/{slug}: a GET, so a reload of the
  // success page re-reads instead of re-posting the entry.
  route(':slug/receipt/:submissionId', 'routes/receipt.tsx'),
  // Last, and dynamic: React Router ranks the static segment above it, so
  // /e/health stays the health route rather than a workspace called "health".
  route(':slug', 'routes/entry.tsx'),
] satisfies RouteConfig;
