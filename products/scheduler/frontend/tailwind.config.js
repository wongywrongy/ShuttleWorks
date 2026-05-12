/** @type {import('tailwindcss').Config} */
const preset = require('@scheduler/design-system/tailwind-preset');

export default {
  presets: [preset],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
};
