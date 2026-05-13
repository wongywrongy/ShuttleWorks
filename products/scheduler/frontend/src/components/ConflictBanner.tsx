/**
 * ConflictBanner — inline notice rendered directly on a match card
 * when an operator's command was rejected by the server.
 *
 * Two flavours per Step G of the architecture-adjustment arc:
 *
 *   - ``stale_version``: "Updated by someone else — reloaded".
 *     Auto-dismisses after 4 seconds. The system has already
 *     recovered (refetched the canonical state in the hook); the
 *     banner is informational, not operator-actionable.
 *   - ``conflict``: "[rejection_reason]". Persists until the
 *     operator clicks the × button. The transition was rejected
 *     (e.g. start a finished match) — operator needs to see and
 *     acknowledge.
 *
 * Two consumption patterns:
 *
 *   1. **Self-subscribing**: ``<ConflictBanner matchId={id} />`` —
 *      reads ``recentConflictsByMatchId`` directly. Used by the
 *      match-card render in WorkflowPanel.
 *   2. **Controlled**: ``<ConflictBanner flavour=... message=... />`` —
 *      explicit props, no store coupling. Used by tests + any future
 *      surface that wants its own conflict-state plumbing.
 */
import { useEffect, useState } from 'react';
import { X as XIcon } from '@phosphor-icons/react';
import { useMatchStateStore, type ConflictRecord } from '../store/matchStateStore';

const STALE_VERSION_AUTO_DISMISS_MS = 4000;
const STALE_VERSION_MESSAGE = 'Updated by someone else — reloaded';

interface ControlledProps {
  flavour: ConflictRecord['flavour'];
  message: string;
  onDismiss?: () => void;
  className?: string;
  /** Used by tests to disable the timer; default behaviour matches prod. */
  autoDismissMs?: number;
}

interface SubscriberProps {
  matchId: string;
  className?: string;
}

type ConflictBannerProps = ControlledProps | SubscriberProps;

function isControlled(props: ConflictBannerProps): props is ControlledProps {
  return 'flavour' in props;
}

export function ConflictBanner(props: ConflictBannerProps) {
  // Branch on shape: store-subscribing surface vs explicit props.
  // The store-subscribing branch is what production renders into a
  // match card; the controlled branch is what tests + future surfaces
  // pass in directly.
  if (!isControlled(props)) {
    return <SubscribedConflictBanner matchId={props.matchId} className={props.className} />;
  }
  return (
    <BannerView
      flavour={props.flavour}
      message={props.message}
      onDismiss={props.onDismiss ?? (() => {})}
      autoDismissMs={props.autoDismissMs ?? STALE_VERSION_AUTO_DISMISS_MS}
      className={props.className ?? ''}
    />
  );
}

function SubscribedConflictBanner({
  matchId,
  className = '',
}: {
  matchId: string;
  className?: string;
}) {
  const record = useMatchStateStore((s) => s.recentConflictsByMatchId[matchId]);
  const dismissConflict = useMatchStateStore((s) => s.dismissConflict);
  if (!record) return null;
  return (
    <BannerView
      flavour={record.flavour}
      message={record.message}
      onDismiss={() => dismissConflict(matchId)}
      autoDismissMs={STALE_VERSION_AUTO_DISMISS_MS}
      className={className}
    />
  );
}

function BannerView({
  flavour,
  message,
  onDismiss,
  autoDismissMs,
  className,
}: {
  flavour: ConflictRecord['flavour'];
  message: string;
  onDismiss: () => void;
  autoDismissMs: number;
  className: string;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (flavour !== 'stale_version') return;
    const id = window.setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, autoDismissMs);
    return () => window.clearTimeout(id);
  }, [flavour, autoDismissMs, onDismiss]);

  if (!visible) return null;

  const isStale = flavour === 'stale_version';
  const text = isStale ? STALE_VERSION_MESSAGE : message;
  const variantClasses = isStale
    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40'
    : 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/40';

  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid={`conflict-banner-${flavour}`}
      className={
        `mt-1 flex items-center justify-between gap-2 rounded border px-2 py-1 ` +
        `text-2xs leading-tight ${variantClasses} ${className}`
      }
    >
      <span className="truncate">{text}</span>
      {!isStale && (
        <button
          type="button"
          aria-label="Dismiss conflict"
          data-testid="conflict-dismiss"
          className="shrink-0 rounded p-0.5 hover:bg-red-500/20"
          onClick={() => {
            setVisible(false);
            onDismiss();
          }}
        >
          <XIcon aria-hidden="true" className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
