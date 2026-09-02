import { useEffect, useState } from 'react';
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
  const [capability, setCapability] = useState('');
  const [actorId, setActorId] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [correction, setCorrection] = useState('{}');
  const [confirmed, setConfirmed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const sync = useSyncQuarantine(authority?.authority_epoch ?? null, capability);

  useEffect(() => {
    if (!actorId && authority?.node_id) setActorId(authority.node_id);
  }, [actorId, authority?.node_id]);

  if (!authority) return null;
  const activeAuthority = authority;

  async function submit(record: SyncQuarantineRecord) {
    if (!reason.trim()) {
      setFormError('Add an operator reason before recording the correction.');
      return;
    }
    if (!confirmed) {
      setFormError('Confirm that the correction will append an audited operation.');
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(correction);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
      parsed = value as Record<string, unknown>;
    } catch {
      setFormError('Correction must be a JSON object.');
      return;
    }
    if (!actorId.trim()) {
      setFormError('Enter the operator actor ID.');
      return;
    }
    setFormError(null);
    try {
      await sync.resolve(record.id, {
        node_id: activeAuthority.node_id,
        authority_epoch: activeAuthority.authority_epoch,
        actor_id: actorId.trim(),
        reason: reason.trim(),
        correction: parsed,
      });
      setOpenId(null);
      setReason('');
      setCorrection('{}');
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
            Rejected operations stay immutable. Corrections append an audited operation for this authority epoch.
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

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-2xs uppercase tracking-wide text-muted-foreground">
          Node capability
          <input
            aria-label="Node capability"
            className="mt-1 block w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
            type="password"
            value={capability}
            onChange={(event) => setCapability(event.target.value)}
            placeholder="Paste capability to inspect evidence"
          />
        </label>
        <label className="text-2xs uppercase tracking-wide text-muted-foreground">
          Operator actor ID
          <input
            aria-label="Operator actor ID"
            className="mt-1 block w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
            value={actorId}
            onChange={(event) => setActorId(event.target.value)}
            placeholder="UUID recorded in the correction"
          />
        </label>
      </div>

      {!capability.trim() ? (
        <p className="mt-3 rounded border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
          Enter the node capability to load quarantined operations for epoch {authority.authority_epoch}.
        </p>
      ) : sync.loading && sync.items.length === 0 ? (
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
                      Correction JSON
                      <textarea
                        aria-label="Correction JSON"
                        className="mt-1 block min-h-16 w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground"
                        value={correction}
                        onChange={(event) => setCorrection(event.target.value)}
                      />
                    </label>
                    <label className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                      I understand this appends an audited correction operation and does not edit the rejected operation.
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
