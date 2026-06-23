/**
 * useFullscreen — Fullscreen API wrapper with keyboard shortcut.
 *
 * Tracks fullscreen state, exposes a toggle callback that requests on
 * `targetRef.current` (or `documentElement` if null), and binds an `F`
 * key shortcut at the window level. The `F` shortcut is ignored when
 * the user is typing in an input or textarea.
 *
 * The toggle catches and console-warns Fullscreen API rejections —
 * iframes, kiosk browsers, and insecure contexts can deny silently,
 * which would otherwise leave a button that looks broken.
 */
import { useCallback, useEffect, useState, type RefObject } from 'react';

export interface UseFullscreenResult {
  isFullscreen: boolean;
  toggle: () => void;
}

export function useFullscreen(
  targetRef: RefObject<HTMLElement | null>
): UseFullscreenResult {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    typeof document !== 'undefined'
      ? Boolean(document.fullscreenElement)
      : false
  );

  useEffect(() => {
    const onChange = () =>
      setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = useCallback(() => {
    if (!document.fullscreenElement) {
      (targetRef.current ?? document.documentElement)
        .requestFullscreen?.()
        .catch((err) => {
          console.warn('[useFullscreen] fullscreen request denied:', err);
        });
    } else {
      document.exitFullscreen?.().catch((err) => {
        console.warn('[useFullscreen] exit fullscreen failed:', err);
      });
    }
  }, [targetRef]);

  // 'F' keyboard shortcut (ignored when user is typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  return { isFullscreen, toggle };
}
