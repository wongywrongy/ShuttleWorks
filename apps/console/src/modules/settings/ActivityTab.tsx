import { useEffect, useState } from 'react';
import { useAlertStore } from '../../store/alertStore';
import { apiClient } from '../../api/client';
import type { TournamentActivityEntryDTO, TournamentActivityFieldChangeDTO } from '../../api/dto';
import { EmptyState } from '../../components/control-plane';
import { PAGE_BODY_WIDTH } from '../../components/control-plane/PageBody';
import { TEXT_MUTED_XS, TEXT_TITLE_SM } from '../../lib/utils'
import { formatDateTime } from '../../lib/formatDateTime';

/** Session-activity timestamps (`useAlertStore`'s live-day events) have no
 * tournament timezone of their own — they are always this browser, right
 * now — so they keep the workstation's local clock rather than the
 * tournament-timezone `datetime` context used for durable history below. */
function formatSessionTimestamp(iso: string): string {
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

/** A row's plain-language change description already names the section
 * (ruling R1) — this is only for the rare row missing a description. */
function rowDescription(entry: TournamentActivityEntryDTO): string {
  return entry.summary || 'Changed';
}

function fieldValueText(value: unknown): string {
  if (value === null || value === undefined) return 'Not set';
  if (typeof value === 'string') return value || 'Not set';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return JSON.stringify(value);
}

function FieldDiffRow({ field }: { field: TournamentActivityFieldChangeDTO }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      <span className="font-medium text-foreground">{field.label}:</span>
      <span className="text-muted-foreground">{fieldValueText(field.old)}</span>
      <span aria-hidden="true" className="text-muted-foreground">→</span>
      <span className="text-foreground">{fieldValueText(field.new)}</span>
    </li>
  );
}

/** Row expansion: old → new values when the record has a field diff
 * (ruling R2), plus diagnostics that never appear in the default row
 * (ruling R3) — raw operation id, ISO timestamp, payload hash. */
function ActivityRowDetails({ entry }: { entry: TournamentActivityEntryDTO }) {
  return (
    <details className="mt-1.5 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none">Details</summary>
      <div className="mt-1.5 space-y-2 border-l border-border pl-2.5">
        {entry.fields.length > 0 ? (
          <ul className="space-y-1">
            {entry.fields.map((field) => (
              <FieldDiffRow key={field.key} field={field} />
            ))}
          </ul>
        ) : (
          <p>Details not recorded for this change.</p>
        )}
        <dl className="grid grid-cols-[max-content_1fr] gap-x-2 gap-y-0.5">
          <dt>Operation ID</dt>
          <dd className="font-mono">{entry.id}</dd>
          <dt>Recorded at</dt>
          <dd className="font-mono">{formatDateTime(entry.occurredAt, 'diagnostic') ?? entry.occurredAt}</dd>
          <dt>Payload hash</dt>
          <dd className="font-mono">{entry.payloadHash || 'not recorded'}</dd>
        </dl>
      </div>
    </details>
  );
}

/** Durable activity is read from the service; local live-day activity is separate. */
export function ActivityTab({ tid, timeZone }: { tid?: string; timeZone?: string }) {
  const activity = useAlertStore((state) => state.activity);
  const [durable, setDurable] = useState<TournamentActivityEntryDTO[]>([]);
  const [retentionLimit, setRetentionLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(Boolean(tid));
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!tid) return;
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    apiClient.getTournamentActivity(tid).then(
      (feed) => {
        if (active) {
          setDurable(feed.entries);
          setRetentionLimit(feed.retentionLimit);
        }
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
        <div>
          <h3 id="durable-activity-heading" className={TEXT_TITLE_SM}>
            Tournament history
          </h3>
          {retentionLimit != null ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Kept for the most recent {retentionLimit} changes.
            </p>
          ) : null}
        </div>
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
                  <p className="text-sm font-medium text-foreground">{rowDescription(entry)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{entry.actorName}</p>
                  <ActivityRowDetails entry={entry} />
                </div>
                <time
                  dateTime={entry.occurredAt}
                  className="shrink-0 text-xs tabular-nums text-muted-foreground"
                >
                  {formatDateTime(entry.occurredAt, 'datetime', timeZone) ?? entry.occurredAt}
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
                title={formatSessionTimestamp(entry.ts)}
                className="shrink-0 text-xs tabular-nums text-muted-foreground"
              >
                {formatSessionTimestamp(entry.ts)}
              </time>
            </li>
          ))}
        </ol>
      )}
      </section>
    </div>
  );
}
