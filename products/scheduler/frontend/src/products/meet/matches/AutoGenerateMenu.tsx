/**
 * Auto-generate affordance for the Matches actions bar.
 *
 * A compact secondary button that opens a popover with the build-from-
 * roster summary, the incomplete-doubles caveat, and the generate /
 * replace-existing flow. This replaces the old full-bleed banner strip
 * that lived in the content area — the actions bar now owns it, since
 * generating matches acts on the whole page.
 *
 * The generation logic (feasible-pairing preview, replace confirm,
 * incomplete-doubles detection) is unchanged from the prior panel.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { Sparkle } from '@phosphor-icons/react';
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
  const prefix = rank.replace(/\d+$/, '');
  return prefix.endsWith('D');
}

export function AutoGenerateMenu() {
  const config = useTournamentStore((s) => s.config);
  const players = useTournamentStore((s) => s.players);
  const groups = useTournamentStore((s) => s.groups);
  const importMatches = useTournamentStore((s) => s.importMatches);
  const matches = useTournamentStore((s) => s.matches);

  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirm(false);
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setConfirm(false);
      }
    };
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', click);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const hasExisting = matches.length > 0;
  const canGenerate = preview.length > 0;

  const generate = () => {
    if (hasExisting && !confirm) {
      setConfirm(true);
      return;
    }
    importMatches(preview);
    setConfirm(false);
    setOpen(false);
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
      ? 'No event ranks configured — set them in Configuration.'
      : groups.length < 2
        ? 'Need at least 2 schools to generate matches.'
        : 'No feasible pairings with the current roster.'
    : `Will produce ${preview.length} match${preview.length === 1 ? '' : 'es'} across ${ranks.length} rank${ranks.length === 1 ? '' : 's'} × ${groups.length} school${groups.length === 1 ? '' : 's'}${
        hasExisting ? ` · replaces all ${matches.length}` : ''
      }.`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="auto-generate-toggle"
        className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 text-xs text-card-foreground transition-colors duration-fast ease-brand hover:bg-muted/40 hover:text-foreground`}
      >
        <Sparkle aria-hidden="true" className="h-3.5 w-3.5" />
        Auto-generate
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Auto-generate matches"
          className="motion-enter absolute right-0 top-full z-overlay mt-1 w-72 rounded-sm border border-border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          <div className="mb-1 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Auto-generate
          </div>
          <p className="text-xs text-muted-foreground">{infoLine}</p>
          {incompletePairs.length > 0 ? (
            <p className="mt-2 border-l-2 border-status-warning/50 bg-status-warning/5 px-2 py-1 text-xs text-status-warning">
              <span className="font-medium">Skipping incomplete doubles:</span>{' '}
              {incompletePairs.join(', ')} — assign both partners in Roster.
            </p>
          ) : null}
          <div className="mt-3 flex items-center justify-end gap-2">
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
      ) : null}
    </div>
  );
}
