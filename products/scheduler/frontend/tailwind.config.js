/** @type {import('tailwindcss').Config} */
const preset = require('@scheduler/design-system/tailwind-preset');

export default {
  presets: [preset],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    // Scan the workspace design-system so class strings inside shared
    // components (e.g. Button's `bg-brand`/`text-brand-ink`) are
    // emitted. Without this, any class used ONLY inside a shared
    // component silently no-ops.
    '../../../packages/design-system/components/**/*.{ts,tsx}',
    '../../../packages/design-system/icons/**/*.{ts,tsx}',
  ],
};
