import { PropertyPanel } from '../../components/control-plane/PropertyPanel';
import { Row, Section } from '../../platform/engine-config/SettingsControls';
import { StatusPill } from '../../components/StatusPill';
import { lifecycleBadge } from '../../platform/domain/lifecycle';
import { resolvePhase, PHASE_LABEL } from '../../platform/domain/overviewPhase';
import type { TournamentSummaryDTO } from '../../api/dto';
import { TEXT_MUTED_SM } from '../../lib/utils'

/** Workspace administration. Tournament properties are edited in Setup.
 *
 *  Lifecycle is DISPLAY-ONLY here (SP-CONSOLE-REFINE A6.1): the app derives
 *  it from match state (`lifecycleBadge`), and the stored-status dropdown this
 *  pane used to carry was a control the rest of the app ignored — exposing it
 *  invited the operator to "set" a state that nothing obeyed. The one explicit
 *  lifecycle action is Archive / Unarchive in the danger zone below. */
export function GeneralSettingsTab({
  tid,
  summary,
}: {
  tid: string;
  summary: TournamentSummaryDTO | null;
  onSaved: () => void;
}) {
  // The SAME derivation the shell header and the Hub run — imported, not
  // re-implemented, so a fourth precedence order can't creep in.
  const derived = summary
    ? (lifecycleBadge(summary.signals?.phase, summary.status) ?? {
        text: PHASE_LABEL[resolvePhase(summary)],
        tone: 'idle' as const,
      })
    : null;

  return (
    <PropertyPanel>
      {/* H1 echoes the nav label verbatim (G1); the workspace name already
          lives in the header chrome, so it is not repeated here.

          Save sits on the page-header row, not in the first section's action
          slot. In the slot it hung mid-page beside a collapsible heading while
          the row above it sat empty, and it looked like it saved that one
          section rather than the page (ACC-1). This is also where every other
          primary action on every other surface lives. */}
      <div className="flex items-center justify-between gap-4 pb-4">
        <h2 className="text-page font-semibold tracking-tight text-foreground">
          Workspace settings
        </h2>
      </div>
      <Section title="Workspace details" defaultOpen>
        <dl className="space-y-4 py-4 text-sm">
          <div><dt className="text-muted-foreground">Tournament name</dt><dd className="mt-1">{summary?.name ?? 'Loading…'}</dd></div>
          <div><dt className="text-muted-foreground">Tournament date</dt><dd className="mt-1">{summary?.tournamentDate ?? 'Not set'}</dd></div>
        </dl>
        <div className="flex gap-4 pb-4 text-sm">
          <a className="text-accent underline" href={`/tournaments/${encodeURIComponent(tid)}/setup/general`}>Edit tournament properties</a>
          <a className="text-accent underline" href={`/tournaments/${encodeURIComponent(tid)}/setup/dates`}>Edit dates</a>
        </div>
        <Row
          label="Lifecycle"
          last
          control={
            derived ? (
              <span data-testid="general-lifecycle">
                {/* LIVE drops its chip (R-D, Option A) but keeps its word —
                    an empty labeled row would read as broken, not quiet. */}
                {derived.text === 'Live' ? (
                  <span className={TEXT_MUTED_SM}>Live</span>
                ) : (
                  <StatusPill tone={derived.tone}>
                    {derived.text}
                  </StatusPill>
                )}
              </span>
            ) : null
          }
        />
      </Section>
      <p className="pt-2 text-xs text-muted-foreground">
        To retire the workspace, use Archive below.
      </p>
    </PropertyPanel>
  );
}
