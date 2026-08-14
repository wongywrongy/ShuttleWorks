import { useEffect, useState } from 'react';
import { Button } from '@scheduler/design-system';
import { Select } from '@scheduler/design-system/components';
import { FieldRow, Row, Section } from '../../platform/settings/SettingsControls';
import { StatusPill } from '../../components/StatusPill';
import { lifecycleBadge } from '../../platform/domain/lifecycle';
import { apiClient } from '../../api/client';
import type { TournamentStatus, TournamentSummaryDTO } from '../../api/dto';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
] as const;


/** General workspace settings: name, date, lifecycle status. Persists via
 *  `updateTournament`.
 *
 *  Defect D6: this pane showed "Draft" under the heading "Status" while the
 *  shell header and the Hub showed LIVE for the same workspace. Neither number
 *  was stale — they are two different facts sharing one word. `status` is the
 *  stored column an operator sets here; every other surface's "status" is
 *  `lifecycleBadge(signals.phase, status)`, the DERIVED state, and a workspace
 *  with matches in play reads Live whatever the column says.
 *
 *  This pane was the one out of step, so the derived badge now sits beside the
 *  control that writes the column. The select is labelled for what it actually
 *  edits, and the two can no longer appear to contradict each other: they are
 *  visibly two things, next to each other, in the one place both are true. */
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

  // The SAME derivation the shell header and the Hub run — imported, not
  // re-implemented, so a fourth precedence order can't creep in. Surfaced only
  // when it DISAGREES with the stored column: "Archived / archived" is one fact
  // said twice, and a badge restating the control beside it is noise.
  const derived = lifecycleBadge(summary?.signals?.phase, summary?.status);
  const derivedDiffers =
    derived != null && derived.text.toLowerCase() !== summary?.status;

  return (
    <div className="max-w-3xl p-6">
      {/* H1 echoes the nav label verbatim (G1); the workspace name already
          lives in the header chrome, so it is not repeated here. */}
      <h2 className="pb-4 text-base font-semibold tracking-tight text-foreground">Settings</h2>
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
          label="Lifecycle"
          last
          control={
            <span className="inline-flex items-center gap-2">
              {derivedDiffers && derived ? (
                <span data-testid="general-derived-status">
                  <StatusPill tone={derived.tone} dot>
                    {derived.text}
                  </StatusPill>
                </span>
              ) : null}
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as TournamentStatus)}
                options={STATUS_OPTIONS}
                ariaLabel="Workspace status"
                size="sm"
                triggerStyle={{ width: '180px' }}
              />
            </span>
          }
        />
      </Section>
      {derivedDiffers && derived ? (
        <p className="pt-2 text-xs text-muted-foreground" data-testid="general-derived-note">
          The Hub and this workspace&rsquo;s header show{' '}
          <span className="font-medium text-foreground">{derived.text}</span>, derived from its
          matches. The setting above is the stored lifecycle value; it does not override what
          the rest of the app derives.
        </p>
      ) : null}
      <div className="pt-5">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
