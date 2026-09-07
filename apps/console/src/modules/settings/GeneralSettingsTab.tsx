import { PropertyPanel } from '../../components/control-plane/PropertyPanel';
import { Row, Section } from '../../platform/engine-config/SettingsControls';
import { StatusPill } from '../../components/StatusPill';
import { lifecycleBadge } from '../../platform/domain/lifecycle';
import { resolvePhase, PHASE_LABEL } from '../../platform/domain/overviewPhase';
import type { TournamentSummaryDTO } from '../../api/dto';
import { TEXT_MUTED_SM } from '../../lib/utils'

/** Workspace administration: the workspace's own state, not the event's.
 *
 *  The read-only "Tournament name / Tournament date" pair and its two "Edit
 *  tournament properties" / "Edit dates" links are gone: both links went to
 *  the same place (Setup · Details), which is also where those two facts are
 *  edited — so this page restated two fields it could not change in order to
 *  offer twice the same way to leave. The workspace name is in the shell
 *  header on every page of the workspace.
 *
 *  Lifecycle is DISPLAY-ONLY here (SP-CONSOLE-REFINE A6.1): the app derives
 *  it from match state (`lifecycleBadge`), and the stored-status dropdown this
 *  pane used to carry was a control the rest of the app ignored — exposing it
 *  invited the operator to "set" a state that nothing obeyed. The one explicit
 *  lifecycle action is Archive / Unarchive in the danger zone below. */
export function GeneralSettingsTab({
  summary,
}: {
  tid: string;
  summary: TournamentSummaryDTO | null;
  onSaved: () => void;
}) {
  // The SAME derivation the shell header and the Hub run — imported, not
  // re-implemented, so a fourth precedence order can't creep in.
  // R3 (v3 consolidated plan, package 07): every lifecycle word this row can
  // show — Live, Complete, Archived, or a resting phase label — is an
  // ordinary domain fact, never an exception, so the pill always renders as
  // plain ink (`routine`), not a tinted container.
  const derived = summary
    ? {
        text: lifecycleBadge(summary.signals?.phase, summary.status)?.text
          ?? PHASE_LABEL[resolvePhase(summary)],
        tone: 'routine' as const,
      }
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
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          Workspace settings
        </h2>
      </div>
      <Section title="Status" defaultOpen>
        <Row
          label="Tournament status"
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
        Archive this workspace to remove it from the active list.
      </p>
    </PropertyPanel>
  );
}
