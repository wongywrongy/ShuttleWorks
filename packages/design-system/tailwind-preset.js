/**
 * @scheduler/design-system — Tailwind preset.
 *
 * Implements design/BRAND.md as a Tailwind theme extension. Both
 * products (`products/scheduler/frontend`, `products/tournament/frontend`)
 * consume this preset; they own only their `content` globs and any
 * product-specific extensions.
 *
 * Strict rules baked in:
 *   - darkMode via `.dark` class (BRAND.md §0 — same toggle both products)
 *   - 90° corners default (BRAND.md §3); 2px on interactive controls only
 *   - Spacing locked to ladder --space-0..--space-10
 *   - Type tied to canonical --text-* + --font-display/sans/mono
 *   - All colors via HSL CSS vars from tokens.css; no raw hex anywhere
 *
 * Animations + keyframes lifted from scheduler so both products share the
 * same solver-theater + phase motion vocabulary.
 */

const plugin = require('tailwindcss/plugin');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)'],
        sans:    ['var(--font-sans)'],
        mono:    ['var(--font-mono)'],
      },

      fontSize: {
        '2xs':  ['var(--text-2xs)',  { lineHeight: '1rem',   letterSpacing: '0.02em' }],
        xs:     ['var(--text-xs)',   { lineHeight: '1rem' }],
        sm:     ['var(--text-sm)',   { lineHeight: '1.25rem' }],
        base:   ['var(--text-base)', { lineHeight: '1.5rem' }],
        lg:     ['var(--text-lg)',   { lineHeight: '1.75rem' }],
        '2xl':  ['var(--text-2xl)',  { lineHeight: '2rem' }],
      },

      colors: {
        // -------- Canonical BRAND.md tokens --------
        bg:         'hsl(var(--bg))',
        'bg-elev':  'hsl(var(--bg-elev))',
        ink: {
          DEFAULT: 'hsl(var(--ink))',
          muted:   'hsl(var(--ink-muted))',
          faint:   'hsl(var(--ink-faint))',
        },
        rule: {
          DEFAULT: 'hsl(var(--rule))',
          soft:    'hsl(var(--rule-soft))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          bg:      'hsl(var(--accent-bg))',
          ink:     'hsl(var(--accent-ink))',
        },

        // -------- Legacy scheduler aliases (Phase 6 strips) --------
        border: 'hsl(var(--border))',
        input:  'hsl(var(--input))',
        ring:   'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },

        // -------- Status palette --------
        // bg-status-live / text-status-live / border-status-live + -bg variant
        status: {
          live:         'hsl(var(--status-live))',
          'live-bg':    'hsl(var(--status-live-bg))',
          called:       'hsl(var(--status-called))',
          'called-bg':  'hsl(var(--status-called-bg))',
          started:      'hsl(var(--status-started))',
          'started-bg': 'hsl(var(--status-started-bg))',
          blocked:      'hsl(var(--status-blocked))',
          'blocked-bg': 'hsl(var(--status-blocked-bg))',
          warning:      'hsl(var(--status-warning))',
          'warning-bg': 'hsl(var(--status-warning-bg))',
          idle:         'hsl(var(--status-idle))',
          'idle-bg':    'hsl(var(--status-idle-bg))',
          done:         'hsl(var(--status-done))',
          'done-bg':    'hsl(var(--status-done-bg))',
        },
      },

      // -------- Spacing scale (BRAND.md §4) --------
      // Tailwind defaults remain available; these add canonical brand names.
      spacing: {
        // Brand-named scale (preferred in new code)
        'b-0':  'var(--space-0)',
        'b-1':  'var(--space-1)',   // 2px
        'b-2':  'var(--space-2)',   // 4px
        'b-3':  'var(--space-3)',   // 8px
        'b-4':  'var(--space-4)',   // 12px
        'b-5':  'var(--space-5)',   // 16px
        'b-6':  'var(--space-6)',   // 24px
        'b-7':  'var(--space-7)',   // 32px
        'b-8':  'var(--space-8)',   // 48px
        'b-9':  'var(--space-9)',   // 64px
        'b-10': 'var(--space-10)',  // 96px
        // Density-aware (inherited from scheduler — preferred in tables)
        cell:     'var(--density-cell-px)',
        'cell-y': 'var(--density-cell-py)',
        section:  'var(--density-section-gap)',
        gap:      'var(--density-gap)',
      },

      height: {
        row:   'var(--density-row-h)',
        badge: 'var(--density-badge-h)',
      },
      minHeight: { row: 'var(--density-row-h)' },
      padding: {
        cell: 'var(--density-cell-py) var(--density-cell-px)',
      },

      // -------- Radii (BRAND.md §3 — 90° default) --------
      borderRadius: {
        none: '0',
        DEFAULT: 'var(--radius)',         // 0
        sm: 'var(--radius-sm)',           // 2px — interactive controls only
        md: 'var(--radius-md)',           // 0
        lg: 'var(--radius-lg)',           // 0
        // Full removed (was rounded-full) — replace with rounded-none in code
      },

      // -------- Brand easing --------
      transitionTimingFunction: {
        brand: 'var(--ease-brand)',
      },

      // -------- Z-index scale --------
      zIndex: {
        hud:     'var(--z-hud)',
        chrome:  'var(--z-chrome)',
        popover: 'var(--z-popover)',
        overlay: 'var(--z-overlay)',
        modal:   'var(--z-modal)',
      },

      // -------- Animation library (lifted from scheduler) --------
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
        'phase-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 var(--phase-ring, hsl(var(--accent) / 0.45))' },
          '50%':      { boxShadow: '0 0 0 8px rgba(0,0,0,0)' },
        },
        'scan-sweep': {
          '0%':   { transform: 'translateX(-40%)' },
          '100%': { transform: 'translateX(140%)' },
        },
        'block-in': {
          '0%':   { opacity: '0', transform: 'translateY(8px) scale(0.94)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'marching-ants': {
          '0%':   { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '14px 0' },
        },
        'obj-flash': {
          '0%':   { color: 'currentColor', textShadow: 'none' },
          '40%':  { color: 'hsl(var(--status-live))', textShadow: '0 0 16px hsl(var(--status-live) / 0.55)' },
          '100%': { color: 'currentColor', textShadow: 'none' },
        },
        'drop-ok': {
          '0%':   { backgroundColor: 'hsl(var(--status-live) / 0.35)' },
          '100%': { backgroundColor: 'hsl(var(--status-live) / 0)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%':      { transform: 'translateX(-4px)' },
          '40%':      { transform: 'translateX(4px)' },
          '60%':      { transform: 'translateX(-3px)' },
          '80%':      { transform: 'translateX(3px)' },
        },
        'cell-pulse': {
          '0%, 100%': { opacity: '0.55' },
          '50%':      { opacity: '1' },
        },
        sheen: {
          '0%':   { transform: 'translateX(-120%) skewX(-20deg)' },
          '100%': { transform: 'translateX(220%) skewX(-20deg)' },
        },
        'solution-tick': {
          '0%':   { transform: 'scale(1)' },
          '40%':  { transform: 'scale(1.25)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
        'phase-glow':     'phase-glow 2.2s ease-in-out infinite',
        'scan-sweep':     'scan-sweep 1.6s linear infinite',
        'block-in':       'block-in 0.45s var(--ease-brand) backwards',
        'marching-ants':  'marching-ants 0.6s linear infinite',
        'obj-flash':      'obj-flash 0.9s ease-out',
        'drop-ok':        'drop-ok 0.9s ease-out',
        shake:            'shake 0.35s ease-in-out',
        'cell-pulse':     'cell-pulse 1.4s ease-in-out infinite',
        sheen:            'sheen 1.1s ease-out',
        'solution-tick':  'solution-tick 0.35s ease-out',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    plugin(({ addVariant }) => {
      addVariant('compact',     '[data-density="compact"] &');
      addVariant('comfortable', '[data-density="comfortable"] &, :root:not([data-density]) &');
    }),
  ],
};
