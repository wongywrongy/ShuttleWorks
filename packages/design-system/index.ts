/**
 * @scheduler/design-system — barrel export.
 *
 * Components and icons land here in Phases 3 and 4. For now this file
 * exists to make the package importable in TS code; CSS + Tailwind preset
 * imports go via the package subpaths declared in package.json:
 *
 *   import '@scheduler/design-system/tokens.css';
 *   import '@scheduler/design-system/globals.css';
 *   const preset = require('@scheduler/design-system/tailwind-preset');
 */

export * from './icons';
// Phase 4 will add: export * from './components';

export const DESIGN_SYSTEM_VERSION = '0.1.0' as const;
