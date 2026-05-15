/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/__tests__/**/*.{test,spec}.{ts,tsx}'],
    env: {
      // Pin to a UTC-negative zone so date-formatting tests catch
      // off-by-one bugs that would be masked under UTC.
      TZ: 'America/Los_Angeles',
    },
  },
});
