/**
 * Workspace preview panel — the Hub's detail pane for the SELECTED row.
 *
 * Reduced to what a preview is for (D2): identity, when and where the event
 * is, the one exception worth acting on, and the two doors — Open and
 * Settings. Selecting a row opens this panel and does not navigate; opening
 * is always an explicit click, and always lands on the Overview.
 *
 * What used to be here and is not any more: a module inventory (four rows of
 * on/available for a question the director is not asking while choosing a
 * tournament), a readiness checklist with a progress bar, a metric triplet and
 * an "Up next" match list. Every one of those is a fact about the INSIDE of a
 * workspace, stated in full by the workspace's own Overview — the panel was a
 * second, smaller, permanently-lagging copy of that page.
 *
 * It is a `DetailPanel` hosted by the Hub's `DetailDock`: one dock geometry,
 * one eyebrow spelling, and a narrow-width fallback that presents the pane as
 * a dialog rather than deleting it.
 */
import { Button } from '@scheduler/design-system';
import type { TournamentSummaryDTO } from '../../api/dto';
import { StatusPill } from '../../components/StatusPill';
import { attentionReasons } from './hubSignals';
import { formatEventRange } from './workspaceLabel';
import { workspaceStatusLabel } from './workspaceStatus';
import { DetailPanel } from '../../components/control-plane/DetailPanel';
import { MODULE_LABELS } from '../../platform/product-shell/types';

interface InspectorProps {
  tournament: TournamentSummaryDTO | null;
  /** "Now", injected so the panel's status can never disagree with the row's. */
  now: Date;
  onOpen: (id: string) => void;
  onSettings: (id: string) => void;
  /** Clear the selection. The pane's × and Escape both route here. */
  onClose: () => void;
}

export function WorkspaceInspector({
  tournament,
  now,
  onOpen,
  onSettings,
  onClose,
}: InspectorProps) {
  // The pane COLLAPSES until a selection exists — the list gets the full
  // width instead of a third of the screen spelling out one gray sentence.
  if (!tournament) return null;

  const status = workspaceStatusLabel(tournament, now);
  const dates = formatEventRange(tournament);
  // ONE exception, not a list: the panel is a preview, and the leading reason
  // is what decides whether this is the workspace to open. The rest are named
  // inside it.
  const exception = attentionReasons(tournament)[0] ?? null;

  return (
    <DetailPanel
      label="Workspace"
      value={tournament.name || 'Untitled'}
      sub={MODULE_LABELS[tournament.kind === 'bracket' ? 'bracket' : 'meet']}
      onClose={onClose}
      testId="workspace-inspector"
    >
      {/* Actions lead — the pane exists to be acted on, not read. One primary
          (Open, the same destination the row's Open button has) and one
          secondary. */}
      <div className="flex gap-2 border-b border-border p-4">
        <Button className="flex-1" onClick={() => onOpen(tournament.id)}>
          Open
        </Button>
        <Button
          variant="outline"
          className="shrink-0"
          onClick={() => onSettings(tournament.id)}
        >
          Settings
        </Button>
      </div>

      <DetailPanel.Section
        eyebrow="Event"
        right={
          <StatusPill tone={status === 'Live' ? 'green' : 'routine'} className="shrink-0">
            {status}
          </StatusPill>
        }
      >
        <dl className="space-y-1.5 text-xs">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-text-muted">Dates</dt>
            <dd data-testid="inspector-dates" className="sw-num text-foreground">
              {dates ?? 'No date set'}
            </dd>
          </div>
          {tournament.timeZone ? (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-text-muted">Time zone</dt>
              <dd className="text-foreground">{tournament.timeZone}</dd>
            </div>
          ) : null}
        </dl>
      </DetailPanel.Section>

      {exception ? (
        <DetailPanel.Section eyebrow="Needs attention" testId="inspector-attention">
          <p className="text-xs text-status-warning-fg">{exception.label}</p>
        </DetailPanel.Section>
      ) : null}
    </DetailPanel>
  );
}
