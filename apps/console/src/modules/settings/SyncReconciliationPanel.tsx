import { useState } from 'react';
import { Button } from '@scheduler/design-system';
import type { AuthorityStatusDTO, SyncQuarantineRecord } from '../../api/dto';
import { useSyncQuarantine } from '../../hooks/useSyncQuarantine';

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function detailText(record: SyncQuarantineRecord): string {
  const detail = record.detail;
  if (!detail) return '';
  const sequence = typeof detail.sequence === 'number' ? `seq ${detail.sequence}` : null;
  const expected = typeof detail.expectedSequence === 'number'
    ? `expected ${detail.expectedSequence}`
    : null;
  return [sequence, expected].filter(Boolean).join(' · ');
}

export function SyncReconciliationPanel({ authority }: { authority: AuthorityStatusDTO | null }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [correctionOperationId, setCorrectionOperationId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const sync = useSyncQuarantine(authority?.authority_epoch ?? null);

  if (!authority) return null;

  async function submit(record: SyncQuarantineRecord) {
    if (!reason.trim()) {
      setFormError('Add an operator reason before recording the correction.');
      return;
    }
    if (!confirmed) {
      setFormError('Confirm that the acknowledged correction should be linked.');
      return;
    }
    if (!correctionOperationId.trim()) {
      setFormError('Enter the acknowledged correction operation ID.');
      return;
    }
    setFormError(null);
    try {
      await sync.resolve(record.id, {
        reason: reason.trim(),
        correction_operation_id: correctionOperationId.trim(),
      });
      setOpenId(null);
      setReason('');
      setCorrectionOperationId('');
      setConfirmed(false);
    } catch {
      // The hook retains the server error and the form stays open for retry.
    }
  }

  return (
    <section aria-labelledby="sync-reconciliation-heading" className="rounded border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="sync-reconciliation-heading" className="text-sm font-semibold text-foreground">
            Reconciliation evidence
          </h2>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Rejected operations stay immutable. Apply the correction onsite; link it here after cloud acknowledgement.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-2xs text-muted-foreground">
          <input
            type="checkbox"
            checked={sync.includeResolved}
            onChange={(event) => sync.setIncludeResolved(event.target.checked)}
          />
          Show resolved
        </label>
      </div>

      {authority.blocked_operations > 0 ? (
        <p role="alert" className="mt-3 rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          Synchronization is permanently blocked for {authority.blocked_operations} operation{authority.blocked_operations === 1 ? '' : 's'}.
          {' '}Resolve the protocol error{authority.last_blocked_error_code ? ` (${authority.last_blocked_error_code})` : ''}; the operations remain stored and will not be discarded or retried automatically.
        </p>
      ) : null}

      {sync.loading && sync.items.length === 0 ? (
        <p className="mt-3 p-2 text-xs text-muted-foreground">Loading reconciliation evidence…</p>
      ) : sync.error ? (
        <p role="alert" className="mt-3 rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          {sync.error}
        </p>
      ) : sync.items.length === 0 ? (
        <p className="mt-3 rounded border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
          No {sync.includeResolved ? '' : 'open '}quarantined operations.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded border border-border">
          {sync.items.map((record) => {
            const expanded = openId === record.id;
            return (
              <li key={record.id} data-testid={`quarantine-${record.id}`} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-foreground">
                      <span className={`rounded px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide ${record.status === 'resolved' ? 'bg-status-live/10 text-status-live' : 'bg-status-warning/10 text-status-warning'}`}>
                        {record.status}
                      </span>
                      <span className="font-semibold">{record.reason_code}</span>
                      <span className="text-muted-foreground">{when(record.created_at)}</span>
                    </div>
                    <div className="mt-1 text-2xs tabular-nums text-muted-foreground">
                      {detailText(record) || 'No additional sequence detail'}
                      {record.operation_id ? ` · operation ${record.operation_id.slice(0, 8)}` : ''}
                    </div>
                    {record.resolution_note ? (
                      <div className="mt-1 text-2xs text-muted-foreground">Resolution: {record.resolution_note}</div>
                    ) : null}
                  </div>
                  {record.status === 'open' ? (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => { setOpenId(expanded ? null : record.id); setFormError(null); }}
                    >
                      {expanded ? 'Close' : 'Prepare correction'}
                    </Button>
                  ) : null}
                </div>
                {expanded ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <label className="block text-2xs uppercase tracking-wide text-muted-foreground">
                      Operator reason
                      <textarea
                        aria-label="Operator reason"
                        className="mt-1 block min-h-16 w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Why is this correction safe?"
                      />
                    </label>
                    <label className="mt-2 block text-2xs uppercase tracking-wide text-muted-foreground">
                      Acknowledged correction operation ID
                      <input
                        aria-label="Acknowledged correction operation ID"
                        className="mt-1 block w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground"
                        value={correctionOperationId}
                        onChange={(event) => setCorrectionOperationId(event.target.value)}
                        placeholder="UUID from the onsite correction"
                      />
                    </label>
                    <label className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                      I confirm the linked correction was applied onsite and acknowledged by cloud; the rejected operation remains immutable.
                    </label>
                    {formError ? <p role="alert" className="mt-2 text-xs text-destructive">{formError}</p> : null}
                    <div className="mt-3 flex justify-end">
                      <Button size="xs" disabled={sync.busyId === record.id} onClick={() => void submit(record)}>
                        {sync.busyId === record.id ? 'Recording…' : 'Record correction'}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
