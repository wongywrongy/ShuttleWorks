import { EntrantsList } from './EntrantsList';
import type { PlayersDTO } from '../lib/draws.types';

/** One public alphabetical roster; profile links are retained when supplied. */
export function PlayersList({
  slug,
  roster,
  drawsPublished,
}: {
  slug: string;
  roster: PlayersDTO;
  drawsPublished: boolean;
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
    />
  );
}
