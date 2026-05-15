/**
 * Bracket Roster tab — flat list + detail panel below. Slimmer than
 * the meet's RosterTab (no schools/positions). Player events are a
 * derived read-only display sourced from the EventsTab participants.
 */
import { useState, useMemo, useContext } from 'react';
import { useTournamentStore } from '../../store/tournamentStore';
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
    <div className="min-h-full bg-background">
      <main className="mx-auto max-w-4xl px-6 py-8 space-y-6">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Players ({players.length})
            </h2>
            <div className="flex gap-2 items-center">
              <input
                type="search"
                placeholder="Search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="rounded-sm border border-border bg-bg-elev px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="rounded-sm border border-border bg-bg-elev px-3 py-1 text-sm hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                + Add player
              </button>
            </div>
          </div>
          <ul className="divide-y divide-border border border-border rounded-sm">
            {filtered.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between px-3 py-2 hover:bg-muted/30 cursor-pointer"
                onClick={() => setSelectedId(p.id)}
              >
                <span className="text-sm">{p.name}</span>
                <span className="text-2xs font-mono uppercase tracking-[0.18em] text-muted-foreground flex-1 px-2">
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
                  className="text-2xs text-destructive hover:underline"
                >
                  Delete
                </button>
              </li>
            ))}
            {adding && (
              <li className="px-3 py-2">
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
          </ul>
        </section>

        {selected && (
          <section>
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
      </main>
    </div>
  );
}
