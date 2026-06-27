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

const RAIL = 'w-72 flex-shrink-0 space-y-3 overflow-auto border-l border-border p-4';

interface Props {
  block: OpsBlock | null;
  data: BracketTournamentDTO | null;
  onBracketChange: (dto: BracketTournamentDTO) => void;
  onAction: (block: OpsBlock, action: OperationalAction) => void;
  /** Live surfaces run matches (action buttons); Courts is read-only detail. */
  live: boolean;
}

function Identity({ block }: { block: OpsBlock }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <SourceChip source={block.source} />
        <span className="font-mono text-2xs uppercase tracking-[0.18em] text-muted-foreground">{block.label}</span>
      </div>
      <div className="font-mono text-sm">{block.court != null ? `Court C${block.court} · slot ${block.slot}` : 'Not scheduled'}</div>
      <div className="space-y-1">
        <div className="text-sm">{block.sideA}</div>
        <div className="text-2xs uppercase tracking-[0.18em] text-muted-foreground">vs</div>
        <div className="text-sm">{block.sideB}</div>
      </div>
    </>
  );
}

export function OpsDetailRail({ block, data, onBracketChange, onAction, live }: Props) {
  if (!block) {
    return <aside className={`${RAIL} text-sm text-muted-foreground`}>Select a match to see details.</aside>;
  }

  // Live + bracket → the rich bracket rail verbatim (Start / Sets / winner / undo).
  if (live && block.source === 'bracket') {
    if (!data) return <aside className={`${RAIL} text-sm text-muted-foreground`}>Loading bracket…</aside>;
    return <MatchDetailPanel data={data} onChange={onBracketChange} />;
  }

  return (
    <aside className={RAIL}>
      <Identity block={block} />
      {block.done ? (
        <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-status-done">Done</div>
      ) : live && block.source === 'meet' ? (
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
      ) : (
        <div className="text-2xs uppercase tracking-[0.18em] text-muted-foreground">
          {block.started ? 'In progress' : block.court != null ? 'Scheduled' : 'Awaiting court'}
        </div>
      )}
    </aside>
  );
}
