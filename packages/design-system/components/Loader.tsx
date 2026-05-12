import { cn } from '../lib/utils';

/**
 * Loader — a small spinner indicating in-flight work.
 *
 * Renamed from scheduler's `LoadingSpinner` for consistency with the
 * `<Toast>` / `<Modal>` naming pattern in the design system. The default
 * size is `md`; `sm` for inline cell loaders, `lg` for full-page splash.
 *
 * Color: stroked top edge uses `text-accent` (brand orange via
 * `--ring → --accent` semantic chain). The rest of the ring is muted
 * (`border-border`) so the spin direction is visible without being loud.
 */

interface LoaderProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<LoaderProps['size']>, string> = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-4',
  lg: 'w-12 h-12 border-4',
};

export function Loader({ size = 'md', className }: LoaderProps) {
  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div
        role="status"
        aria-label="Loading"
        className={cn(
          'animate-spin rounded-full border-border border-t-brand',
          SIZE_CLASSES[size]
        )}
      />
    </div>
  );
}

// Backwards-compat alias for scheduler's existing `<LoadingSpinner />`
// call-sites. Phase 6 renames to <Loader> across the codebase.
export const LoadingSpinner = Loader;
