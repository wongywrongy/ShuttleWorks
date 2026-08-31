import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowSquareOut, GearSix } from '@phosphor-icons/react';
import { useTournamentId } from '../../hooks/useTournamentId';
import { ActionsBar } from '../../components/control-plane';
import { INTERACTIVE_BASE } from '../../lib/utils';
import { apiClient } from '../../api/client';

/** Display product mode: the venue public-display surface, live in-shell,
 *  with a "Configure display" shortcut and an "Open fullscreen" affordance. */
export function DisplayProduct() {
  const tid = useTournamentId();
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [displayLinkError, setDisplayLinkError] = useState(false);

  // A venue board must use the revocable capability URL. The old `?id=` link
  // relied on whichever session happened to be open in the new tab and was
  // not safe to hand to a TV or another device. Minting is idempotent and
  // owner-gated; until it resolves, keep the action visibly unavailable
  // rather than presenting a link that cannot be trusted to work.
  useEffect(() => {
    if (!tid) return;
    let cancelled = false;
    setDisplayUrl(null);
    setDisplayLinkError(false);
    apiClient
      .getDisplayToken(tid)
      .then((token) => {
        if (!cancelled) setDisplayUrl(token.url);
      })
      .catch(() => {
        if (!cancelled) setDisplayLinkError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tid]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ActionsBar
        title="Preview"
        status={
          <span className="text-xs text-muted-foreground">
            The venue TV for this workspace
          </span>
        }
      >
        <Link
          /* Publish / Displays, NOT `setup?section=display`. The old target was
             the MEET Configuration page plus a `?section=` value no switcher
             has ever had, so "Configure display" landed the operator on meet
             scoring settings. */
          to={`/tournaments/${tid}/publish/displays`}
          className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 text-xs text-card-foreground hover:bg-muted/40 hover:text-foreground`}
        >
          <GearSix aria-hidden="true" className="h-3.5 w-3.5" />
          Configure display
        </Link>
        <a
          href={displayUrl ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!displayUrl}
          onClick={(event) => {
            if (!displayUrl) event.preventDefault();
          }}
          className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium ${displayUrl ? 'bg-primary text-primary-foreground hover:opacity-90' : 'cursor-wait bg-muted text-muted-foreground'}`}
        >
          <ArrowSquareOut aria-hidden="true" className="h-3.5 w-3.5" />
          {displayUrl ? 'Open fullscreen' : displayLinkError ? 'Fullscreen unavailable' : 'Preparing fullscreen…'}
        </a>
      </ActionsBar>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-card">
        {displayUrl ? (
          <iframe
            title="Published venue board preview"
            src={displayUrl}
            className="absolute inset-0 h-full w-full border-0"
            data-testid="public-display"
            allowFullScreen
          />
        ) : (
          <div
            data-testid="public-display"
            className="flex h-full items-center justify-center text-sm text-muted-foreground"
          >
            Preview unavailable until a public display link is ready.
          </div>
        )}
      </div>
      {displayLinkError ? (
        <p role="status" className="border-t border-border bg-muted/30 px-4 py-2 text-center text-xs text-muted-foreground">
          A workspace owner can enable the venue display link in Publish.
        </p>
      ) : null}
    </div>
  );
}
