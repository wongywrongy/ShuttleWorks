/** @type {import('tailwindcss').Config} */
const preset = require('@scheduler/design-system/tailwind-preset');

export default {
  presets: [preset],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Tournament-only legacy aliases — many component files still reference
        // `bg-ink-50`, `text-ink-700`, etc. These map to canonical tokens so
        // the brand palette swap takes effect immediately on body/cards/pills
        // without touching every component. Phase 6 strips these and converts
        // call-sites to the canonical `bg-bg` / `text-ink` / etc.
        ink: {
          50:  'hsl(var(--bg))',
          100: 'hsl(var(--rule-soft))',
          200: 'hsl(var(--rule-soft))',
          300: 'hsl(var(--ink-faint))',
          400: 'hsl(var(--ink-faint))',
          500: 'hsl(var(--ink-muted))',
          600: 'hsl(var(--ink-muted))',
          700: 'hsl(var(--ink-muted))',
          800: 'hsl(var(--ink))',
          900: 'hsl(var(--ink))',
        },
      },
    },
  },
};
