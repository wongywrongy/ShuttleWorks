/**
 * DetailDock — the layout host for a right-hand detail pane.
 *
 * Mounted as the LAST flex child of a `relative flex … overflow-hidden` row
 * container, it turns the detail pane into a real layout column: opening
 * animates the dock's width (`sw-dock-transition`) so the sibling table
 * reflows with it — nothing is covered, and container-query column
 * priorities collapse low-value columns as room tightens. This replaces the
 * two prior behaviors this codebase had (an absolute overlay that hid the
 * table's right columns, and `w-72 flex-shrink-0` rails that crudely
 * squeezed content).
 *
 * Narrow fallback: when the parent container can't give the pane `width` px
 * and still keep `minContentWidth` px of content, the dock stays 0-wide and
 * renders its children as the classic right-edge overlay instead
 * (`data-mode="overlay"`), anchored to the consumer's `relative` container.
 *
 * Geometry lives here; pane chrome (header, close, scroll) is the child —
 * typically a `variant="docked"` DetailPanel. Width animation is chosen over
 * a grid-template-columns rewrite deliberately: consumers' containers are
 * already flex, and the sibling reflow during the transition is the point.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useContainerWidth } from '../../hooks/useContainerWidth';

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Fallback for the close-retention window when transitionend never fires
 *  (display:none mid-transition, jsdom). Slightly above --dur-slow. */
const CLOSE_FALLBACK_MS = 450;

export function DetailDock({
  open,
  width = 380,
  minContentWidth = 560,
  children,
  testId = 'detail-dock',
}: {
  /** Whether a selection is active. The dock animates itself open/closed. */
  open: boolean;
  /** Pane width in px when docked (also the overlay-fallback width). */
  width?: number;
  /** Minimum px the sibling content must keep; below it the pane falls back
   *  to overlay mode instead of squeezing the table into uselessness. */
  minContentWidth?: number;
  children: ReactNode;
  testId?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const containerWidth = useContainerWidth(hostRef as RefObject<HTMLElement | null>);
  // Unmeasured (first paint, jsdom) counts as roomy — docked is the default.
  const docked =
    containerWidth == null || containerWidth - width >= minContentWidth;

  // Retain the last children while the close transition runs so the pane
  // slides shut with its content instead of blanking to a bg-card sliver.
  // The ref is only touched inside effects (react-hooks/refs); the close
  // path promotes it into `retained` STATE, which render reads. Layout
  // effect so the promotion lands before paint — no one-frame blank.
  const [retained, setRetained] = useState<ReactNode>(null);
  const closing = retained != null;
  const lastChildrenRef = useRef<ReactNode>(null);
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open) lastChildrenRef.current = children;
  });

  useLayoutEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (open) {
      setRetained(null);
      return;
    }
    if (!wasOpen || prefersReducedMotion()) return;
    setRetained(lastChildrenRef.current);
    const t = window.setTimeout(() => setRetained(null), CLOSE_FALLBACK_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  const mode = docked ? 'docked' : 'overlay';
  return (
    <div
      ref={hostRef}
      data-testid={testId}
      data-mode={mode}
      onTransitionEnd={(e) => {
        // transitionend BUBBLES: a hover/focus transition ending on a
        // control inside the retained pane must not clear the retention
        // mid-close — only the host's own transition counts (the host
        // transitions nothing but width, so the target check suffices;
        // jsdom's synthetic event carries no propertyName to check).
        if (!open && e.target === e.currentTarget) {
          setRetained(null);
        }
      }}
      // Overlay mode keeps the host STATIC (and unclipped) so the absolute
      // layer below anchors to the consumer's `relative` container, not to
      // this zero-width column.
      className={
        docked
          ? 'relative h-full flex-shrink-0 overflow-hidden sw-dock-transition'
          : 'h-full flex-shrink-0'
      }
      style={{ width: docked && open ? width : 0 }}
    >
      {docked ? (
        open || closing ? (
          // Fixed-width layer pinned to the dock's right edge: while the
          // host's width animates, content slides in/out instead of
          // reflowing at every frame. Retained (closing) content is inert —
          // a click during the ≤450ms close must not fire an action bound
          // to the just-dismissed selection.
          <div
            className={[
              'absolute inset-y-0 right-0 flex flex-col border-l border-border bg-card',
              open ? '' : 'pointer-events-none',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ width }}
          >
            {open ? children : retained}
          </div>
        ) : null
      ) : open ? (
        <div
          className="absolute inset-y-0 right-0 z-overlay flex max-w-[90%] flex-col border-l border-border bg-card shadow-2xl sw-drawer-in"
          style={{ width }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
