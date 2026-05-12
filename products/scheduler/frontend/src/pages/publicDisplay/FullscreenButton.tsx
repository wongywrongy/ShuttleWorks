import { ArrowsOut, ArrowsIn } from '@phosphor-icons/react';

import { INTERACTIVE_BASE } from '../../lib/utils';

interface FullscreenButtonProps {
  isFullscreen: boolean;
  onToggle: () => void;
  className?: string;
}

export function FullscreenButton({
  isFullscreen,
  onToggle,
  className = '',
}: FullscreenButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid="tv-fullscreen-toggle"
      title={`${isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} (F)`}
      className={`${INTERACTIVE_BASE} inline-flex items-center gap-2 rounded-sm border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground ${className}`}
      aria-pressed={isFullscreen}
    >
      {isFullscreen ? (
        <ArrowsIn aria-hidden="true" className="h-4 w-4" />
      ) : (
        <ArrowsOut aria-hidden="true" className="h-4 w-4" />
      )}
      <span>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</span>
    </button>
  );
}
