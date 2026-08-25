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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      // dto.generated.ts is excluded because it is types-only - it emits no
      // runtime code, so it can only ever report 0%. It is NOT unpoliced:
      // src/api/__tests__/dtoParity.test.ts parses it as the parity oracle
      // (R-DM-9a). Re-justified 2026-08-24, SP-DM-3 P0.
      exclude: ['src/**/__tests__/**', 'src/api/dto.generated.ts', 'src/**/*.d.ts', 'src/main.tsx'],
    },
  },
});
