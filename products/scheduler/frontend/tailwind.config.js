/** @type {import('tailwindcss').Config} */
const plugin = require('tailwindcss/plugin');

export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Default sans + mono. The variable fonts are registered in
        // ``main.tsx`` via @fontsource-variable. System fallbacks keep
        // initial paint sharp before the woff2 lands.
        sans: [
          'Geist Variable',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono Variable',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      fontSize: {
        // 2xs is new — used for overlines, micro-badges, table-header
        // eyebrows. Everything else matches the strict 11/12/14/16/18/24
        // scale documented in docs/audit-2026-04-27/PHASE-1-AUDIT.md.
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Status semantic tokens — see src/index.css. Use as
        // bg-status-live, text-status-live, border-status-live, etc.
        // The "/bg" suffix is the muted-tinted background variant.
        status: {
          live:        "hsl(var(--status-live))",
          'live-bg':   "hsl(var(--status-live-bg))",
          called:      "hsl(var(--status-called))",
          'called-bg': "hsl(var(--status-called-bg))",
          started:     "hsl(var(--status-started))",
          'started-bg':"hsl(var(--status-started-bg))",
          blocked:     "hsl(var(--status-blocked))",
          'blocked-bg':"hsl(var(--status-blocked-bg))",
          warning:     "hsl(var(--status-warning))",
          'warning-bg':"hsl(var(--status-warning-bg))",
          idle:        "hsl(var(--status-idle))",
          'idle-bg':   "hsl(var(--status-idle-bg))",
          done:        "hsl(var(--status-done))",
          'done-bg':   "hsl(var(--status-done-bg))",
        },
      },
      // Density-aware spacing utilities. Resolve to CSS vars set per
      // density mode in src/index.css. Use h-row / py-cell / px-cell /
      // gap-section directly in components to follow the user's
      // density preference automatically.
      height: {
        row: 'var(--density-row-h)',
        badge: 'var(--density-badge-h)',
      },
      minHeight: {
        row: 'var(--density-row-h)',
      },
      padding: {
        cell: 'var(--density-cell-py) var(--density-cell-px)',
      },
      spacing: {
        cell: 'var(--density-cell-px)',
        'cell-y': 'var(--density-cell-py)',
        section: 'var(--density-section-gap)',
        gap: 'var(--density-gap)',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      // Brand easing curve. Used everywhere we want a slightly weighty,
      // physical decel — buttons, drawer slides, Gantt block reflow.
      // Promoted from the literal in DragGantt.tsx so the whole app
      // shares one curve instead of defaulting to the browser ease.
      transitionTimingFunction: {
        brand: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      // Semantic z-index scale. ``z-hud`` for sticky operator chrome
      // (SolverHud, internal sticky headers), ``z-chrome`` for the top
      // TabBar (must clear the HUD), ``z-popover`` for menu/tooltip
      // anchors, ``z-overlay`` for floating chips/inline-spreadsheet
      // popovers above popovers, ``z-modal`` for dialogs/toasts/full
      // overlays. No arbitrary z-30/z-40/z-50 in component code.
      zIndex: {
        hud: '10',
        chrome: '20',
        popover: '30',
        overlay: '40',
        modal: '50',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // Solver theater — fancy animations for the live optimization HUD.
        "phase-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 var(--phase-ring, rgba(59,130,246,0.45))" },
          "50%":      { boxShadow: "0 0 0 8px rgba(0,0,0,0)" },
        },
        "scan-sweep": {
          "0%":   { transform: "translateX(-40%)" },
          "100%": { transform: "translateX(140%)" },
        },
        "block-in": {
          "0%":   { opacity: "0", transform: "translateY(8px) scale(0.94)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "marching-ants": {
          "0%":   { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "14px 0" },
        },
        "obj-flash": {
          "0%":   { color: "currentColor", textShadow: "none" },
          "40%":  { color: "#059669", textShadow: "0 0 16px rgba(16,185,129,0.55)" },
          "100%": { color: "currentColor", textShadow: "none" },
        },
        "drop-ok": {
          "0%":   { backgroundColor: "rgba(16,185,129,0.35)" },
          "100%": { backgroundColor: "rgba(16,185,129,0)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%":      { transform: "translateX(-4px)" },
          "40%":      { transform: "translateX(4px)" },
          "60%":      { transform: "translateX(-3px)" },
          "80%":      { transform: "translateX(3px)" },
        },
        "cell-pulse": {
          "0%, 100%": { opacity: "0.55" },
          "50%":      { opacity: "1" },
        },
        sheen: {
          "0%":   { transform: "translateX(-120%) skewX(-20deg)" },
          "100%": { transform: "translateX(220%) skewX(-20deg)" },
        },
        "solution-tick": {
          "0%":   { transform: "scale(1)" },
          "40%":  { transform: "scale(1.25)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "phase-glow":     "phase-glow 2.2s ease-in-out infinite",
        "scan-sweep":     "scan-sweep 1.6s linear infinite",
        "block-in":       "block-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) backwards",
        "marching-ants":  "marching-ants 0.6s linear infinite",
        "obj-flash":      "obj-flash 0.9s ease-out",
        "drop-ok":        "drop-ok 0.9s ease-out",
        shake:            "shake 0.35s ease-in-out",
        "cell-pulse":     "cell-pulse 1.4s ease-in-out infinite",
        sheen:            "sheen 1.1s ease-out",
        "solution-tick":  "solution-tick 0.35s ease-out",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    // Custom variant: ``compact:py-1`` applies only when
    // ``[data-density="compact"]`` is on a parent element. Use sparingly —
    // most density-sensitive sizing should go through the CSS-var-driven
    // spacing utilities above (h-row, py-cell, px-cell, etc.).
    plugin(({ addVariant }) => {
      addVariant('compact', '[data-density="compact"] &');
      addVariant('comfortable', '[data-density="comfortable"] &, :root:not([data-density]) &');
    }),
  ],
}
