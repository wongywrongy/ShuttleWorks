/**
 * BracketScoreEntry — Sets-mode score capture for a bracket match.
 *
 * Rendered wherever a bracket result is recorded (DrawView, MatchDetailPanel)
 * when the Engine runs in Sets mode. The operator types a set-by-set score;
 * the winner is derived from who took more sets. On Record it emits the
 * winner side plus the played-sets JSON, which the call site forwards to
 * `api.recordResult` (persisted into `BracketResult.score`).
 *
 * In Simple (winner-only) mode the call sites keep their plain win buttons;
 * this component is the Sets-mode branch only.
 */
import { useState } from 'react';
import type { BracketSetScore } from '../../api/bracketDto';
import { emptySets, playedSets, winnerSideFromSets } from './bracketScore';

export function BracketScoreEntry({
  setsToWin,
  labelA,
  labelB,
  onRecord,
  onCancel,
}: {
  setsToWin: number;
  labelA: string;
  labelB: string;
  onRecord: (winner: 'A' | 'B', sets: BracketSetScore[]) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [sets, setSets] = useState<BracketSetScore[]>(() => emptySets(setsToWin));
  const [busy, setBusy] = useState(false);

  const winner = winnerSideFromSets(sets);

  const setScore = (i: number, side: 'sideA' | 'sideB', value: number) =>
    setSets((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, [side]: value } : s)),
    );

  const submit = async () => {
    if (!winner) return;
    setBusy(true);
    try {
      await onRecord(winner, playedSets(sets));
    } finally {
      setBusy(false);
    }
  };

  const inputClasses =
    'h-7 w-12 rounded-sm border border-border bg-bg-elev px-1 text-center text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <div className="space-y-2" data-testid="bracket-score-entry">
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-2xs text-muted-foreground">
        <span />
        <span className="w-12 text-center font-medium">A</span>
        <span className="w-12 text-center font-medium">B</span>
      </div>
      {sets.map((s, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
          <span className="text-2xs text-muted-foreground">Set {i + 1}</span>
          <input
            type="number"
            min={0}
            aria-label={`Set ${i + 1} ${labelA} score`}
            value={s.sideA}
            onChange={(e) => setScore(i, 'sideA', Number(e.target.value))}
            className={inputClasses}
          />
          <input
            type="number"
            min={0}
            aria-label={`Set ${i + 1} ${labelB} score`}
            value={s.sideB}
            onChange={(e) => setScore(i, 'sideB', Number(e.target.value))}
            className={inputClasses}
          />
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={!winner || busy}
          onClick={submit}
          className="inline-flex h-7 items-center rounded-sm bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Record result'}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        ) : null}
        <span className="text-2xs text-muted-foreground">
          {winner
            ? `${winner === 'A' ? labelA : labelB} wins`
            : 'Enter set scores'}
        </span>
      </div>
    </div>
  );
}
