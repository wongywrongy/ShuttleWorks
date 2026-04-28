/**
 * Inline auto match generator. Produces one match per rank × unordered
 * school pair: for every rank the config defines, pair each pair of schools
 * with the players of that rank.
 *
 * Replaces the old AutoMatchGenerator dialog. Shows a preview count before
 * committing so the user knows what they're about to create.
 */
import { useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { useAppStore } from '../../store/appStore';
import { Hint } from '../../components/Hint';
import type { MatchDTO } from '../../api/dto';

function expandRanks(counts: Record<string, number> | undefined): string[] {
  const out: string[] = [];
  for (const [prefix, count] of Object.entries(counts ?? {})) {
    for (let i = 1; i <= count; i++) out.push(`${prefix}${i}`);
  }
  return out;
}

/** True when a rank's event is a doubles event (MD/WD/XD) — two players per side. */
function isDoublesRank(rank: string): boolean {
  const prefix = rank.replace(/\d+$/, '');
  return prefix.endsWith('D');
}

export function AutoGeneratePanel() {
  const config = useAppStore((s) => s.config);
  const players = useAppStore((s) => s.players);
  const groups = useAppStore((s) => s.groups);
  const importMatches = useAppStore((s) => s.importMatches);
  const matches = useAppStore((s) => s.matches);

  const ranks = useMemo(() => expandRanks(config?.rankCounts), [config?.rankCounts]);

  // Preview: one match per rank × unordered pair of schools. Singles events
  // take one player per side; doubles events take both paired players per
  // side (the two in that school whose ranks[] include this rank). Skip
  // ranks where either side doesn't have the right number of eligible
  // players — an incomplete doubles pair or no singles player at all.
  const preview = useMemo(() => {
    const out: MatchDTO[] = [];
    for (const rank of ranks) {
      const doubles = isDoublesRank(rank);
      const needed = doubles ? 2 : 1;
      for (let i = 0; i < groups.length; i++) {
        for (let j = i + 1; j < groups.length; j++) {
          const sideAPlayers = players.filter(
            (p) => p.groupId === groups[i].id && (p.ranks ?? []).includes(rank),
          );
          const sideBPlayers = players.filter(
            (p) => p.groupId === groups[j].id && (p.ranks ?? []).includes(rank),
          );
          if (sideAPlayers.length < needed || sideBPlayers.length < needed) continue;
          out.push({
            id: uuid(),
            sideA: sideAPlayers.slice(0, needed).map((p) => p.id),
            sideB: sideBPlayers.slice(0, needed).map((p) => p.id),
            matchType: 'dual',
            eventRank: rank,
            durationSlots: 1,
          });
        }
      }
    }
    return out;
  }, [ranks, groups, players]);

  // Count how many ranks are skipped because a side has an incomplete pair —
  // surfaces the common "only rostered 1 MD1 player" mistake.
  const incompletePairs = useMemo(() => {
    const out: string[] = [];
    for (const rank of ranks) {
      if (!isDoublesRank(rank)) continue;
      for (let i = 0; i < groups.length; i++) {
        const count = players.filter(
          (p) => p.groupId === groups[i].id && (p.ranks ?? []).includes(rank),
        ).length;
        if (count === 1) out.push(`${groups[i].name} ${rank}`);
      }
    }
    return out;
  }, [ranks, groups, players]);

  const [confirm, setConfirm] = useState(false);

  const hasExisting = matches.length > 0;
  const canGenerate = preview.length > 0;

  const generate = () => {
    if (hasExisting && !confirm) {
      setConfirm(true);
      return;
    }
    importMatches(preview);
    setConfirm(false);
  };

  return (
    <div className="rounded border border-border bg-card p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Auto-generate
        </span>
        <span className="text-[11px] text-muted-foreground">
          {ranks.length} ranks × {groups.length} schools
        </span>
      </div>
      <Hint id="matches.auto-generate" className="mb-2">
        One match per rank × pair of schools. Singles use one player per
        side; doubles use the paired players per side.
      </Hint>
      {preview.length > 0 && (
        <p className="mb-2 text-xs text-muted-foreground">
          Will produce{' '}
          <span className="font-semibold text-foreground">{preview.length}</span>{' '}
          match{preview.length === 1 ? '' : 'es'}.
        </p>
      )}
      {incompletePairs.length > 0 ? (
        <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          <strong>Skipping incomplete doubles:</strong>{' '}
          {incompletePairs.join(', ')} — assign both partners in the Roster tab
          to include these events.
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={!canGenerate}
          data-testid="auto-generate-matches"
          className={[
            'rounded px-3 py-1.5 text-sm font-medium transition-colors',
            !canGenerate
              ? 'cursor-not-allowed bg-muted text-muted-foreground'
              : confirm && hasExisting
                ? 'bg-red-600 text-white hover:bg-red-700 motion-safe:animate-pulse'
                : 'bg-blue-600 text-white hover:bg-blue-700',
          ].join(' ')}
        >
          {!canGenerate
            ? 'No feasible pairings'
            : confirm && hasExisting
              ? `Click again — will replace ${matches.length} match${matches.length === 1 ? '' : 'es'}`
              : hasExisting
                ? 'Generate (replaces existing)'
                : 'Generate matches'}
        </button>
        {confirm ? (
          <button
            type="button"
            onClick={() => setConfirm(false)}
            className="rounded border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted/40"
          >
            Cancel
          </button>
        ) : null}
      </div>
      {ranks.length === 0 ? (
        <p className="mt-2 text-xs italic text-amber-600">
          No event ranks configured — set them in the Setup tab.
        </p>
      ) : groups.length < 2 ? (
        <p className="mt-2 text-xs italic text-amber-600">
          Need at least 2 schools to generate matches.
        </p>
      ) : null}
    </div>
  );
}
