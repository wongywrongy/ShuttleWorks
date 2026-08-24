/**
 * @scheduler/design-system — Tailwind preset.
 *
 * Implements BRAND.md (this directory) as a Tailwind theme extension. Both
 * products (`apps/console`, `products/tournament/frontend`)
 * consume this preset; they own only their `content` globs and any
 * product-specific extensions.
 *
 * Strict rules baked in:
 *   - darkMode via `.dark` class (same toggle both products)
 *   - Warmed radii (--radius-xs..-xl); rounded-full stays for dots
 *   - Spacing locked to ladder --space-0..--space-10
 *   - Type tied to canonical --text-* + --font-display/sans/mono (one family: Geist)
 *   - All colors via HSL CSS vars from tokens.css; no raw hex anywhere
 *   - Signature azure glow via shadow-glow / shadow-glow-lg
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
        '3xs':  ['var(--text-3xs)',  { lineHeight: '0.875rem', letterSpacing: '0.02em' }],
        '2xs':  ['var(--text-2xs)',  { lineHeight: '1rem',   letterSpacing: '0.02em' }],
        xs:     ['var(--text-xs)',   { lineHeight: '1rem' }],
        '2sm':  ['var(--text-2sm)',  { lineHeight: '1.25rem' }],
        sm:     ['var(--text-sm)',   { lineHeight: '1.25rem' }],
        base:   ['var(--text-base)', { lineHeight: '1.5rem' }],
        lg:     ['var(--text-lg)',   { lineHeight: '1.75rem' }],
        '2xl':  ['var(--text-2xl)',  { lineHeight: '2rem' }],
      },

      colors: {
        // -------- Canonical tokens --------
        bg:         'hsl(var(--bg))',
        'bg-elev':  'hsl(var(--bg-elev))',
        ink: {
          DEFAULT: 'hsl(var(--ink))',
          2:       'hsl(var(--ink-2))',      // body
          3:       'hsl(var(--ink-3))',      // secondary label
          muted:   'hsl(var(--ink-muted))',
          faint:   'hsl(var(--ink-faint))',
        },
        rule: {
          DEFAULT: 'hsl(var(--rule))',
          soft:    'hsl(var(--rule-soft))',
          control: 'hsl(var(--border-control))',
          strong:  'hsl(var(--border-strong))',
        },
        // Module identity: border-module-meet / bg-module-bracket / text-module-ops …
        module: {
          meet:    'hsl(var(--module-meet))',
          bracket: 'hsl(var(--module-bracket))',
          ops:     'hsl(var(--module-ops))',
          display: 'hsl(var(--module-display))',
        },
        // -------- Legacy scheduler aliases (still used by many components) --------
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
        /* `accent` is now the canonical BRAND emphasis (Signal Orange)
         * per BRAND.md §1. Phase 6 stripped the legacy surface-hover
         * gray meaning — those call-sites moved to `bg-muted/40` /
         * `text-foreground`. The `--accent-bg` / `--accent-ink` tokens
         * remain for tinted callouts and text-on-accent fill. */
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          bg:      'hsl(var(--accent-bg))',
          ink:     'hsl(var(--accent-ink))',
          // Kept as alias for any holdouts (e.g., text-accent-foreground
          // not yet renamed). Same value as `accent-ink`.
          foreground: 'hsl(var(--accent-ink))',
        },
        /* `brand` is an alias of `accent` so the Button variant="brand"
         * (BRAND.md §1 Signal Orange) actually paints — previously the
         * variant referenced `bg-brand` / `text-brand-ink` Tailwind names
         * that were never wired here, so the class was a no-op. */
        brand: {
          DEFAULT: 'hsl(var(--accent))',
          ink:     'hsl(var(--accent-ink))',
        },

        // -------- Semantic layer (2026-07 refactor — preferred in new code) --------
        // Components consume ONLY these (or the canonical aliases above);
        // primitives (--gray-*, --blue-* …) never appear in component code.
        surface: {
          sunken:  'hsl(var(--surface-sunken))',
          base:    'hsl(var(--surface-base))',
          raised:  'hsl(var(--surface-raised))',
          overlay: 'hsl(var(--surface-overlay))',
          // pre-refactor shell names (aliases of the ladder)
          rail:   'hsl(var(--surface-rail))',
          screen: 'hsl(var(--surface-screen))',
          band:   'hsl(var(--surface-band))',
          active: 'hsl(var(--surface-active))',
          chip:   'hsl(var(--chip-tag))',
          card:   'hsl(var(--bg-elev))',
          // Phase 0a interaction washes — visible on every step, both themes.
          hover:           'hsl(var(--surface-hover))',
          'selected-wash': 'hsl(var(--surface-selected-wash))',
          // Fixed dark band (entrant NOW strip) + its own ink ramp — the two
          // text names live here, not under `text`, so the band's ground and
          // its ink stay one vocabulary: bg-surface-inverse /
          // text-surface-inverse-ink / text-surface-inverse-muted.
          inverse:         'hsl(var(--surface-inverse))',
          'inverse-ink':   'hsl(var(--surface-inverse-ink))',
          'inverse-muted': 'hsl(var(--surface-inverse-muted))',
        },
        text: {
          primary:     'hsl(var(--text-primary))',
          secondary:   'hsl(var(--text-secondary))',
          muted:       'hsl(var(--text-muted))',
          'on-accent': 'hsl(var(--text-on-accent))',
        },
        action: {
          primary:         'hsl(var(--action-primary))',
          'primary-hover': 'hsl(var(--action-primary-hover))',
          'selected-bg':   'hsl(var(--action-selected-bg))',
        },
        focus: 'hsl(var(--border-focus))',

        // -------- Status palette --------
        // Semantic pairs (success/warning/danger/info) + the operational
        // match-state vocabulary (live/called/started/… — aliases of the
        // same families; see DESIGN_COLOR.md color budget).
        status: {
          'success-fg': 'hsl(var(--status-success-fg))',
          'success-bg': 'hsl(var(--status-success-bg))',
          'warning-fg': 'hsl(var(--status-warning-fg))',
          'danger-fg':  'hsl(var(--status-danger-fg))',
          'danger-bg':  'hsl(var(--status-danger-bg))',
          'info-fg':    'hsl(var(--status-info-fg))',
          'info-bg':    'hsl(var(--status-info-bg))',
          live:            'hsl(var(--status-live))',
          'live-bg':       'hsl(var(--status-live-bg))',
          'live-solid':    'hsl(var(--status-live-solid))',
          'live-border':   'hsl(var(--status-live-border))',
          'live-ink':      'hsl(var(--status-live-ink))',
          called:          'hsl(var(--status-called))',
          'called-bg':     'hsl(var(--status-called-bg))',
          'called-solid':  'hsl(var(--status-called-solid))',
          'called-border': 'hsl(var(--status-called-border))',
          'called-ink':    'hsl(var(--status-called-ink))',
          late:            'hsl(var(--status-late))',
          'late-bg':       'hsl(var(--status-late-bg))',
          'late-solid':    'hsl(var(--status-late-solid))',
          'late-border':   'hsl(var(--status-late-border))',
          'late-ink':      'hsl(var(--status-late-ink))',
          overdue:            'hsl(var(--status-overdue))',
          'overdue-bg':       'hsl(var(--status-overdue-bg))',
          'overdue-solid':    'hsl(var(--status-overdue-solid))',
          'overdue-border':   'hsl(var(--status-overdue-border))',
          'overdue-ink':      'hsl(var(--status-overdue-ink))',
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

      // -------- Radii (warmed — rounded corners + gentle elevation) --------
      borderRadius: {
        none: '0',
        xs: 'var(--radius-xs)',           // 4px  — micro tags / initial squares
        sm: 'var(--radius-sm)',           // 6px  — status pills / small controls
        DEFAULT: 'var(--radius)',         // 8px  — buttons / chips / inputs
        md: 'var(--radius-md)',           // 9px  — primary buttons / nav rows
        lg: 'var(--radius-lg)',           // 12px — cards / metric tiles / modals
        xl: 'var(--radius-xl)',           // 14px — screen frame
        // rounded-full (9999px) remains available from Tailwind core defaults
      },

      // -------- Shadows (soft elevation; hard offset is opt-in) ----------
      // sm/md/lg resolve to subtle Gaussian elevation (--shadow-sm/md/lg);
      // dark mode drops them to none (substrate contrast carries depth).
      // DEFAULT/xl/2xl keep the opt-in hard offset for callers that want it.
      boxShadow: {
        none: 'none',
        sm:   'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-hard)',
        md:   'var(--shadow-md)',
        lg:   'var(--shadow-lg)',
        xl:   'var(--shadow-hard)',
        '2xl':'var(--shadow-hard)',
        inner: 'inset 0 1px 0 hsl(var(--rule) / 0.4)',
        // Handoff elevation pair — the screen frame + a raised element.
        frame: 'var(--shadow-frame)',
        card:  'var(--shadow-card)',
        // Signature glow — primary actions (shadow-glow) + selected cards (shadow-glow-lg)
        glow:      'var(--glow-accent)',
        'glow-lg': 'var(--glow-accent-lg)',
        'glow-live': 'var(--glow-live)',
      },

      // -------- Brand easing + duration scale (see MOTION.md) --------
      transitionTimingFunction: {
        brand:       'var(--ease-brand)',
        'out-quick': 'var(--ease-out-quick)',
        linear:      'var(--ease-linear)',
      },
      transitionDuration: {
        instant:  'var(--motion-instant)',
        fast:     'var(--motion-fast)',
        standard: 'var(--motion-standard)',
        moderate: 'var(--motion-moderate)',
        slow:     'var(--motion-slow)',
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
    require('@tailwindcss/container-queries'),
    plugin(({ addVariant }) => {
      addVariant('compact',     '[data-density="compact"] &');
      addVariant('comfortable', '[data-density="comfortable"] &, :root:not([data-density]) &');
    }),
  ],
};
