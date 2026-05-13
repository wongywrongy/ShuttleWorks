/**
 * Inline score editors used by MatchDetailsPanel.
 *
 * Two formats live in one file because they share callers, prop
 * shapes, and styling — splitting them further would just add
 * import noise. ``ScoreEditor`` picks the right inner editor
 * based on the tournament's scoring format.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { INTERACTIVE_BASE } from '../../lib/utils';
import type { MatchDTO, MatchStateDTO, SetScore, TournamentConfig } from '../../api/dto';

interface ScoreEditorProps {
  match: MatchDTO;
  matchState: MatchStateDTO | undefined;
  config: TournamentConfig | null;
  playerNames: Map<string, string>;
  onSubmit: (data: {
    score: { sideA: number; sideB: number };
    sets?: SetScore[];
    notes?: string;
  }) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

/** Inline score editor. Renders inside the side rail in place of
 *  the Actions row. Format-aware:
 *  - simple    → two number inputs
 *  - badminton → per-set rows + a per-match override for sets-to-win,
 *                points-per-set, and deuce. Defaults come from the
 *                tournament config but can be tuned for this match
 *                only without leaving the rail. */
export function ScoreEditor({
  match,
  matchState,
  config,
  playerNames,
  onSubmit,
  onCancel,
  isSubmitting,
}: ScoreEditorProps) {
  const isBadminton = config?.scoringFormat === 'badminton';

  const sideAName = (match.sideA ?? []).map((id) => playerNames.get(id) ?? id).join(' & ') || 'Side A';
  const sideBName = (match.sideB ?? []).map((id) => playerNames.get(id) ?? id).join(' & ') || 'Side B';

  if (!isBadminton) {
    return (
      <SimpleScoreEditor
        sideAName={sideAName}
        sideBName={sideBName}
        initial={matchState?.score}
        onCancel={onCancel}
        onSubmit={(score, notes) => onSubmit({ score, notes })}
        isSubmitting={isSubmitting}
      />
    );
  }

  return (
    <BadmintonInlineEditor
      sideAName={sideAName}
      sideBName={sideBName}
      defaultSetsToWin={config?.setsToWin ?? 2}
      defaultPointsPerSet={config?.pointsPerSet ?? 21}
      defaultDeuceEnabled={config?.deuceEnabled ?? true}
      initialSets={matchState?.sets}
      onCancel={onCancel}
      onSubmit={(sets) => {
        const setsWonA = sets.filter((s) => s.sideA > s.sideB).length;
        const setsWonB = sets.filter((s) => s.sideB > s.sideA).length;
        return onSubmit({
          score: { sideA: setsWonA, sideB: setsWonB },
          sets,
          notes: undefined,
        });
      }}
      isSubmitting={isSubmitting}
    />
  );
}

// ── Simple inline score ─────────────────────────────────────────────
function SimpleScoreEditor({
  sideAName,
  sideBName,
  initial,
  onCancel,
  onSubmit,
  isSubmitting,
}: {
  sideAName: string;
  sideBName: string;
  initial?: { sideA: number; sideB: number };
  onCancel: () => void;
  onSubmit: (score: { sideA: number; sideB: number }, notes?: string) => Promise<void>;
  isSubmitting: boolean;
}) {
  const [a, setA] = useState<string>(initial ? String(initial.sideA) : '');
  const [b, setB] = useState<string>(initial ? String(initial.sideB) : '');
  const aRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    aRef.current?.focus();
    aRef.current?.select();
  }, []);

  const canSubmit = a !== '' && b !== '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    await onSubmit({ sideA: parseInt(a, 10) || 0, sideB: parseInt(b, 10) || 0 });
  };

  return (
    <form onSubmit={submit} className="mb-3 border-t border-border pt-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Score
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="h-4 w-4 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted"
          aria-label="Cancel score entry"
        >
          <X aria-hidden="true" className="h-3 w-3" />
        </button>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
        <div className="min-w-0">
          <div className="mb-0.5 truncate text-3xs text-muted-foreground" title={sideAName}>{sideAName}</div>
          <input
            ref={aRef}
            type="number"
            min={0}
            inputMode="numeric"
            value={a}
            onChange={(e) => setA(e.target.value)}
            placeholder="0"
            className="w-full rounded border border-border bg-card px-2 py-1.5 text-center text-base font-mono tabular-nums focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </div>
        <span className="text-muted-foreground">–</span>
        <div className="min-w-0">
          <div className="mb-0.5 truncate text-3xs text-muted-foreground text-right" title={sideBName}>{sideBName}</div>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={b}
            onChange={(e) => setB(e.target.value)}
            placeholder="0"
            className="w-full rounded border border-border bg-card px-2 py-1.5 text-center text-base font-mono tabular-nums focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className={`${INTERACTIVE_BASE} rounded border border-border bg-card px-2 py-1 text-2xs text-foreground hover:bg-muted/40`}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit || isSubmitting}
          className={`${INTERACTIVE_BASE} rounded bg-primary px-2 py-1 text-2xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50`}
        >
          {isSubmitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

// ── Badminton inline editor ─────────────────────────────────────────
function BadmintonInlineEditor({
  sideAName,
  sideBName,
  defaultSetsToWin,
  defaultPointsPerSet,
  defaultDeuceEnabled,
  initialSets,
  onCancel,
  onSubmit,
  isSubmitting,
}: {
  sideAName: string;
  sideBName: string;
  defaultSetsToWin: number;
  defaultPointsPerSet: number;
  defaultDeuceEnabled: boolean;
  initialSets?: SetScore[];
  onCancel: () => void;
  onSubmit: (sets: SetScore[], winner: 'A' | 'B') => Promise<void>;
  isSubmitting: boolean;
}) {
  // Per-match overrides — start at the tournament default but allow
  // tuning right next to the score row (e.g. an exhibition single
  // 21-point set in an otherwise best-of-3 tournament).
  const [setsToWin, setSetsToWin] = useState(defaultSetsToWin);
  const [pointsPerSet, setPointsPerSet] = useState(defaultPointsPerSet);
  const [deuceEnabled, setDeuceEnabled] = useState(defaultDeuceEnabled);
  const [showFormat, setShowFormat] = useState(false);

  const maxSets = setsToWin * 2 - 1;
  const maxPoints = deuceEnabled ? (pointsPerSet === 21 ? 30 : pointsPerSet + 10) : pointsPerSet;

  const padSets = (existing?: SetScore[]): SetScore[] => {
    const out: SetScore[] = [];
    for (let i = 0; i < maxSets; i++) {
      out.push(existing?.[i] ?? { sideA: 0, sideB: 0 });
    }
    return out;
  };
  const [sets, setSets] = useState<SetScore[]>(() => padSets(initialSets));

  // Keep the array length in sync with the format choice.
  useEffect(() => {
    setSets((prev) => padSets(prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxSets]);

  const setWinners = useMemo(() => {
    return sets.map((s) => {
      if (s.sideA === 0 && s.sideB === 0) return null;
      const reach = (n: number) => n >= pointsPerSet;
      const twoAhead = (x: number, y: number) => x - y >= 2;
      if (reach(s.sideA) && s.sideA > s.sideB) {
        if (!deuceEnabled || twoAhead(s.sideA, s.sideB) || s.sideA >= maxPoints) return 'A';
      }
      if (reach(s.sideB) && s.sideB > s.sideA) {
        if (!deuceEnabled || twoAhead(s.sideB, s.sideA) || s.sideB >= maxPoints) return 'B';
      }
      return null;
    });
  }, [sets, pointsPerSet, deuceEnabled, maxPoints]);

  const setsWonA = setWinners.filter((w) => w === 'A').length;
  const setsWonB = setWinners.filter((w) => w === 'B').length;
  const matchWinner: 'A' | 'B' | null =
    setsWonA >= setsToWin ? 'A' : setsWonB >= setsToWin ? 'B' : null;

  const updateScore = (i: number, side: 'sideA' | 'sideB', raw: string) => {
    const value = Math.max(0, Math.min(maxPoints, parseInt(raw, 10) || 0));
    setSets((prev) => {
      const next = [...prev];
      const other = side === 'sideA' ? 'sideB' : 'sideA';
      const otherScore = next[i][other];
      next[i] = { ...next[i], [side]: value };
      // Loser-first auto-fill: typing a clearly losing score in an
      // untouched row defaults the other side to ``pointsPerSet``.
      if (value > 0 && value < pointsPerSet - 1 && otherScore === 0) {
        next[i] = { ...next[i], [other]: pointsPerSet };
      }
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchWinner) return;
    const played = sets.slice(0, setsWonA + setsWonB);
    await onSubmit(played, matchWinner);
  };

  const inputCls =
    'w-full rounded border border-border bg-card px-1 py-1 text-center text-sm font-mono tabular-nums focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30';

  return (
    <form onSubmit={submit} className="mb-3 border-t border-border pt-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Score · best of {maxSets}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowFormat((v) => !v)}
            className="rounded px-1.5 py-0.5 text-3xs text-muted-foreground hover:bg-muted"
            title="Adjust format for this match"
          >
            {showFormat ? 'Done' : 'Format'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-4 w-4 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted"
            aria-label="Cancel score entry"
          >
            <X aria-hidden="true" className="h-3 w-3" />
          </button>
        </div>
      </div>

      {showFormat && (
        <div className="mb-2 grid grid-cols-2 gap-1.5 rounded border border-border bg-card p-1.5 text-3xs">
          <label className="flex items-center justify-between gap-1">
            <span className="text-muted-foreground">Sets to win</span>
            <select
              value={setsToWin}
              onChange={(e) => setSetsToWin(parseInt(e.target.value, 10))}
              className="rounded border border-border bg-card px-1 py-0.5 text-3xs font-mono"
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n} (BO{n * 2 - 1})
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-1">
            <span className="text-muted-foreground">Pts/set</span>
            <select
              value={pointsPerSet}
              onChange={(e) => setPointsPerSet(parseInt(e.target.value, 10))}
              className="rounded border border-border bg-card px-1 py-0.5 text-3xs font-mono"
            >
              {[11, 15, 21].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="col-span-2 flex items-center justify-between gap-1">
            <span className="text-muted-foreground">Deuce (cap {pointsPerSet === 21 ? 30 : pointsPerSet + 10})</span>
            <input
              type="checkbox"
              checked={deuceEnabled}
              onChange={(e) => setDeuceEnabled(e.target.checked)}
              className="h-3 w-3"
            />
          </label>
        </div>
      )}

      <div className="mb-1 grid grid-cols-[2.5rem_minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-1.5 text-3xs text-muted-foreground">
        <span></span>
        <span className="truncate" title={sideAName}>{sideAName}</span>
        <span></span>
        <span className="truncate text-right" title={sideBName}>{sideBName}</span>
      </div>

      <div className="space-y-1">
        {sets.map((s, i) => {
          const wonBy = setWinners[i];
          const decided = matchWinner !== null && i >= setsWonA + setsWonB;
          return (
            <div
              key={i}
              className={`grid grid-cols-[2.5rem_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 ${
                decided ? 'opacity-40' : ''
              }`}
            >
              <span className="text-3xs uppercase tracking-wide text-muted-foreground">Set {i + 1}</span>
              <input
                type="number"
                min={0}
                max={maxPoints}
                inputMode="numeric"
                disabled={decided}
                value={s.sideA || ''}
                onChange={(e) => updateScore(i, 'sideA', e.target.value)}
                placeholder="—"
                className={`${inputCls} ${wonBy === 'A' ? 'border-green-500 bg-green-50 font-semibold text-green-800 dark:bg-green-500/15 dark:text-green-300' : ''}`}
              />
              <span className="text-muted-foreground">–</span>
              <input
                type="number"
                min={0}
                max={maxPoints}
                inputMode="numeric"
                disabled={decided}
                value={s.sideB || ''}
                onChange={(e) => updateScore(i, 'sideB', e.target.value)}
                placeholder="—"
                className={`${inputCls} ${wonBy === 'B' ? 'border-green-500 bg-green-50 font-semibold text-green-800 dark:bg-green-500/15 dark:text-green-300' : ''}`}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between rounded bg-card px-2 py-1 text-2xs">
        <span className="text-muted-foreground">Sets</span>
        <span className="font-mono tabular-nums text-foreground">
          <span className={matchWinner === 'A' ? 'font-semibold text-green-700 dark:text-green-300' : ''}>{setsWonA}</span>
          <span className="mx-1 text-muted-foreground">–</span>
          <span className={matchWinner === 'B' ? 'font-semibold text-green-700 dark:text-green-300' : ''}>{setsWonB}</span>
        </span>
      </div>

      <div className="mt-2 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className={`${INTERACTIVE_BASE} rounded border border-border bg-card px-2 py-1 text-2xs text-foreground hover:bg-muted/40`}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!matchWinner || isSubmitting}
          className={`${INTERACTIVE_BASE} rounded bg-primary px-2 py-1 text-2xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50`}
        >
          {isSubmitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
