/**
 * "Regenerate from roster" — the primary Matches action.
 *
 * The meet's output IS its matches, and matches are derived from the
 * position grid: every feasible cross-school pairing per rank. This
 * control rebuilds those lineup matches from the current roster.
 *
 * It MERGES rather than blind-replaces: a match is a "lineup slot" keyed
 * by (rank, the two schools). Regenerate refreshes every lineup slot from
 * the grid but keeps any match that isn't one of those slots — hand-added
 * custom matches survive as overrides. (Edits to a standard lineup slot
 * are rebuilt from the roster, since the grid is the source of truth.)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { ArrowsClockwise } from '@phosphor-icons/react';
import { useTournamentStore } from '../../../store/tournamentStore';
import { INTERACTIVE_BASE } from '../../../lib/utils';
import type { MatchDTO } from '../../../api/dto';

function expandRanks(counts: Record<string, number> | undefined): string[] {
  const out: string[] = [];
  for (const [prefix, count] of Object.entries(counts ?? {})) {
    for (let i = 1; i <= count; i++) out.push(`${prefix}${i}`);
  }
  return out;
}

function isDoublesRank(rank: string): boolean {
  return rank.replace(/\d+$/, '').endsWith('D');
}

export function RegenerateMenu() {
  const config = useTournamentStore((s) => s.config);
  const players = useTournamentStore((s) => s.players);
  const groups = useTournamentStore((s) => s.groups);
  const importMatches = useTournamentStore((s) => s.importMatches);
  const matches = useTournamentStore((s) => s.matches);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const ranks = useMemo(() => expandRanks(config?.rankCounts), [config?.rankCounts]);
  const groupByPlayer = useMemo(
    () => new Map(players.map((p) => [p.id, p.groupId])),
    [players],
  );

  // A lineup slot's identity: rank + the two schools (order-independent).
  const slotKey = (m: {
    eventRank?: string | null;
    sideA: string[];
    sideB: string[];
  }) => {
    const rank = m.eventRank ?? '';
    const a = groupByPlayer.get(m.sideA[0] ?? '') ?? '?';
    const b = groupByPlayer.get(m.sideB[0] ?? '') ?? '?';
    const [s1, s2] = [a, b].sort();
    return `${rank}|${s1}|${s2}`;
  };

  const generated = useMemo(() => {
    const out: MatchDTO[] = [];
    for (const rank of ranks) {
      const needed = isDoublesRank(rank) ? 2 : 1;
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

  // Existing matches that aren't a regenerated lineup slot — kept as
  // custom overrides.
  const generatedKeys = useMemo(
    () => new Set(generated.map(slotKey)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [generated, groupByPlayer],
  );
  const keptCustom = matches.filter((m) => !generatedKeys.has(slotKey(m)));

  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', click);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const canGenerate = generated.length > 0;

  const regenerate = () => {
    importMatches([...generated, ...keptCustom]);
    setOpen(false);
  };

  const infoLine = !canGenerate
    ? ranks.length === 0
      ? 'No event ranks configured — set them in Configuration.'
      : groups.length < 2
        ? 'Need at least 2 schools to generate matches.'
        : 'No feasible pairings with the current roster.'
    : `Rebuild ${generated.length} lineup match${generated.length === 1 ? '' : 'es'} from the roster${
        keptCustom.length > 0
          ? ` · keeps ${keptCustom.length} custom match${keptCustom.length === 1 ? '' : 'es'}`
          : ''
      }.`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="regenerate-toggle"
        className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1.5 rounded-sm bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity duration-fast ease-brand hover:opacity-90`}
      >
        <ArrowsClockwise aria-hidden="true" className="h-3.5 w-3.5" />
        Regenerate from roster
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Regenerate matches from roster"
          className="motion-enter absolute right-0 top-full z-overlay mt-1 w-72 rounded-sm border border-border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          <div className="mb-1 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Regenerate from roster
          </div>
          <p className="text-xs text-muted-foreground">{infoLine}</p>
          {incompletePairs.length > 0 ? (
            <p className="mt-2 border-l-2 border-status-warning/50 bg-status-warning/5 px-2 py-1 text-xs text-status-warning">
              <span className="font-medium">Skipping incomplete doubles:</span>{' '}
              {incompletePairs.join(', ')} — assign both partners in Roster.
            </p>
          ) : null}
          <div className="mt-3 flex items-center justify-end">
            <button
              type="button"
              onClick={regenerate}
              disabled={!canGenerate}
              data-testid="regenerate-confirm"
              className="rounded-sm border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors duration-fast ease-brand hover:bg-muted/40 disabled:opacity-50"
            >
              Regenerate
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
