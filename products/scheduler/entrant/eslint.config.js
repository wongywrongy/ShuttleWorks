import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['build', '.react-router']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      // Both, deliberately: route modules render on the server AND hydrate in
      // the browser, and *.server.ts modules are node-only.
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Same downgrades as the frontend config, for the same reason (CLAUDE.md
      // lean-gate philosophy): the react-hooks v7 react-compiler rules and
      // no-explicit-any stay visible as warnings so the gate is green day one.
      // react-hooks/rules-of-hooks and everything else remain errors.
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
])
