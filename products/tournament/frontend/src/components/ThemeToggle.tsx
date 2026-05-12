import { useEffect, useState } from "react";

const STORAGE_KEY = "tournament-theme";

type Theme = "light" | "dark";

function readInitial(): Theme {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // private mode etc.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readInitial);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const next: Theme = theme === "light" ? "dark" : "light";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      className="font-mono text-2xs uppercase tracking-wider px-2 py-1
        border border-rule-soft text-ink-muted hover:text-ink
        hover:bg-rule-soft transition-colors"
    >
      [ {next.toUpperCase()} ]
    </button>
  );
}
