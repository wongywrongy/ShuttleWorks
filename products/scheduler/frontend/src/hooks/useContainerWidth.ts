import { useEffect, useState, type RefObject } from 'react';

/**
 * Observed width of an element's PARENT container, in px. `null` until the
 * first ResizeObserver measurement lands (jsdom's no-op polyfill never fires,
 * so tests see `null` — callers must pick a sensible default for that).
 */
export function useContainerWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === 'number') setWidth(w);
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, [ref]);

  return width;
}
