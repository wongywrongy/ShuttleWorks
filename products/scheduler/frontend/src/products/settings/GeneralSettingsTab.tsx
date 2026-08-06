import { useEffect, useState } from 'react';
import { Button } from '@scheduler/design-system';
import { Select } from '@scheduler/design-system/components';
import { FieldRow, Row, Section } from '../../platform/settings/SettingsControls';
import { apiClient } from '../../api/client';
import type { TournamentStatus, TournamentSummaryDTO } from '../../api/dto';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
] as const;


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
    <div className="max-w-3xl p-6">
      <Section title="Workspace details" defaultOpen>
        {/* Free text takes a FieldRow; a fixed-option control takes a Row.
            This pane used to hand-roll both as stacked <label> blocks. */}
        <FieldRow
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Workspace name"
        />
        <FieldRow
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Workspace date"
        />
        <Row
          label="Status"
          last
          control={
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as TournamentStatus)}
              options={STATUS_OPTIONS}
              ariaLabel="Workspace status"
              size="sm"
              triggerStyle={{ width: '180px' }}
            />
          }
        />
      </Section>
      <div className="pt-5">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
