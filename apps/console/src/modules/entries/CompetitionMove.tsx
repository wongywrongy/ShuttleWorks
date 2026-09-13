import { useState } from 'react';
import { useConfirmClick } from '../../hooks/useConfirmClick';
import { Modal, Button } from '@scheduler/design-system';
import { apiClient } from '../../api/client';
import type { EntryDTO } from '../../api/dto';

type Event = { id: string; categoryCode: string };
type Unit = { id: string; competitionEventId: string; status: string; version: number; label: string };

export function CompetitionMove({ tid, entry, onMoved }: { tid: string; entry: EntryDTO; onMoved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function show() {
    setOpen(true); setBusy(true); setError(null); setRequestId(crypto.randomUUID());
    try {
      const [available, rosters] = await Promise.all([apiClient.listCompetitionEvents(tid), apiClient.listCompetitionUnits(tid)]);
      setEvents(available); setUnits(rosters); setTarget(entry.competitionEventId ?? ''); setUnit('');
    } catch { setError('Could not load competition rosters. Close and try again.'); }
    finally { setBusy(false); }
  }
  async function move() {
    const source = units.find((u) => u.id === entry.unitId);
    if (!source) { setError('The source unit changed. Close and reload the desk.'); return; }
    setBusy(true); setError(null);
    try {
      await apiClient.rebindEntry(tid, entry.id, {
        competitionEventId: target, unitId: unit || undefined, expectedVersion: source.version,
        targetVersion: units.find((u) => u.id === unit)?.version, requestId,
      });
      await onMoved(); setOpen(false);
    } catch { setError('Could not move this entry. Reload if the roster changed; drawn units cannot be moved.'); }
    finally { setBusy(false); }
  }
  async function withdrawUnit() {
    const source = units.find((u) => u.id === entry.unitId);
    if (!source || busy) return;
    setBusy(true); setError(null);
    try { await apiClient.withdrawCompetitionUnit(tid, source.id, source.version); await onMoved(); setOpen(false); }
    catch { setError('Could not withdraw this unit. Reload the desk and retry.'); }
    finally { setBusy(false); }
  }
  const withdraw = useConfirmClick(() => void withdrawUnit());
  const titleId = `move-entry-${entry.id}`;
  return <>
    <Button size="xs" variant="ghost" onClick={() => void show()}>Move</Button>
    {open ? <Modal onClose={() => setOpen(false)} titleId={titleId} widthClass="max-w-md" locked={busy}>
      <div className="space-y-4 p-5">
        <h2 id={titleId} className="text-sm font-semibold">Move {entry.playerName}</h2>
        <p className="text-xs text-muted-foreground">Move this player's membership to another event or partner. The previous unit remains in the record.</p>
        <label className="block text-xs">Competition event
          <select className="mt-1 block w-full rounded border border-border bg-background p-2" value={target} onChange={(e) => { setTarget(e.target.value); setUnit(''); setRequestId(crypto.randomUUID()); }} disabled={busy}>
            <option value="">Choose event</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.categoryCode}</option>)}
          </select>
        </label>
        <label className="block text-xs">Destination unit
          <select className="mt-1 block w-full rounded border border-border bg-background p-2" value={unit} onChange={(e) => { setUnit(e.target.value); setRequestId(crypto.randomUUID()); }} disabled={busy}>
            <option value="">Create a new unit</option>
            {units.filter((u) => u.competitionEventId === target && u.id !== entry.unitId && u.status === 'pending').map((u) => <option key={u.id} value={u.id}>{u.label || u.id.slice(0, 8)}</option>)}
          </select>
        </label>
        <Button size="xs" variant="outline" disabled={busy} onClick={withdraw.press} onBlur={withdraw.reset}>
          {withdraw.armed ? 'Withdraw entire unit?' : 'Withdraw unit from competition'}
        </Button>
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button disabled={busy || !target} onClick={() => void move()}>Move membership</Button></div>
      </div>
    </Modal> : null}
  </>;
}
