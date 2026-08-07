import { defineConfig } from 'vitest/config';

// Deliberately NOT the app's vite.config.ts: that one carries the React Router
// plugin, and the tests boot their own middleware-mode Vite server so a request
// goes through the real plugin pipeline (see tests/health.test.ts).
//
// `environment: 'node'` per spec §8 — these are request-level integration tests
// (request in, response out, no internal mocking), mirroring the backend's
// pytest + TestClient shape. There is no DOM to emulate on the server tier.
//
// vitest itself is resolved from the ROOT node_modules (CLAUDE.md hazard: it
// must stay hoisted there); it is intentionally absent from this package.json.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The first ssrLoadModule pays cold dependency-optimization cost — measured
    // at ~40s on a cold cache, ~2s warm. The default 5s timeout fails CI on the
    // first run only, which is the worst kind of flake.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
