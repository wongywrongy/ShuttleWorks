/**
 * Bracket Roster tab — flat list + detail panel below. Slimmer than
 * the meet's RosterTab (no schools/positions). Player events are a
 * derived read-only display sourced from the EventsTab participants.
 */
import { useState, useMemo, useContext } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { useTournamentStore } from '../../store/tournamentStore';
import { INTERACTIVE_BASE } from '../../lib/utils';
import { ActionsBar } from '../../components/control-plane';
import { BracketApiContext } from '../../api/bracketClient';
import { useBracket } from '../../hooks/useBracket';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import { playerSlug } from '../../lib/playerSlug';

export function BracketRosterTab() {
  // Use context presence check to determine if we're inside a provider.
  // When rendered in tests (no BracketApiProvider), bracket is null.
  const hasProvider = useContext(BracketApiContext) !== null;

  return hasProvider ? <BracketRosterTabInner /> : <BracketRosterTabCore bracketData={null} />;
}

/** Rendered when inside a BracketApiProvider — can safely call useBracket. */
function BracketRosterTabInner() {
  const { data: bracket } = useBracket();
  return <BracketRosterTabCore bracketData={bracket} />;
}

/** Core roster list + detail panel. Accepts nullable bracket data so it can
 *  render in tests (no provider) with events badges simply omitted. */
function BracketRosterTabCore({ bracketData }: { bracketData: BracketTournamentDTO | null }) {
  const players = useTournamentStore((s) => s.bracketPlayers);
  const addPlayer = useTournamentStore((s) => s.addBracketPlayer);
  const updatePlayer = useTournamentStore((s) => s.updateBracketPlayer);
  const deletePlayer = useTournamentStore((s) => s.deleteBracketPlayer);

  // Derived view: which event discipline(s) does each player appear in?
  // We look up participant IDs in play_units to find which event they
  // are scheduled in, then resolve the event discipline label for display.
  const eventsByPlayerId = useMemo(() => {
    const out = new Map<string, string[]>();
    if (!bracketData) return out;
    const disciplineById = Object.fromEntries(
      bracketData.events.map((e) => [e.id, e.discipline]),
    );
    for (const part of bracketData.participants) {
      // Collect event disciplines this participant appears in via play_units.
      const disciplines = Array.from(
        new Set(
          bracketData.play_units
            .filter(
              (pu) =>
                pu.side_a?.includes(part.id) || pu.side_b?.includes(part.id),
            )
            .map((pu) => disciplineById[pu.event_id] ?? pu.event_id),
        ),
      );
      if (disciplines.length === 0) continue;
      // For doubles teams, member slugs share the same event badges.
      const ids =
        part.members && part.members.length > 0 ? part.members : [part.id];
      for (const id of ids) {
        const arr = out.get(id) ?? [];
        out.set(id, Array.from(new Set([...arr, ...disciplines])));
      }
    }
    return out;
  }, [bracketData]);

  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = players.find((p) => p.id === selectedId) ?? null;

  const filtered = players.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()),
  );

  const commitAdd = () => {
    const name = draft.trim();
    if (!name) {
      setAdding(false);
      setDraft('');
      return;
    }
    const id = playerSlug(name);
    if (players.some((p) => p.id === id)) {
      setAdding(false);
      setDraft('');
      return;
    }
    addPlayer({ id, name });
    setAdding(false);
    setDraft('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <ActionsBar
        title="Roster"
        status={
          <>
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {players.length} player{players.length === 1 ? '' : 's'}
            </span>
            {query.trim() && filtered.length !== players.length ? (
              <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                · showing {filtered.length}
              </span>
            ) : null}
          </>
        }
      >
        <div className="relative">
          <MagnifyingGlass
            aria-hidden="true"
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players…"
            aria-label="Search players"
            className="h-7 w-56 rounded-sm border border-border bg-card pl-7 pr-2 text-xs outline-none transition-colors duration-fast ease-brand placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent/30"
          />
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1 rounded-sm bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity duration-fast ease-brand hover:opacity-90`}
        >
          ＋ Add player
        </button>
      </ActionsBar>

      {/* Column-label row — same vocabulary as the meet's flat tables. */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-muted/40 px-4 py-1.5 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <span className="flex-1">Player</span>
        <span className="flex-1">Events</span>
        <span className="w-16 text-right">Actions</span>
      </div>

      <ul className="min-h-0 flex-1 overflow-auto divide-y divide-border">
        {filtered.map((p) => (
          <li
            key={p.id}
            className={`flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-muted/30 ${
              selectedId === p.id ? 'bg-muted/40' : ''
            }`}
            onClick={() => setSelectedId(p.id)}
          >
            <span className="flex-1 text-sm text-foreground">{p.name}</span>
            <span className="flex-1 text-2xs font-mono uppercase tracking-[0.18em] text-muted-foreground">
              {(eventsByPlayerId.get(p.id) ?? []).join(' · ')}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                deletePlayer(p.id);
                if (selectedId === p.id) setSelectedId(null);
              }}
              aria-label="Delete"
              className="w-16 text-right text-2xs text-destructive hover:underline"
            >
              Delete
            </button>
          </li>
        ))}
        {adding && (
          <li className="px-4 py-2">
            <input
              autoFocus
              type="text"
              placeholder="New player name…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitAdd}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitAdd();
                if (e.key === 'Escape') {
                  setAdding(false);
                  setDraft('');
                }
              }}
              className="w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </li>
        )}
        {filtered.length === 0 && !adding && (
          <li className="px-4 py-6 text-sm text-muted-foreground">
            {players.length === 0
              ? 'No players yet — add the first one.'
              : 'No players match the search.'}
          </li>
        )}
      </ul>

      {selected && (
        <section className="border-t border-border bg-card px-4 py-3">
          <h2 className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">
            Player detail · {selected.name}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Notes
              </span>
              <input
                key={selected.id + '-notes'}
                type="text"
                defaultValue={selected.notes ?? ''}
                onBlur={(e) => {
                  if (e.target.value !== (selected.notes ?? '')) {
                    updatePlayer(selected.id, { notes: e.target.value });
                  }
                }}
                className="w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Rest constraint (slots)
              </span>
              <input
                key={selected.id + '-rest'}
                type="number"
                min={0}
                defaultValue={selected.restSlots ?? 0}
                onBlur={(e) => {
                  const next = Number(e.target.value);
                  if (next !== (selected.restSlots ?? 0)) {
                    updatePlayer(selected.id, { restSlots: next });
                  }
                }}
                className="w-full rounded-sm border border-border bg-bg-elev px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>
          <p className="mt-3 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Events:{' '}
            {(eventsByPlayerId.get(selected.id) ?? []).join(', ') || '—'}
          </p>
        </section>
      )}
    </div>
  );
}
