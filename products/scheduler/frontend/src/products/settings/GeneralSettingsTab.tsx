import { useEffect, useState } from 'react';
import { Button } from '@scheduler/design-system';
import { FieldRow, Row, Section } from '../../platform/settings/SettingsControls';
import { StatusPill } from '../../components/StatusPill';
import { lifecycleBadge } from '../../platform/domain/lifecycle';
import { resolvePhase, PHASE_LABEL } from '../../platform/domain/overviewPhase';
import { apiClient } from '../../api/client';
import type { TournamentSummaryDTO } from '../../api/dto';

/** General workspace settings: name and date. Persists via `updateTournament`.
 *
 *  Lifecycle is DISPLAY-ONLY here (SP-CONSOLE-REFINE A6.1): the app derives
 *  it from match state (`lifecycleBadge`), and the stored-status dropdown this
 *  pane used to carry was a control the rest of the app ignored — exposing it
 *  invited the operator to "set" a state that nothing obeyed. The one explicit
 *  lifecycle action is Archive / Unarchive in the danger zone below. */
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (summary) {
      setName(summary.name ?? '');
      setDate(summary.tournamentDate ?? '');
    }
  }, [summary]);

  async function save() {
    setSaving(true);
    try {
      await apiClient.updateTournament(tid, {
        name: name.trim() || null,
        tournamentDate: date || null,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  // The SAME derivation the shell header and the Hub run — imported, not
  // re-implemented, so a fourth precedence order can't creep in.
  const derived = summary
    ? (lifecycleBadge(summary.signals?.phase, summary.status) ?? {
        text: PHASE_LABEL[resolvePhase(summary)],
        tone: 'idle' as const,
      })
    : null;

  return (
    <div className="max-w-3xl p-6">
      {/* H1 echoes the nav label verbatim (G1); the workspace name already
          lives in the header chrome, so it is not repeated here. */}
      <h2 className="pb-4 text-base font-semibold tracking-tight text-foreground">Settings</h2>
      <Section
        title="Workspace details"
        defaultOpen
        action={
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        }
      >
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
            derived ? (
              <span data-testid="general-lifecycle">
                <StatusPill tone={derived.tone} dot>
                  {derived.text}
                </StatusPill>
              </span>
            ) : null
          }
        />
      </Section>
      <p className="pt-2 text-xs text-muted-foreground">
        Lifecycle is derived from match state. To retire the workspace, use Archive below.
      </p>
    </div>
  );
}
