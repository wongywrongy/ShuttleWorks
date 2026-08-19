// Side-effect imports for @fontsource-variable packages register
// @font-face rules globally; they don't expose any runtime API. These
// stubs let TypeScript accept the imports without inventing types we
// don't use. Keep these in sync with the imports in src/main.tsx.
declare module '@fontsource-variable/geist';
declare module '@fontsource-variable/jetbrains-mono';
