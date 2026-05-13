/**
 * Inline auto match generator — single-row treatment.
 *
 * Renders as one full-bleed row: info copy left, Generate button right,
 * `border-b` only — no card, no radius, no background. The destructive
 * (replace existing) flow still pre-confirms before destroying state.
 *
 * Incomplete-doubles warning, when non-empty, surfaces as a second
 * full-bleed warning row below the gen row (same hairline treatment).
 */
import { useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { useTournamentStore } from '../../store/tournamentStore';
import type { MatchDTO } from '../../api/dto';

function expandRanks(counts: Record<string, number> | undefined): string[] {
  const out: string[] = [];
  for (const [prefix, count] of Object.entries(counts ?? {})) {
    for (let i = 1; i <= count; i++) out.push(`${prefix}${i}`);
  }
  return out;
}

function isDoublesRank(rank: string): boolean {
  const prefix = rank.replace(/\d+$/, '');
  return prefix.endsWith('D');
}

export function AutoGeneratePanel() {
  const config = useTournamentStore((s) => s.config);
  const players = useTournamentStore((s) => s.players);
  const groups = useTournamentStore((s) => s.groups);
  const importMatches = useTournamentStore((s) => s.importMatches);
  const matches = useTournamentStore((s) => s.matches);

  const ranks = useMemo(() => expandRanks(config?.rankCounts), [config?.rankCounts]);

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

  const buttonLabel = !canGenerate
    ? 'No feasible pairings'
    : confirm && hasExisting
      ? `Click again — replaces ${matches.length}`
      : hasExisting
        ? `Replace ${matches.length} existing`
        : 'Generate matches';

  const buttonClass = !canGenerate
    ? 'cursor-not-allowed text-muted-foreground'
    : confirm && hasExisting
      ? 'border-destructive bg-destructive/10 text-destructive hover:bg-destructive/15'
      : hasExisting
        ? 'border-status-warning/40 text-status-warning hover:bg-status-warning/10'
        : 'border-border text-foreground hover:bg-muted/40';

  const infoLine = !canGenerate
    ? ranks.length === 0
      ? 'No event ranks configured — set them in the Setup tab.'
      : groups.length < 2
        ? 'Need at least 2 schools to generate matches.'
        : 'No feasible pairings with the current roster.'
    : `Will produce ${preview.length} match${preview.length === 1 ? '' : 'es'} across ${ranks.length} rank${ranks.length === 1 ? '' : 's'} × ${groups.length} school${groups.length === 1 ? '' : 's'}${
        hasExisting ? ` · replaces all ${matches.length}` : ''
      }.`;

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Auto-generate
          </span>
          <span className="truncate text-xs text-muted-foreground">{infoLine}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {confirm ? (
            <button
              type="button"
              onClick={() => setConfirm(false)}
              className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
            >
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            onClick={generate}
            disabled={!canGenerate}
            data-testid="auto-generate-matches"
            className={[
              'rounded-sm border px-3 py-1 text-xs font-medium transition-colors duration-fast ease-brand disabled:opacity-50',
              buttonClass,
            ].join(' ')}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
      {incompletePairs.length > 0 ? (
        <div className="border-b border-border bg-status-warning/5 px-5 py-1.5 text-xs text-status-warning">
          <span className="font-medium">Skipping incomplete doubles:</span>{' '}
          {incompletePairs.join(', ')} — assign both partners in the Roster tab.
        </div>
      ) : null}
    </>
  );
}
