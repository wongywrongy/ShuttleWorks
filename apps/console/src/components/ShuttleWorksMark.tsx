import { BRAND } from '@scheduler/brand';

/**
 * The ShuttleWorks brand lockup: a high-contrast monogram TILE + the wordmark
 * as plain display type.
 *
 * The old mark was the wordmark inside a 1px frame — the frame *was* the logo.
 * At 26px in a page header that reads as an unstyled button (SP-UI-1 design
 * review, P1), so the frame is gone: hierarchy now comes from the tile's
 * contrast against flat type, which is what a real lockup does.
 *
 * This is deliberately a PLACEHOLDER SYSTEM, not a logo. When a real mark
 * exists it drops into `SwMonogram` and the wordmark stays exactly as-is.
 * Keep it to this one component + tokens — no image assets.
 *
 * The tile is `bg-foreground / text-background`: maximum contrast in either
 * theme (it inverts with the palette), and achromatic so the brand mark
 * spends none of the restrained accent budget.
 */

type MonogramProps = {
  /** Sizing/display utility class(es) — the sidebar rail passes its own box. */
  className?: string;
};

/** The square "SW" tile. Also stands alone as the sidebar's home affordance,
 *  so the brand mark and "go home" are the same object. */
export function SwMonogram({ className = '' }: MonogramProps) {
  return (
    <span
      aria-hidden
      className={[
        'inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px]',
        'bg-foreground text-[10px] font-semibold leading-none tracking-[0.01em] text-background',
        className,
      ].join(' ')}
    >
      {BRAND.productMonogram}
    </span>
  );
}

type Props = {
  /**
   * Display utility class(es). Defaults to ``inline-flex`` so the mark
   * renders at all widths. Call sites may pass ``hidden sm:inline-flex``
   * to drop it on narrow viewports.
   */
  className?: string;
  /** Set false for the bare wordmark (a surface that already shows the tile). */
  tile?: boolean;
};

/** The Console wordmark chip: accent-filled, right edge clipped to a chevron —
 *  the mock's brand mark. Still a placeholder system (type + tokens, no image
 *  asset); the clip-path IS the mark. */
export function ShuttleWorksMark({ className = 'inline-flex', tile = false }: Props) {
  return (
    <span
      aria-label={BRAND.productName}
      title={BRAND.productName}
      className={[className, 'items-center gap-2'].join(' ')}
    >
      {tile ? <SwMonogram /> : null}
      <span
        className="inline-block bg-accent py-1.5 pl-3 pr-4 text-xs font-extrabold leading-none tracking-[0.02em] text-accent-ink [clip-path:polygon(0_0,100%_0,calc(100%-9px)_100%,0_100%)]"
      >
        {BRAND.productName}
      </span>
    </span>
  );
}
