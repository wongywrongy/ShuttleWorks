import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // Emit asset URLs under `/e/`, the same prefix `react-router.config.ts`
  // mounts the app on. Two tiers publish onto ONE origin here, and with the
  // default `base: '/'` both emitted `/assets/<hash>` — the operator SPA's
  // asset directory answered first and 404'd every entrant asset, which nginx
  // had to paper over with a `try_files` fallback into the node upstream.
  //
  // `@react-router/dev` takes `publicPath` straight from this value, and
  // `@react-router/serve` mounts its static dirs at `publicPath` and
  // `posix.join(publicPath, 'assets')` — so this one line moves BOTH the URLs
  // in the rendered HTML and the server that answers them, and `location /e/`
  // already routes them. Keep it equal to (or a prefix of) the basename:
  // `@react-router/dev` hard-fails the dev server when the basename does not
  // start with `base`.
  base: '/e/',
  // Dev-only mirror of nginx's prefix split (`frontend/nginx.conf`):
  // `/e/api/` and `/e/account/` belong to FastAPI, and the browser talks to
  // them DIRECTLY (form posts, the My Entries fetch) — in production via
  // nginx, in dev via this proxy. Without it, every browser-side call on
  // the dev origin 404s into the node router and the tier looks broken in
  // exactly the ways production would not be. `VITE_API_PROXY_TARGET`
  // overrides for a non-default backend port (the operator app's idiom).
  server: {
    proxy: {
      '/e/api': process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8600',
      '/e/account': process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8600',
    },
  },
  plugins: [reactRouter()],
  // The design system is published as raw .tsx source (its package.json
  // exports map points at ./components/index.ts), so the SSR bundler has to
  // transpile it rather than hand a bare import to Node. Spec §5.
  ssr: {
    noExternal: ['@scheduler/design-system'],
  },
});
