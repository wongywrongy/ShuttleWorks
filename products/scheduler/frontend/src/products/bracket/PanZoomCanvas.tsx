/**
 * PanZoomCanvas — a pannable / zoomable viewport for content that outgrows
 * the screen (a 64-slot bracket is ~6 rounds × up to 32 cards and far wider
 * than any viewport). The bracket is treated as a canvas, not a scroll page:
 *
 *   - wheel / trackpad → zoom toward the cursor
 *   - drag the background → pan (clicks on cards/buttons pass through)
 *   - floating controls (−/%/+ , Fit, Reset) bottom-right
 *   - optional round-jump chips top-left that pan to a round column
 *
 * Pure frontend (CSS transform), no dependency. Round chips target child
 * elements marked `data-round="<index>"`.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MagnifyingGlassPlus, MagnifyingGlassMinus, CornersOut, ArrowCounterClockwise } from '@phosphor-icons/react';

const MIN_SCALE = 0.2;
const MAX_SCALE = 2;
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export function PanZoomCanvas({
  children,
  roundLabels,
}: {
  children: ReactNode;
  /** When set, renders round-jump chips that pan to `[data-round="i"]`. */
  roundLabels?: string[];
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ x: 24, y: 24, s: 1 });
  const drag = useRef<{ ox: number; oy: number } | null>(null);

  // Wheel zoom toward the cursor. Attached natively so we can preventDefault
  // (React's onWheel is passive in some setups).
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setT((prev) => {
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const ns = clamp(prev.s * factor, MIN_SCALE, MAX_SCALE);
        const k = ns / prev.s;
        return { s: ns, x: cx - (cx - prev.x) * k, y: cy - (cy - prev.y) * k };
      });
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    // Pan only when dragging the background — let clicks on cards/controls
    // (assign a slot, record a winner) work normally.
    if ((e.target as HTMLElement).closest('button, a, input, select, [role="button"]')) {
      return;
    }
    drag.current = { ox: e.clientX - t.x, oy: e.clientY - t.y };
    viewportRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setT((prev) => ({ ...prev, x: e.clientX - drag.current!.ox, y: e.clientY - drag.current!.oy }));
  };
  const endDrag = () => {
    drag.current = null;
  };

  const zoomBy = (factor: number) =>
    setT((prev) => {
      const vp = viewportRef.current;
      const cx = vp ? vp.clientWidth / 2 : 0;
      const cy = vp ? vp.clientHeight / 2 : 0;
      const ns = clamp(prev.s * factor, MIN_SCALE, MAX_SCALE);
      const k = ns / prev.s;
      return { s: ns, x: cx - (cx - prev.x) * k, y: cy - (cy - prev.y) * k };
    });

  const fit = () => {
    const content = contentRef.current;
    const vp = viewportRef.current;
    if (!content || !vp) return;
    const cw = content.scrollWidth;
    const ch = content.scrollHeight;
    if (cw === 0 || ch === 0) return;
    const s = clamp(Math.min(vp.clientWidth / (cw + 48), vp.clientHeight / (ch + 48)), MIN_SCALE, 1);
    // Center the content in BOTH axes. Vertical centering keeps the (centered)
    // Final mid-viewport instead of parked at the top — but never push the top
    // above a small margin, so a tall bracket stays reachable from its top edge.
    setT({
      s,
      x: (vp.clientWidth - cw * s) / 2,
      y: Math.max(24, (vp.clientHeight - ch * s) / 2),
    });
  };

  const reset = () => setT({ x: 24, y: 24, s: 1 });

  // Fit + center the content once on mount, so a freshly opened draw lands
  // with the (centered) Final in view rather than parked at the top-left.
  // jsdom reports a 0-sized content, so `fit` no-ops there — safe in tests.
  const didFit = useRef(false);
  useEffect(() => {
    if (didFit.current) return;
    const id = requestAnimationFrame(() => {
      didFit.current = true;
      fit();
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusRound = (i: number) => {
    const content = contentRef.current;
    const el = content?.querySelector<HTMLElement>(`[data-round="${i}"]`);
    if (!el) return;
    setT((prev) => ({ ...prev, x: 24 - el.offsetLeft * prev.s }));
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-card">
      <div
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        className="h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
      >
        <div
          ref={contentRef}
          style={{
            transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`,
            transformOrigin: '0 0',
            width: 'max-content',
          }}
        >
          {children}
        </div>
      </div>

      {/* Round-jump chips — for large draws, jump straight to a round. */}
      {roundLabels && roundLabels.length > 2 ? (
        <div className="absolute left-2 top-2 flex flex-wrap gap-1 rounded-sm border border-border bg-card/90 p-1 shadow-sm backdrop-blur">
          {roundLabels.map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => focusRound(i)}
              className="rounded-sm px-1.5 py-0.5 text-2xs font-medium text-muted-foreground transition-colors duration-fast ease-brand hover:bg-muted/60 hover:text-foreground"
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Zoom controls. */}
      <div className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-sm border border-border bg-card/90 p-0.5 shadow-sm backdrop-blur">
        <CtrlBtn label="Zoom out" onClick={() => zoomBy(1 / 1.2)}>
          <MagnifyingGlassMinus className="h-3.5 w-3.5" />
        </CtrlBtn>
        <span className="w-10 text-center text-2xs tabular-nums text-muted-foreground">
          {Math.round(t.s * 100)}%
        </span>
        <CtrlBtn label="Zoom in" onClick={() => zoomBy(1.2)}>
          <MagnifyingGlassPlus className="h-3.5 w-3.5" />
        </CtrlBtn>
        <CtrlBtn label="Fit to screen" onClick={fit}>
          <CornersOut className="h-3.5 w-3.5" />
        </CtrlBtn>
        <CtrlBtn label="Reset view" onClick={reset}>
          <ArrowCounterClockwise className="h-3.5 w-3.5" />
        </CtrlBtn>
      </div>
    </div>
  );
}

function CtrlBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-fast ease-brand hover:bg-muted/60 hover:text-foreground"
    >
      {children}
    </button>
  );
}
