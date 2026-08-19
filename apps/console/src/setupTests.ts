/**
 * Vitest setup file — registers `fake-indexeddb` so the global
 * ``indexedDB`` API is available in the jsdom environment that
 * Vitest runs tests under. Step F's command-queue tests persist to
 * IndexedDB and need this shim; future Step G component tests will
 * import jest-dom matchers from here too.
 */
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// jsdom has no ResizeObserver; Headless UI's anchored Menu (floating-ui positioning)
// touches it on open. A no-op stub keeps those interactions from throwing.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
