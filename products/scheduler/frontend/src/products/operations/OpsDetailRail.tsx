/**
 * OpsDetailRail — the right-rail detail for the unified Operations surface.
 *
 * Click a block or row → this rail shows the selected match's details. What
 * it offers depends on the surface (a match is a match, but Courts plans and
 * Live runs):
 *   - Live + bracket → the real `MatchDetailPanel` (Start, set-by-set score
 *     entry, winner, Undo start, inline F3 conflict) — reused wholesale.
 *   - Live + meet → the command-queue lifecycle (Call / Start / Finish).
 *   - Courts (either engine) → read-only details (no run actions; Courts is
 *     for scheduling, not running).
 * The bracket id is synced into `uiStore.bracketSelectedMatchId` by the
 * parent so `MatchDetailPanel` (which reads it from the store) stays in sync.
 *
 * Pure pane CONTENT. `OperationsProduct` mounts it inside a `DetailPanel`
 * (identity header, close, dismissal) inside a `DetailDock` (width, narrow
 * fallback). Groups are `DetailPanel.Section`; label/value pairs are `Row`
 * from the settings grammar. It was one `space-y-3 p-4` stack with no
 * headings, no rules and no eyebrow.
 */
import type { BracketTournamentDTO } from '../../api/bracketDto';
import { MatchDetailPanel } from '../bracket/MatchDetailPanel';
import { EYEBROW_CLASS, INTERACTIVE_BASE } from '../../lib/utils';
import type { OpsBlock } from './opsBlock';
import type { OperationalAction } from './operationalWriteback';
import { SourceChip } from '../../components/SourceChip';
import { DetailPanel } from '../../components/control-plane';
import { Row } from '../../platform/settings/SettingsControls';

const actionBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center rounded border border-border bg-card ` +
  `px-2 py-1 text-2xs font-medium text-card-foreground hover:bg-muted/40 hover:text-foreground`;
const primaryBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center rounded bg-accent px-2 py-1 ` +
  `text-2xs font-medium text-accent-ink shadow-glow transition-[filter] duration-fast ease-brand hover:brightness-110`;

interface Props {
  block: OpsBlock | null;
  data: BracketTournamentDTO | null;
  onBracketChange: (dto: BracketTournamentDTO) => void;
  onAction: (block: OpsBlock, action: OperationalAction) => void;
  /** Live surfaces run matches (action buttons); Courts is read-only detail. */
  live: boolean;
}

function stateLabel(block: OpsBlock): string {
  if (block.done) return 'Done';
  if (block.started) return 'In progress';
  return block.court != null ? 'Scheduled' : 'Awaiting court';
}

export function OpsDetailRail({ block, data, onBracketChange, onAction, live }: Props) {
  if (!block) {
    return (
      <aside className="w-full p-4 text-sm text-muted-foreground">
        Select a match to see details.
      </aside>
    );
  }

  // Live + bracket → the rich bracket rail verbatim (Start / Sets / winner / undo).
  if (live && block.source === 'bracket') {
    if (!data) {
      return <aside className="w-full p-4 text-sm text-muted-foreground">Loading bracket…</aside>;
    }
    return <MatchDetailPanel data={data} onChange={onBracketChange} />;
  }

  const showActions = live && block.source === 'meet' && !block.done;

  return (
    // Keyed by the match key so switching selection re-mounts the rail and
    // re-triggers `sw-panel-in`; a background poll re-render keeps the same
    // key (block identity may change, its key doesn't) so it never re-fires.
    <aside key={block.key} className="w-full sw-panel-in">
      <DetailPanel.Section
        eyebrow="Status"
        right={<SourceChip source={block.source} />}
        testId="ops-rail-status"
      >
        <Row
          label="State"
          control={
            <span
              className={`${EYEBROW_CLASS} ${block.done ? 'text-status-done' : 'text-muted-foreground'}`}
            >
              {stateLabel(block)}
            </span>
          }
        />
        <Row
          label="Court"
          control={
            <span className="sw-num text-sm text-foreground">
              {block.court != null ? `C${block.court}` : 'Not on a court'}
            </span>
          }
        />
        <Row
          label="Slot"
          control={
            <span className="sw-num text-sm text-foreground">
              {block.court != null ? block.slot : 'Not planned'}
            </span>
          }
          last
        />
      </DetailPanel.Section>

      <DetailPanel.Section eyebrow="Players" testId="ops-rail-players">
        <div className="space-y-1">
          <div className="text-sm text-foreground">{block.sideA}</div>
          <div className={`${EYEBROW_CLASS} text-muted-foreground`}>vs</div>
          <div className="text-sm text-foreground">{block.sideB}</div>
        </div>
      </DetailPanel.Section>

      {showActions ? (
        <DetailPanel.Section eyebrow="Actions" testId="ops-rail-actions">
          <div className="flex flex-wrap gap-2">
            {block.started ? (
              <button type="button" className={actionBtn} onClick={() => onAction(block, { kind: 'finish' })}>
                Finish match
              </button>
            ) : (
              <>
                {block.status !== 'called' && (
                  <button type="button" className={actionBtn} onClick={() => onAction(block, { kind: 'call' })}>
                    Call to court
                  </button>
                )}
                <button type="button" className={primaryBtn} onClick={() => onAction(block, { kind: 'start' })}>
                  Start match
                </button>
              </>
            )}
          </div>
        </DetailPanel.Section>
      ) : null}
    </aside>
  );
}
