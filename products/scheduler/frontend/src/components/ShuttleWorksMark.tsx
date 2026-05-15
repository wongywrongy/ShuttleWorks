/**
 * Boxed ShuttleWorks wordmark — the 1px frame *is* the mark, no separate
 * glyph. 26px tall · 13px Geist SemiBold · 4px radius. Reused in the
 * AppShell TabBar (sm:inline-flex) and the dashboard header (inline-flex).
 */

type Props = {
  /**
   * Display utility class(es). Defaults to ``inline-flex`` so the mark
   * renders at all widths. The TabBar passes ``hidden sm:inline-flex``
   * to hide it on narrow viewports where it competes with the tab strip.
   */
  className?: string;
};

export function ShuttleWorksMark({ className = 'inline-flex' }: Props) {
  return (
    <span
      aria-label="ShuttleWorks"
      title="ShuttleWorks"
      className={[
        className,
        'h-[26px] items-center rounded-[4px] border border-foreground px-[9px] text-[13px] font-semibold leading-none tracking-[-0.005em] text-foreground',
      ].join(' ')}
    >
      ShuttleWorks
    </span>
  );
}
