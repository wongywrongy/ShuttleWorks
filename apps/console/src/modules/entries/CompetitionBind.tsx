import { useState } from 'react';
import { Button, Modal } from '@scheduler/design-system';
import { apiClient } from '../../api/client';
import type { EntryBindResultDTO } from '../../api/dto';

export function CompetitionBind({ tid, onBound }: { tid: string; onBound: (result: EntryBindResultDTO) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [registrations, setRegistrations] = useState<Awaited<ReturnType<typeof apiClient.listRegistrationEvents>>>([]);
  const [events, setEvents] = useState<Awaited<ReturnType<typeof apiClient.listCompetitionEvents>>>([]);
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [code, setCode] = useState('');
  const [format, setFormat] = useState('singles');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const field = 'mt-1 block w-full rounded border border-border bg-background p-2';
  async function load() {
    const [registration, competition] = await Promise.all([apiClient.listRegistrationEvents(tid), apiClient.listCompetitionEvents(tid)]);
    setRegistrations(registration); setEvents(competition);
  }
  async function run(operation: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await operation(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update competition settings. Reload and retry.'); }
    finally { setBusy(false); }
  }
  return <>
    <Button size="xs" variant="outline" onClick={() => { setOpen(true); void run(load); }}>Bind options</Button>
    {open ? <Modal titleId="competition-bind-title" onClose={() => setOpen(false)} locked={busy} widthClass="max-w-md">
      <div className="space-y-4 p-5">
        <h2 id="competition-bind-title" className="text-sm font-semibold">Bind registrations</h2>
        <label className="block text-xs">Registration event
          <select className={field} value={source} disabled={busy} onChange={(e) => { setSource(e.target.value); setTarget(registrations.find((r) => r.id === e.target.value)?.competitionEventId ?? ''); }}>
            <option value="">All registration events</option>
            {registrations.map((e) => <option key={e.id} value={e.id}>{e.code}</option>)}
          </select>
        </label>
        <label className="block text-xs">Competition destination
          <select className={field} value={target} disabled={busy} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Use each registration event's default</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.categoryCode}</option>)}
          </select>
        </label>
        {source ? <Button size="xs" variant="outline" disabled={busy} onClick={() => void run(async () => {
          const entryEvent = registrations.find((e) => e.id === source)!;
          await apiClient.setCompetitionDefault(tid, source, target || null, entryEvent.version); await load();
        })}>Save default destination</Button> : null}
        <details className="text-xs"><summary>Create a competition event</summary>
          <div className="mt-3 space-y-2">
            <label className="block">Event code<input className={field} value={code} onChange={(e) => setCode(e.target.value)} /></label>
            <label className="block">Format<select className={field} value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="singles">Singles</option><option value="doubles">Doubles</option><option value="mixed">Mixed doubles</option>
            </select></label>
            <Button size="xs" disabled={busy || !code.trim()} onClick={() => void run(async () => {
              const created = await apiClient.createCompetitionEvent(tid, {categoryCode: code.trim(), formatKey: format, bracketEventId: code.trim(), meetEventId: code.trim()});
              await load(); setTarget(created.id); setCode('');
            })}>Create event</Button>
          </div>
        </details>
        <p className="text-xs text-muted-foreground">Only confirmed registrations are bound. Existing memberships keep their current destination; use Move to change one.</p>
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Close</Button>
          <Button disabled={busy} onClick={() => void run(async () => { await onBound(await apiClient.bindEntries(tid, source || undefined, target || undefined)); setOpen(false); })}>Bind selected event</Button>
        </div>
      </div>
    </Modal> : null}
  </>;
}
