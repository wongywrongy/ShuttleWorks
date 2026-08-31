import { useEffect, useState } from 'react';
import { useAlertStore } from '../../store/alertStore';
import { apiClient } from '../../api/client';
import type { TournamentActivityEntryDTO } from '../../api/dto';
import { EmptyState } from '../../components/control-plane';
import { PAGE_BODY_WIDTH } from '../../components/control-plane/PageBody';
import { TEXT_MUTED_XS, TEXT_TITLE_SM } from '../../lib/utils'

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      });
}

/**
 * The backend does not currently expose a durable tournament activity
 * endpoint. Be explicit about that boundary instead of presenting the
 * in-memory live-day trail as an audit log. Entries observed in this browser
 * session remain useful for handoff and incident review, but disappear on a
 * refresh or sign-out.
 */
export function ActivityTab({ tid }: { tid?: string }) {
  const activity = useAlertStore((state) => state.activity);
  const [durable, setDurable] = useState<TournamentActivityEntryDTO[]>([]);
  const [loading, setLoading] = useState(Boolean(tid));
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!tid) return;
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    apiClient.getTournamentActivity(tid).then(
      (feed) => {
        if (active) setDurable(feed.entries);
      },
      () => {
        if (active) setLoadFailed(true);
      },
    ).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [tid]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">Activity</h2>
        <p className={`mt-1 text-xs text-muted-foreground ${PAGE_BODY_WIDTH.prose}`}>
          Server-recorded changes identify who changed what and when. Live-day events observed only
          in this browser are listed separately as current-session activity.
        </p>
      </div>

      <section aria-labelledby="durable-activity-heading" className="space-y-2">
        <h3 id="durable-activity-heading" className={TEXT_TITLE_SM}>
          Tournament history
        </h3>
        {loading ? (
          <p className={TEXT_MUTED_XS}>Loading tournament history…</p>
        ) : loadFailed ? (
          <p role="alert" className="text-xs text-status-warning-fg">
            Tournament history could not be loaded. Current-session activity is still available below.
          </p>
        ) : durable.length === 0 ? (
          <EmptyState title="No recorded tournament changes" body="High-impact changes will appear here after they are saved." />
        ) : (
          <ol data-testid="durable-activity-list" className="divide-y divide-border rounded border border-border">
            {durable.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-4 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{entry.summary}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {entry.actorName} · {entry.target}
                  </p>
                </div>
                <time dateTime={entry.occurredAt} className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatTimestamp(entry.occurredAt)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="session-activity-heading" className="space-y-2">
        <div>
          <h3 id="session-activity-heading" className={TEXT_TITLE_SM}>Current browser session</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Operational observations below clear when this browser session ends.</p>
        </div>

      {activity.length === 0 ? (
        <EmptyState title="No activity in this session" body="Operational changes observed here will appear in this list." />
      ) : (
        <ol data-testid="session-activity-list" className="divide-y divide-border rounded border border-border">
          {activity.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-4 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{entry.title}</p>
                {entry.message ? <p className="mt-0.5 text-xs text-muted-foreground">{entry.message}</p> : null}
              </div>
              <time
                data-testid="activity-timestamp"
                dateTime={entry.ts}
                title={formatTimestamp(entry.ts)}
                className="shrink-0 text-xs tabular-nums text-muted-foreground"
              >
                {formatTimestamp(entry.ts)}
              </time>
            </li>
          ))}
        </ol>
      )}
      </section>
    </div>
  );
}
