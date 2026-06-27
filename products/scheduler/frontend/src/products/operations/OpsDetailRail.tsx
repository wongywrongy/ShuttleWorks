/**
 * OpsDetailRail — the right-rail detail for the unified Operations surface.
 *
 * Click a block or row → this rail shows the selected match's details +
 * actions. A match is a match, but the rich detail differs by engine:
 *   - bracket → the real `MatchDetailPanel` (Start, set-by-set score entry,
 *     winner, Undo start, inline conflict) — reused wholesale, so Sets
 *     scoring and undo come for free.
 *   - meet → a parallel rail with the meet lifecycle (Call / Start / Finish)
 *     routed through the command queue.
 * The bracket id is synced into `uiStore.bracketSelectedMatchId` by the
 * parent so `MatchDetailPanel` (which reads it from the store) stays in sync.
 */
import type { BracketTournamentDTO } from '../../api/bracketDto';
import { MatchDetailPanel } from '../bracket/MatchDetailPanel';
import { INTERACTIVE_BASE } from '../../lib/utils';
import type { OpsBlock } from './opsBlock';
import type { OperationalAction } from './operationalWriteback';
import { SourceChip } from './SourceChip';

const actionBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center rounded border border-border bg-card ` +
  `px-2 py-1 text-2xs font-medium text-card-foreground hover:bg-muted/40 hover:text-foreground`;
const primaryBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center rounded bg-primary px-2 py-1 ` +
  `text-2xs font-medium text-primary-foreground hover:opacity-90`;

interface Props {
  block: OpsBlock | null;
  data: BracketTournamentDTO | null;
  onBracketChange: (dto: BracketTournamentDTO) => void;
  onAction: (block: OpsBlock, action: OperationalAction) => void;
}

export function OpsDetailRail({ block, data, onBracketChange, onAction }: Props) {
  if (!block) {
    return (
      <aside className="w-72 flex-shrink-0 border-l border-border p-4 text-sm text-muted-foreground">
        Select a match to see details.
      </aside>
    );
  }

  if (block.source === 'bracket') {
    // Reuse the bracket rail verbatim (it reads the selected id from the
    // store, which the parent keeps in sync). Falls back if data is absent.
    if (!data) {
      return (
        <aside className="w-72 flex-shrink-0 border-l border-border p-4 text-sm text-muted-foreground">
          Loading bracket…
        </aside>
      );
    }
    return <MatchDetailPanel data={data} onChange={onBracketChange} />;
  }

  // Meet rail — lifecycle through the command queue.
  return (
    <aside className="w-72 flex-shrink-0 space-y-3 overflow-auto border-l border-border p-4">
      <div className="flex items-center gap-2">
        <SourceChip source="meet" />
        <span className="font-mono text-2xs uppercase tracking-[0.18em] text-muted-foreground">{block.label}</span>
      </div>
      <div className="font-mono text-sm">
        {block.court != null ? `Court C${block.court} · slot ${block.slot}` : '—'}
      </div>
      <div className="space-y-1">
        <div className="text-sm">{block.sideA}</div>
        <div className="text-2xs uppercase tracking-[0.18em] text-muted-foreground">vs</div>
        <div className="text-sm">{block.sideB}</div>
      </div>
      {block.done ? (
        <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-status-done">Done</div>
      ) : (
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
      )}
    </aside>
  );
}
