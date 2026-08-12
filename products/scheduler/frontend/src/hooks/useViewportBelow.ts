import { useEffect, useState } from 'react';

/**
 * Whether the viewport is narrower than `px`.
 *
 * A JS read of `window.innerWidth` rather than a CSS media query on purpose:
 * the shell has to render ONE navigation (a rail or a drawer), not both with
 * one hidden — two copies would duplicate the `<nav>` landmark and every nav
 * item's test id, and a `display:none` copy is still in the accessibility
 * tree's document order for anything that walks it.
 *
 * Unmeasured (no `window`) counts as WIDE, matching DetailDock's
 * "unmeasured counts as roomy" convention — the desktop layout is the
 * default and the narrow one is the exception.
 */
function isBelow(px: number): boolean {
  return typeof window !== 'undefined' && window.innerWidth > 0 && window.innerWidth < px;
}

export function useViewportBelow(px: number): boolean {
  const [below, setBelow] = useState(() => isBelow(px));
  useEffect(() => {
    const onResize = () => setBelow(isBelow(px));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [px]);
  return below;
}
