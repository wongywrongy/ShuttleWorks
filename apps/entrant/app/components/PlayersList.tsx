import { EntrantsList } from './EntrantsList';
import type { PlayersDTO } from '../lib/draws.types';

/** One public alphabetical roster; profile links are retained when supplied. */
export function PlayersList({
  slug,
  roster,
  drawsPublished,
  query = '',
  event = '',
}: {
  slug: string;
  roster: PlayersDTO;
  drawsPublished: boolean;
  /** The URL's `?q=` — the directory search, applied server-side (P7). */
  query?: string;
  /** The URL's `?event=` — the directory's event filter, applied server-side. */
  event?: string;
}) {
  if (roster.players.length === 0) {
    return <p className="text-muted-foreground">No players published yet.</p>;
  }
  return (
    <EntrantsList
      slug={slug}
      entrants={roster.players}
      noun="player"
      linkEventsToDraws={drawsPublished}
      query={query}
      event={event}
      action={`/e/${encodeURIComponent(slug)}`}
      hidden={[{ name: 'tab', value: 'players' }]}
    />
  );
}
