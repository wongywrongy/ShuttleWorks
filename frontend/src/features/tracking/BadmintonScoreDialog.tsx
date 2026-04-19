/**
 * Badminton score dialog — per-set entry with deuce support.
 *
 * Laid out as one row per set (Side A input · Side B input · quick
 * winner buttons), rather than a wide matrix, so it reads top-to-bottom
 * and fits on laptop screens without horizontal scroll.
 */
import { useId, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { INTERACTIVE_BASE } from '../../lib/utils';
import type { SetScore } from '../../api/dto';

interface BadmintonScoreDialogProps {
  matchName: string;
  sideAName: string;
  sideBName: string;
  setsToWin: number; // 1, 2, or 3 (best of 1, 3, or 5)
  pointsPerSet: number; // 11, 15, or 21
  deuceEnabled: boolean;
  onSubmit: (sets: SetScore[], winner: 'A' | 'B', notes: string) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function BadmintonScoreDialog({
  matchName,
  sideAName,
  sideBName,
  setsToWin,
  pointsPerSet,
  deuceEnabled,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: BadmintonScoreDialogProps) {
  const titleId = useId();
  const maxSets = setsToWin * 2 - 1;
  const maxPoints = deuceEnabled ? (pointsPerSet === 21 ? 30 : pointsPerSet + 10) : pointsPerSet;

  const [sets, setSets] = useState<SetScore[]>(() =>
    Array.from({ length: maxSets }, () => ({ sideA: 0, sideB: 0 })),
  );
  const [notes, setNotes] = useState('');

  // Escape + focus trap + backdrop close are handled by the Modal
  // primitive — no ad-hoc keyboard listener here.

  const setWinners = useMemo(() => {
    return sets.map((set) => {
      const { sideA, sideB } = set;
      if (sideA === 0 && sideB === 0) return null;

      const reached = (n: number) => n >= pointsPerSet;
      const twoAhead = (x: number, y: number) => x - y >= 2;

      if (reached(sideA) && sideA > sideB) {
        if (!deuceEnabled || twoAhead(sideA, sideB) || sideA >= maxPoints) return 'A';
      }
      if (reached(sideB) && sideB > sideA) {
        if (!deuceEnabled || twoAhead(sideB, sideA) || sideB >= maxPoints) return 'B';
      }
      return null;
    });
  }, [sets, pointsPerSet, deuceEnabled, maxPoints]);

  const setsWonA = setWinners.filter((w) => w === 'A').length;
  const setsWonB = setWinners.filter((w) => w === 'B').length;
  const matchWinner: 'A' | 'B' | null =
    setsWonA >= setsToWin ? 'A' : setsWonB >= setsToWin ? 'B' : null;

  const updateScore = (setIndex: number, side: 'sideA' | 'sideB', value: number) => {
    setSets((prev) => {
      const next = [...prev];
      const clamped = Math.max(0, Math.min(maxPoints, value));
      const other = side === 'sideA' ? 'sideB' : 'sideA';
      const otherScore = next[setIndex][other];

      next[setIndex] = { ...next[setIndex], [side]: clamped };

      // Loser-first auto-fill.
      // Tournament directors routinely enter the losing side's number
      // and expect the winner to default to "match format won" — which
      // is unambiguous when the entered score is clearly below the
      // deuce threshold (pointsPerSet - 1) and the other side is still
      // untouched. Above the deuce threshold we can't safely guess
      // (could be 22-20, 23-21, etc.), so we leave both sides to the
      // operator in those cases.
      //
      // Runs only when the operator typed a true losing score: strictly
      // positive, below pointsPerSet - 1, and the other side has not
      // been edited yet (is 0).
      if (clamped > 0 && clamped < pointsPerSet - 1 && otherScore === 0) {
        next[setIndex] = { ...next[setIndex], [other]: pointsPerSet };
      }
      return next;
    });
  };

  const setQuickWinner = (setIndex: number, winner: 'A' | 'B') => {
    setSets((prev) => {
      const next = [...prev];
      const loserScore = next[setIndex][winner === 'A' ? 'sideB' : 'sideA'];
      let winnerScore = pointsPerSet;
      if (deuceEnabled && loserScore >= pointsPerSet - 1) {
        winnerScore = Math.min(maxPoints, loserScore + 2);
      }
      next[setIndex] = {
        sideA: winner === 'A' ? winnerScore : loserScore,
        sideB: winner === 'B' ? winnerScore : loserScore,
      };
      return next;
    });
  };

  const clearSet = (setIndex: number) => {
    setSets((prev) => {
      const next = [...prev];
      next[setIndex] = { sideA: 0, sideB: 0 };
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchWinner) return;
    const played = sets.slice(0, setsWonA + setsWonB);
    onSubmit(played, matchWinner, notes);
  };

  return (
    <Modal
      onClose={onCancel}
      titleId={titleId}
      locked={isSubmitting}
      widthClass="max-w-xl"
      panelClassName="w-full max-w-xl rounded-lg bg-white shadow-xl focus:outline-none"
    >
        {/* Header */}
        <div className="flex items-start justify-between rounded-t-lg border-b border-gray-200 bg-gray-50 px-4 py-3">
          <div className="min-w-0">
            <h3 id={titleId} className="truncate text-sm font-semibold text-gray-900">
              Finish {matchName}
            </h3>
            <p className="mt-0.5 text-[11px] text-gray-500">
              Best of {maxSets} · first to {setsToWin} set{setsToWin === 1 ? '' : 's'} ·{' '}
              {pointsPerSet} pts{deuceEnabled ? ` (deuce, cap ${maxPoints})` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="ml-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-600"
            aria-label="Close score dialog"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 px-4 py-3">
          {/* Sides header */}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 text-center">
            <div
              className={`truncate rounded px-2 py-1 text-xs font-semibold ${
                matchWinner === 'A'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-blue-50 text-blue-700'
              }`}
              title={sideAName}
            >
              {sideAName || 'Side A'}
              <span className="ml-1 text-[10px] font-mono text-gray-500">{setsWonA} set{setsWonA === 1 ? '' : 's'}</span>
            </div>
            <div
              className={`truncate rounded px-2 py-1 text-xs font-semibold ${
                matchWinner === 'B'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-rose-50 text-rose-700'
              }`}
              title={sideBName}
            >
              {sideBName || 'Side B'}
              <span className="ml-1 text-[10px] font-mono text-gray-500">{setsWonB} set{setsWonB === 1 ? '' : 's'}</span>
            </div>
          </div>

          {/* Per-set rows */}
          <div className="space-y-1.5">
            {sets.map((set, i) => {
              const wonBy = setWinners[i];
              const matchDecided = matchWinner !== null && i >= setsWonA + setsWonB;
              const rowClass = matchDecided
                ? 'opacity-40 pointer-events-none'
                : wonBy === 'A'
                  ? 'bg-blue-50/60 border-blue-200'
                  : wonBy === 'B'
                    ? 'bg-rose-50/60 border-rose-200'
                    : 'bg-white border-gray-200';
              const scoreInput = (side: 'sideA' | 'sideB', isWinning: boolean) => (
                <input
                  type="number"
                  value={set[side] || ''}
                  onChange={(e) => updateScore(i, side, parseInt(e.target.value) || 0)}
                  min={0}
                  max={maxPoints}
                  disabled={matchDecided}
                  className={`w-full rounded border px-2 py-1.5 text-center text-base font-mono tabular-nums ${
                    isWinning
                      ? 'border-green-400 bg-green-50 font-semibold text-green-800'
                      : 'border-gray-300 bg-white text-gray-800'
                  } focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-200`}
                />
              );
              return (
                <div
                  key={i}
                  className={`grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2 rounded border px-2 py-1.5 ${rowClass}`}
                >
                  <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                    Set {i + 1}
                  </span>
                  {scoreInput('sideA', wonBy === 'A')}
                  <span className="text-xs text-gray-400">–</span>
                  {scoreInput('sideB', wonBy === 'B')}
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setQuickWinner(i, 'A')}
                      // Gate Quick-winner until the operator has entered
                      // at least one side's score. Otherwise a single tap
                      // silently decides the set with A=21, B=0 — a
                      // real-world gotcha reported by live users.
                      disabled={matchDecided || (set.sideA === 0 && set.sideB === 0)}
                      className="rounded border border-blue-200 bg-blue-50 px-1.5 py-1 text-[10px] font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-40"
                      title={
                        set.sideA === 0 && set.sideB === 0
                          ? 'Enter at least one score first'
                          : `Quick: ${sideAName || 'A'} wins`
                      }
                    >
                      A
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickWinner(i, 'B')}
                      disabled={matchDecided || (set.sideA === 0 && set.sideB === 0)}
                      className="rounded border border-rose-200 bg-rose-50 px-1.5 py-1 text-[10px] font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-40"
                      title={
                        set.sideA === 0 && set.sideB === 0
                          ? 'Enter at least one score first'
                          : `Quick: ${sideBName || 'B'} wins`
                      }
                    >
                      B
                    </button>
                    <button
                      type="button"
                      onClick={() => clearSet(i)}
                      disabled={matchDecided || (set.sideA === 0 && set.sideB === 0)}
                      aria-label={`Clear set ${i + 1}`}
                      className="inline-flex items-center justify-center rounded border border-gray-200 bg-gray-50 px-1.5 py-1 text-gray-500 hover:bg-gray-100 disabled:opacity-40"
                      title="Clear this set"
                    >
                      <X aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Winner callout */}
          {matchWinner ? (
            <div
              className="flex items-center justify-center gap-3 rounded bg-green-50 px-3 py-2 text-sm text-green-900"
              role="status"
            >
              <span className="text-[10px] font-semibold uppercase tracking-widest text-green-700">
                Winner
              </span>
              <span className="font-semibold">
                {matchWinner === 'A' ? sideAName || 'Side A' : sideBName || 'Side B'}
              </span>
              <span className="rounded bg-white/60 px-2 py-0.5 font-mono text-xs">
                {setsWonA}–{setsWonB}
              </span>
            </div>
          ) : (
            <div className="rounded border border-dashed border-gray-200 px-3 py-2 text-center text-[11px] text-gray-500">
              Type the losing side's score and the winner auto-fills to {pointsPerSet}. Deuce sets need both scores entered manually. Match decides once someone wins {setsToWin} set{setsToWin === 1 ? '' : 's'}.
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="score-notes">
              Notes <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              id="score-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-200"
              placeholder="Retirement, dispute, umpire notes…"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className={`${INTERACTIVE_BASE} rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !matchWinner}
              aria-busy={isSubmitting}
              className={`${INTERACTIVE_BASE} inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700`}
            >
              {isSubmitting && <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
              {isSubmitting ? 'Saving…' : 'Save & Finish'}
            </button>
          </div>
        </form>
    </Modal>
  );
}
