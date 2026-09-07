import { useContext, useEffect, useRef } from 'react';
import { UNSAFE_LocationContext } from 'react-router-dom';

const STORAGE_PREFIX = 'shuttleworks:list-scroll:';

function readScroll(key: string): number | null {
  try {
    const value = sessionStorage.getItem(key);
    if (value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  } catch {
    return null;
  }
}

function writeScroll(key: string, value: number): void {
  try {
    sessionStorage.setItem(key, String(Math.max(0, Math.round(value))));
  } catch {
    // Private browsing and storage-disabled environments should retain normal navigation.
  }
}

/**
 * Restores a list's scroll position when browser Back returns to that exact
 * list URL. PUSH/REPLACE navigation is deliberately ignored so pagination,
 * sorting, and explicit focus changes remain under the caller's control.
 */
export function useListScrollRestore<T extends HTMLElement>(
  listId: string,
  ready = true,
) {
  const route = useContext(UNSAFE_LocationContext);
  const nodeRef = useRef<T | null>(null);
  const pathname = route?.location.pathname ?? (typeof window === 'undefined' ? '' : window.location.pathname);
  const search = route?.location.search ?? (typeof window === 'undefined' ? '' : window.location.search);
  const navigationType = route?.navigationType ?? 'PUSH';
  const key = `${STORAGE_PREFIX}${listId}:${pathname}${search}`;

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return undefined;
    const onScroll = () => writeScroll(key, node.scrollTop);
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      // A readiness transition re-runs this effect before restoration. Do not
      // overwrite the saved Back position with the pre-render scrollTop.
      if (ready) writeScroll(key, node.scrollTop);
      node.removeEventListener('scroll', onScroll);
    };
  }, [key, ready]);

  useEffect(() => {
    if (!ready || navigationType !== 'POP') return;
    const node = nodeRef.current;
    const saved = readScroll(key);
    if (!node || saved == null) return;
    const restore = () => {
      node.scrollTop = saved;
    };
    if (typeof requestAnimationFrame === 'function') {
      const frame = requestAnimationFrame(restore);
      return () => cancelAnimationFrame(frame);
    }
    restore();
    return undefined;
  }, [key, navigationType, ready]);

  return nodeRef;
}

/** Focus and reset a list after an explicit page/filter/sort navigation. */
export function focusListPage(container: HTMLElement | null): void {
  if (!container) return;
  container.scrollTop = 0;
  if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
  container.focus({ preventScroll: true });
}
