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
export const baseConfig = {
  // The automatic JSX runtime, matching tsconfig's `jsx: "react-jsx"`. The
  // request-level tests never need this (their modules load through the real
  // Vite pipeline, which sets it), but `tests/components.test.ts` imports
  // design-system components directly, and those don't import React —
  // esbuild's classic-transform default would leave `React is not defined`.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The first ssrLoadModule pays cold dependency-optimization cost — measured
    // at ~40s on a cold cache, ~2s warm. The default 5s timeout fails CI on the
    // first run only, which is the worst kind of flake.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Each test file that calls `createServer(...)` (health.test.ts,
    // design-system.test.ts) boots its own @react-router/dev Vite plugin
    // instance, and that plugin's typegen watcher unconditionally
    // `rm(recursive, force)`s + repopulates the SHARED `.react-router/types`
    // directory on start (see @react-router/dev/dist/vite.js `watch()`).
    // With vitest's default file-level parallelism, two such instances race
    // on that one directory — one process's rm/mkdir lands mid another's —
    // and the loser throws an unhandled `ENOTEMPTY` during teardown even
    // though every assertion passed. Serializing file execution removes the
    // race outright: only one Vite/typegen instance touches
    // .react-router/types at a time.
    fileParallelism: false,
  },
};

export default defineConfig(baseConfig);
