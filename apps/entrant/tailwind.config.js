/** @type {import('tailwindcss').Config} */
const preset = require('@scheduler/design-system/tailwind-preset');

export default {
  presets: [preset],
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    // The page-scoped external scripts (SP-P7): the tier stays unhydrated,
    // so pages that need browser behaviour carry one plain ES module each
    // from public/assets/ — and the classes those scripts set exist only
    // if this scan sees them.
    './public/assets/*.js',
    // Scan the workspace design-system so class strings inside shared
    // components (e.g. Button's `bg-brand`/`text-brand-ink`) are
    // emitted. Without this, any class used ONLY inside a shared
    // component silently no-ops.
    '../../packages/design-system/components/**/*.{ts,tsx}',
    '../../packages/design-system/icons/**/*.{ts,tsx}',
  ],
};
