import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// The browser-evidence tier was in no eslint project until D14 (2026-09-15):
// `lint:scheduler` and `lint:entrant` each lint their own app, and nothing
// covered tests/e2e, so a spec could reference an undeclared variable and only
// fail once a browser job actually ran it. This mirrors apps/entrant's config
// — the same recommended sets, the same downgrade philosophy — over a
// different runtime: Playwright specs and the node scripts around them run in
// node, never in a bundler, and `page.evaluate` bodies are the one place
// browser globals are legitimately in scope.
export default defineConfig([
  globalIgnores(['node_modules', 'playwright-report', 'test-results']),
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      // Node runs the specs; `page.evaluate(() => ...)` bodies are serialised
      // into the page, so browser globals are in lexical scope there too.
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // Same downgrade as the two app configs (CLAUDE.md lean-gate
      // philosophy): `any` stays visible as a warning rather than blocking a
      // gate on day one. Everything else is an error.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
])
