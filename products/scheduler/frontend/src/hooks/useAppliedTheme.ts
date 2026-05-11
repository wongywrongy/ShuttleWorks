/**
 * Reads the stored theme preference, resolves ``'system'`` against the
 * OS ``prefers-color-scheme`` media query, and reflects the result onto
 * ``<html>`` via the ``.dark`` class plus the ``color-scheme`` meta tag.
 *
 * Mount once near the app root. Listens to media-query changes so users
 * who picked "system" flip automatically when the OS theme changes.
 */
import { useEffect } from 'react';
import { usePreferencesStore, type ThemePreference } from '../store/preferencesStore';

type Resolved = 'light' | 'dark';

function resolve(pref: ThemePreference, systemPrefersDark: boolean): Resolved {
  if (pref === 'system') return systemPrefersDark ? 'dark' : 'light';
  return pref;
}

function apply(resolved: Resolved) {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');

  // Keep the ``color-scheme`` meta in sync so native form controls and
  // scrollbars render with the right palette even before the stylesheet
  // kicks in on first paint.
  let meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'color-scheme';
    document.head.appendChild(meta);
  }
  meta.content = resolved;
}

export function useAppliedTheme(): Resolved {
  const theme = usePreferencesStore((s) => s.theme);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const recompute = () => apply(resolve(theme, mql.matches));
    recompute();

    if (theme !== 'system') return;
    const listener = () => recompute();
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }, [theme]);

  const systemPrefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return resolve(theme, systemPrefersDark);
}
