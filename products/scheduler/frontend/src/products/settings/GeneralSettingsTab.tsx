import { useEffect, useState } from 'react';
import { Button } from '@scheduler/design-system';
import { apiClient } from '../../api/client';
import type { TournamentStatus, TournamentSummaryDTO } from '../../api/dto';

const INPUT =
  'mt-1 w-full rounded border border-border bg-background px-3 py-2 text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40';

/** General workspace settings: name, date, lifecycle status. Persists via
 *  `updateTournament`. */
export function GeneralSettingsTab({
  tid,
  summary,
  onSaved,
}: {
  tid: string;
  summary: TournamentSummaryDTO | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [status, setStatus] = useState<TournamentStatus>('draft');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (summary) {
      setName(summary.name ?? '');
      setDate(summary.tournamentDate ?? '');
      setStatus(summary.status);
    }
  }, [summary]);

  async function save() {
    setSaving(true);
    try {
      await apiClient.updateTournament(tid, {
        name: name.trim() || null,
        tournamentDate: date || null,
        status,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4 p-6">
      <div>
        <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          GENERAL
        </div>
        <h2 className="mt-1 text-base font-semibold text-foreground">Workspace details</h2>
      </div>
      <label className="block">
        <span className="text-sm text-muted-foreground">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Workspace name"
          className={INPUT}
        />
      </label>
      <label className="block">
        <span className="text-sm text-muted-foreground">Date</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Workspace date"
          className={INPUT}
        />
      </label>
      <label className="block">
        <span className="text-sm text-muted-foreground">Status</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as TournamentStatus)}
          aria-label="Workspace status"
          className={INPUT}
        >
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </label>
      <Button onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save changes'}
      </Button>
    </div>
  );
}
