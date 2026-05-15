/**
 * Right rail for the Live tab. Shows the selected match's details +
 * operator actions (Start / A wins / B wins).
 *
 * Actions are limited to what the bracket API supports:
 *   matchAction: 'start' | 'finish' | 'reset'
 *   recordResult: winner_side 'A' | 'B'
 * Call and Postpone are not available in the bracket API surface and
 * are therefore not surfaced here.
 */
import { useBracketApi } from '../../api/bracketClient';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import { useUiStore } from '../../store/uiStore';
import { INTERACTIVE_BASE } from '../../lib/utils';

interface Props {
  data: BracketTournamentDTO;
  onChange: (t: BracketTournamentDTO) => void;
}

// Shared hand-rolled button styles (mirror meet's MatchDetailsPanel pattern).
const actionBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center gap-1 rounded border border-border ` +
  `bg-card px-2 py-1 text-2xs font-medium text-card-foreground ` +
  `hover:bg-muted/40 hover:text-foreground ` +
  `disabled:cursor-not-allowed disabled:opacity-50`;

const primaryActionBtn =
  `${INTERACTIVE_BASE} inline-flex items-center justify-center gap-1 rounded ` +
  `bg-primary px-2 py-1 text-2xs font-medium text-primary-foreground ` +
  `hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50`;

export function MatchDetailPanel({ data, onChange }: Props) {
  const api = useBracketApi();
  const matchId = useUiStore((s) => s.bracketSelectedMatchId);

  if (!matchId) {
    return (
      <aside className="w-72 flex-shrink-0 border-l border-border p-4 text-sm text-muted-foreground">
        Select a match to see details.
      </aside>
    );
  }

  const pu = data.play_units.find((p) => p.id === matchId);
  const assignment = data.assignments.find((a) => a.play_unit_id === matchId);
  const result = data.results.find((r) => r.play_unit_id === matchId);

  if (!pu) {
    return (
      <aside className="w-72 flex-shrink-0 border-l border-border p-4 text-sm text-muted-foreground">
        Match not found.
      </aside>
    );
  }

  const nameById = Object.fromEntries(data.participants.map((p) => [p.id, p.name]));
  const labelA = (pu.side_a ?? []).map((id) => nameById[id] ?? id).join(' / ') || '—';
  const labelB = (pu.side_b ?? []).map((id) => nameById[id] ?? id).join(' / ') || '—';

  return (
    <aside className="w-72 flex-shrink-0 border-l border-border p-4 space-y-3 overflow-auto">
      {/* Match id eyebrow */}
      <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {pu.id}
      </div>

      {/* Court + slot */}
      <div className="text-sm font-mono">
        {assignment
          ? `Court C${assignment.court_id} · slot ${assignment.slot_id}`
          : '—'}
      </div>

      {/* Participants */}
      <div className="space-y-1">
        <div className="text-sm">{labelA}</div>
        <div className="text-2xs uppercase tracking-wider text-muted-foreground">vs</div>
        <div className="text-sm">{labelB}</div>
      </div>

      {/* Result summary (when finished) */}
      {result && (
        <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Done — side {result.winner_side} wins
        </div>
      )}

      {/* Operator actions */}
      <div className="flex flex-wrap gap-2">
        {/* Start — available when assigned, not yet started, no result */}
        {assignment && !assignment.started && !result && (
          <button
            type="button"
            className={primaryActionBtn}
            onClick={async () => {
              onChange(await api.matchAction({ play_unit_id: matchId, action: 'start' }));
            }}
          >
            Start
          </button>
        )}

        {/* Record result — available when started and no result yet */}
        {assignment?.started && !result && (
          <>
            <button
              type="button"
              className={actionBtn}
              onClick={async () => {
                onChange(
                  await api.recordResult({
                    play_unit_id: matchId,
                    winner_side: 'A',
                    finished_at_slot: assignment.slot_id + assignment.duration_slots,
                  }),
                );
              }}
            >
              A wins
            </button>
            <button
              type="button"
              className={actionBtn}
              onClick={async () => {
                onChange(
                  await api.recordResult({
                    play_unit_id: matchId,
                    winner_side: 'B',
                    finished_at_slot: assignment.slot_id + assignment.duration_slots,
                  }),
                );
              }}
            >
              B wins
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
