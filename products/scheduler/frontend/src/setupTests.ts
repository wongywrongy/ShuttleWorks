/**
 * Vitest setup file — registers `fake-indexeddb` so the global
 * ``indexedDB`` API is available in the jsdom environment that
 * Vitest runs tests under. Step F's command-queue tests persist to
 * IndexedDB and need this shim; future Step G component tests will
 * import jest-dom matchers from here too.
 */
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
