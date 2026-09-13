/**
 * Inline score editors used by MatchDetailsPanel.
 *
 * Two formats live in one file because they share callers, prop
 * shapes, and styling — splitting them further would just add
 * import noise. ``ScoreEditor`` picks the right inner editor
 * based on the tournament's scoring format.
 */
import { useEffect, useRef, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { Select } from '@scheduler/design-system/components';
import { EYEBROW_CLASS, INTERACTIVE_BASE, ACCENT_PRESS } from '../../../lib/utils';
import {
  ResultEntryForm,
  effectiveScoringRules,
} from '../../../components/control-plane';
import type { MatchDTO, MatchStateDTO, SetScore, TournamentConfig } from '../../../api/dto';

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
      pointCap={config?.pointCap ?? null}
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
        <span className={`${EYEBROW_CLASS} text-muted-foreground`}>
          Score
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted"
          aria-label="Cancel score entry"
        >
          <X aria-hidden="true" className="h-3 w-3" />
        </button>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
        <div className="min-w-0">
          <div className="mb-0.5 break-words text-xs text-muted-foreground">{sideAName}</div>
          <input
            ref={aRef}
            type="number"
            min={0}
            inputMode="numeric"
            value={a}
            onChange={(e) => setA(e.target.value)}
            placeholder="0"
            aria-label={`Score for ${sideAName}`}
            className="w-full rounded border border-border bg-card px-2 py-1.5 text-center text-base sw-num tabular-nums focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </div>
        <span className="text-muted-foreground">–</span>
        <div className="min-w-0">
          <div className="mb-0.5 break-words text-xs text-muted-foreground text-right">{sideBName}</div>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={b}
            onChange={(e) => setB(e.target.value)}
            aria-label={`Score for ${sideBName}`}
            placeholder="0"
            className="w-full rounded border border-border bg-card px-2 py-1.5 text-center text-base sw-num tabular-nums focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className={`${INTERACTIVE_BASE} rounded border border-border bg-card px-2 py-1 text-xs text-foreground hover:bg-muted/40`}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit || isSubmitting}
          className={`${INTERACTIVE_BASE} rounded bg-accent px-2 py-1 text-xs font-medium text-accent-ink ${ACCENT_PRESS} disabled:opacity-50`}
        >
          {isSubmitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

// ── Badminton inline editor ─────────────────────────────────
/**
 * O7: the games/winner half of this editor is the SHARED `ResultEntryForm`,
 * the same body the bracket's Record result dialog and the match lists use.
 * Live keeps it INLINE in the persistent rail — a modal cycle per score is
 * exactly the wrong shape for repeated scoring — and adds the one thing only
 * this surface has: a per-match format override, passed down as the form's
 * `children` so it sits above the fields and re-renders them with new rules.
 *
 * What went with the old bespoke body: the "loser-first" auto-fill (typing a
 * losing score guessed 21 for the other side — a guess written into a stored
 * result) and the pre-seeded 0-0 in every unplayed game. A blank game now
 * stays blank.
 */
function BadmintonInlineEditor({
  sideAName,
  sideBName,
  defaultSetsToWin,
  defaultPointsPerSet,
  defaultDeuceEnabled,
  pointCap,
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
  pointCap: number | null;
  initialSets?: SetScore[];
  onCancel: () => void;
  onSubmit: (sets: SetScore[], winner: 'A' | 'B') => Promise<void>;
  isSubmitting: boolean;
}) {
  // Per-match overrides — start at the tournament default but allow tuning
  // right next to the score row (e.g. an exhibition single 21-point set in an
  // otherwise best-of-3 tournament).
  const [setsToWin, setSetsToWin] = useState(defaultSetsToWin);
  const [pointsPerSet, setPointsPerSet] = useState(defaultPointsPerSet);
  const [deuceEnabled, setDeuceEnabled] = useState(defaultDeuceEnabled);
  const [showFormat, setShowFormat] = useState(false);

  const rules = effectiveScoringRules({ setsToWin, pointsPerSet, deuceEnabled, pointCap });

  return (
    <div className="mb-3 border-t border-border pt-2">
      <div className="mb-1 flex items-center justify-between">
        <span className={`${EYEBROW_CLASS} text-muted-foreground`}>
          Score · best of {setsToWin * 2 - 1}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowFormat((v) => !v)}
            className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted"
            title="Adjust format for this match"
          >
            {showFormat ? 'Done' : 'Format'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted"
            aria-label="Cancel score entry"
          >
            <X aria-hidden="true" className="h-3 w-3" />
          </button>
        </div>
      </div>

      <ResultEntryForm
        sideALabel={sideAName}
        sideBLabel={sideBName}
        rules={rules}
        initialSets={initialSets}
        submitLabel="Save"
        saveState={isSubmitting ? 'saving' : 'idle'}
        onSubmit={(value) => onSubmit(value.sets, value.winner)}
        onCancel={onCancel}
        testId="live-score-form"
      >
        {showFormat ? (
          <div className="grid grid-cols-2 gap-1.5 rounded border border-border bg-card p-1.5 text-xs">
            <label className="flex items-center justify-between gap-1">
              <span className="text-muted-foreground">Sets to win</span>
              <Select
                value={String(setsToWin)}
                onValueChange={(v) => setSetsToWin(parseInt(v, 10))}
                options={[1, 2, 3].map((n) => ({
                  value: String(n),
                  label: `${n} (BO${n * 2 - 1})`,
                }))}
                ariaLabel="Sets to win"
                size="sm"
                mono
                triggerClassName="h-6 px-1 text-xs"
              />
            </label>
            <label className="flex items-center justify-between gap-1">
              <span className="text-muted-foreground">Pts/set</span>
              <Select
                value={String(pointsPerSet)}
                onValueChange={(v) => setPointsPerSet(parseInt(v, 10))}
                options={[11, 15, 21].map((n) => ({
                  value: String(n),
                  label: String(n),
                }))}
                ariaLabel="Points per set"
                size="sm"
                mono
                triggerClassName="h-6 px-1 text-xs"
              />
            </label>
            <label className="col-span-2 flex items-center justify-between gap-1">
              <span className="text-muted-foreground">Deuce (cap {rules.cap})</span>
              <input
                type="checkbox"
                checked={deuceEnabled}
                onChange={(e) => setDeuceEnabled(e.target.checked)}
                className="h-3 w-3"
              />
            </label>
          </div>
        ) : null}
      </ResultEntryForm>
    </div>
  );
}
