/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
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
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
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
  plugins: [require("tailwindcss-animate")],
}
